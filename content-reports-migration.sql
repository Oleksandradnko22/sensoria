-- "•••" → "Поскаржитися" on a meditation (2026-08-30, per Sasha's
-- explicit call — "особливо важливо для emotional wellbeing content").
-- New table, additive only — nothing existing changes.
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  content_item_id text not null,
  content_kind text not null check (content_kind in ('program', 'guide', 'meditation')),
  content_title text not null,
  reason text not null check (
    reason in ('inappropriate_content', 'incorrect_claims', 'other')
  ),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

alter table public.content_reports enable row level security;

create policy "users file their own content reports"
  on public.content_reports for insert
  with check (auth.uid() = reporter_id);

create policy "reporters view their own content reports"
  on public.content_reports for select
  using (auth.uid() = reporter_id);

create policy "reporters delete their own open content reports"
  on public.content_reports for delete
  using (auth.uid() = reporter_id and status = 'open');
