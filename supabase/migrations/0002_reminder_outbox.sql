-- Durable, tenant-scoped reminder scheduling. Rollback is a new forward migration.

create table public.reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  stage text not null check (stage in ('first', 'second', 'final')),
  status text not null default 'pending' check (status in ('pending', 'leased', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz not null,
  available_at timestamptz not null default now(),
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  attempts integer not null default 0 check (attempts >= 0),
  lease_token uuid,
  leased_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_id, stage),
  unique (idempotency_key),
  foreign key (tenant_id, invoice_id) references public.invoices (tenant_id, id) on delete cascade,
  check ((status = 'leased') = (lease_token is not null and leased_until is not null))
);

create index reminder_outbox_due_idx
  on public.reminder_outbox (available_at, created_at, id)
  where status in ('pending', 'leased');

create trigger reminder_outbox_tenant_id_immutable
  before update on public.reminder_outbox
  for each row execute function public.prevent_tenant_change();

alter table public.reminder_outbox enable row level security;

create policy reminder_outbox_select_member
  on public.reminder_outbox for select to authenticated
  using (public.is_tenant_member(tenant_id));

create or replace function public.enqueue_reminder_outbox(
  p_tenant_id uuid,
  p_invoice_id uuid,
  p_stage text,
  p_scheduled_for timestamptz
)
returns table (created boolean, id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  existing_id uuid;
begin
  insert into public.reminder_outbox (
    tenant_id, invoice_id, stage, scheduled_for, available_at, idempotency_key, payload
  )
  values (
    p_tenant_id,
    p_invoice_id,
    p_stage,
    p_scheduled_for,
    p_scheduled_for,
    format('%s:%s:%s', p_tenant_id, p_invoice_id, p_stage),
    jsonb_build_object('reminderStage', p_stage)
  )
  on conflict (tenant_id, invoice_id, stage) do nothing
  returning reminder_outbox.id into inserted_id;

  if inserted_id is not null then
    return query select true, inserted_id;
    return;
  end if;

  select reminder_outbox.id into existing_id
  from public.reminder_outbox
  where tenant_id = p_tenant_id and invoice_id = p_invoice_id and stage = p_stage;
  return query select false, existing_id;
end;
$$;

create or replace function public.lease_reminder_outbox(
  p_limit integer default 50,
  p_lease_seconds integer default 300
)
returns setof public.reminder_outbox
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.reminder_outbox
    where available_at <= clock_timestamp()
      and (status = 'pending' or (status = 'leased' and leased_until <= clock_timestamp()))
    order by scheduled_for, created_at, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), leased as (
    update public.reminder_outbox as outbox
    set status = 'leased',
        lease_token = gen_random_uuid(),
        leased_until = clock_timestamp() + make_interval(secs => greatest(coalesce(p_lease_seconds, 300), 30)),
        attempts = attempts + 1,
        updated_at = clock_timestamp()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select * from leased;
$$;

create or replace function public.lease_reminder_outbox(
  p_worker_id uuid,
  p_limit integer,
  p_lease_seconds integer
)
returns setof public.reminder_outbox
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id,
           (status = 'leased' and lease_token = p_worker_id and leased_until > clock_timestamp()) as same_lease
    from public.reminder_outbox
    where (
      status = 'pending' and available_at <= clock_timestamp()
    ) or (
      status = 'leased' and (leased_until <= clock_timestamp() or lease_token = p_worker_id)
    )
    order by available_at, created_at, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), leased as (
    update public.reminder_outbox as outbox
    set status = 'leased',
        lease_token = p_worker_id,
        leased_until = case when candidates.same_lease
          then outbox.leased_until
          else clock_timestamp() + make_interval(secs => greatest(coalesce(p_lease_seconds, 300), 30))
        end,
        attempts = attempts + case when candidates.same_lease then 0 else 1 end,
        updated_at = clock_timestamp()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select * from leased;
$$;

revoke all on function public.enqueue_reminder_outbox(uuid, uuid, text, timestamptz) from public;
revoke all on function public.lease_reminder_outbox(integer, integer) from public;
revoke all on function public.lease_reminder_outbox(uuid, integer, integer) from public;
grant execute on function public.enqueue_reminder_outbox(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.lease_reminder_outbox(integer, integer) to service_role;
grant execute on function public.lease_reminder_outbox(uuid, integer, integer) to service_role;
