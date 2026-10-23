-- Baseline migration. Rollback is a new forward migration; do not edit after deployment.

create extension if not exists pgcrypto;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_number text not null check (btrim(invoice_number) <> ''),
  customer_name text not null check (btrim(customer_name) <> ''),
  customer_email text not null check (btrim(customer_email) <> ''),
  issue_date date not null,
  due_date date not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'open' check (status in ('open', 'overdue', 'promised', 'disputed', 'paused', 'paid', 'written_off')),
  last_reminder_stage text not null default 'none' check (last_reminder_stage in ('none', 'first', 'second', 'final')),
  provider text,
  provider_invoice_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, invoice_number),
  check ((provider is null) = (provider_invoice_id is null))
);

create table public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  stage text not null check (stage in ('first', 'second', 'final')),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'sent', 'cancelled', 'failed')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  failure_reason text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_id, stage),
  foreign key (tenant_id, invoice_id) references public.invoices (tenant_id, id) on delete cascade
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  provider text not null default 'stripe' check (btrim(provider) <> ''),
  provider_customer_id text,
  provider_subscription_id text not null,
  price_id text,
  status text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index invoices_due_status_idx on public.invoices (tenant_id, due_date, status);
create index reminder_events_schedule_idx on public.reminder_events (tenant_id, status, scheduled_for);

create unique index invoices_provider_identity_idx
  on public.invoices (tenant_id, provider, provider_invoice_id)
  where provider is not null and provider_invoice_id is not null;

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where tenant_id = target_tenant_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.is_tenant_admin(uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;

create or replace function public.prevent_tenant_change()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_tenant_change() from public;

create trigger invoices_tenant_id_immutable
  before update on public.invoices
  for each row execute function public.prevent_tenant_change();

create trigger memberships_tenant_id_immutable
  before update on public.memberships
  for each row execute function public.prevent_tenant_change();

create trigger reminder_events_tenant_id_immutable
  before update on public.reminder_events
  for each row execute function public.prevent_tenant_change();

create trigger subscriptions_tenant_id_immutable
  before update on public.subscriptions
  for each row execute function public.prevent_tenant_change();

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.invoices enable row level security;
alter table public.reminder_events enable row level security;
alter table public.subscriptions enable row level security;

create policy tenants_select_member_or_creator
  on public.tenants for select to authenticated
  using (created_by = (select auth.uid()) or public.is_tenant_member(id));

create policy tenants_insert_creator
  on public.tenants for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy tenants_update_admin
  on public.tenants for update to authenticated
  using (public.is_tenant_admin(id))
  with check (public.is_tenant_admin(id));

create policy memberships_select_member
  on public.memberships for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy memberships_insert_bootstrap_owner
  on public.memberships for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1
      from public.tenants
      where id = tenant_id
        and created_by = (select auth.uid())
    )
  );

create policy memberships_insert_admin
  on public.memberships for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy memberships_update_admin
  on public.memberships for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy memberships_delete_admin
  on public.memberships for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy invoices_member_access
  on public.invoices for all to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

create policy reminder_events_select_member
  on public.reminder_events for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy reminder_events_insert_member
  on public.reminder_events for insert to authenticated
  with check (
    public.is_tenant_member(tenant_id)
    and (created_by = (select auth.uid()) or created_by is null)
  );

create policy reminder_events_update_member
  on public.reminder_events for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

create policy subscriptions_select_member
  on public.subscriptions for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy subscriptions_insert_admin
  on public.subscriptions for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy subscriptions_update_admin
  on public.subscriptions for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy subscriptions_delete_admin
  on public.subscriptions for delete to authenticated
  using (public.is_tenant_admin(tenant_id));
