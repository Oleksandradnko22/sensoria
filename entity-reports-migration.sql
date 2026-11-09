-- Скарги на автора, публікацію автора та відгук про автора.
-- (Скарги на програми/гайди/медитації — content_reports, на коментарі —
-- content_comment_reports / author_post_comment_reports, на людину в чаті —
-- message_reports; адмін-панель збирає їх усі в одному списку.)
-- Нова таблиця, нічого існуючого не змінює.
create table if not exists public.entity_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('author', 'post', 'review')),
  target_id text not null,
  -- Автор / власник об'єкта скарги (для кнопки «До користувача» в адмінці).
  target_owner_id uuid references public.profiles (id) on delete set null,
  target_label text,
  reason text not null check (
    reason in (
      'inappropriate_content',
      'harassment',
      'spam_or_ads',
      'misleading',
      'impersonation',
      'other'
    )
  ),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

-- Одна скарга від однієї людини на один об'єкт.
create unique index if not exists entity_reports_unique_per_reporter
  on public.entity_reports (reporter_id, target_type, target_id);
create index if not exists entity_reports_status_idx
  on public.entity_reports (status, created_at desc);

alter table public.entity_reports enable row level security;

drop policy if exists "users file their own entity reports" on public.entity_reports;
create policy "users file their own entity reports"
  on public.entity_reports for insert
  with check (auth.uid() = reporter_id and (target_owner_id is null or target_owner_id <> auth.uid()));

drop policy if exists "reporters view their own entity reports" on public.entity_reports;
create policy "reporters view their own entity reports"
  on public.entity_reports for select
  using (auth.uid() = reporter_id);
