create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  tenant_id uuid,
  created_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

create policy stripe_webhook_events_select_admin
  on public.stripe_webhook_events for select to authenticated
  using (tenant_id is not null and public.is_tenant_admin(tenant_id));

