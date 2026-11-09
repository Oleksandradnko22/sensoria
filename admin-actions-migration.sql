-- Audit trail of admin actions (who blocked / unblocked / resolved what, when).
-- Written by the admin-data Edge Function with the service role only.
-- RLS is enabled with NO policies, so nobody can read or write it from the
-- browser — admins see it through the admin panel ("Журнал дій").
--
-- Run once in Supabase -> SQL Editor. Safe to run again.

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_created_at_idx
  on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;
