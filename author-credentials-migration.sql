-- ─────────────────────────────────────────────────────────────────────
-- Author professional background: education / training / certificates and
-- work experience, as structured records (not one free-text field).
--
-- PRIVACY MODEL
--   * Every record is PRIVATE until the author flips is_public = true.
--     (is_public defaults to false; nothing is shown by accident.)
--   * Public readers (anon + participants) can read ONLY is_public rows.
--     The author reads / writes only their own rows.
--   * There is NO per-document verification column on purpose: Sensoria has
--     no process that authenticates individual diplomas, so the UI says
--     "вказано автором" and never "підтверджено". The account-level
--     author_details.verified badge is unrelated to these records.
--   * Images live in the existing public bucket `content-files` under
--     `{author_id}/credentials/{record_id}.ext` (author-only writes, see
--     schema.sql). The URL is stored on the row, so it is only discoverable
--     through a row the author made public; paths contain an unguessable
--     uuid. Authors are told not to upload documents with ID numbers.
--   * The legacy author_details.credentials text stays private
--     (verification only) and is NOT displayed publicly.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.author_credentials (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'education'
    check (kind in ('education', 'training', 'certificate')),
  title text not null check (char_length(title) between 1 and 160),
  issuer text check (issuer is null or char_length(issuer) <= 160),
  issued_year int check (issued_year is null or issued_year between 1950 and 2100),
  description text check (description is null or char_length(description) <= 400),
  image_url text,
  is_public boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.author_experience (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  organization text not null check (char_length(organization) between 1 and 160),
  role text check (role is null or char_length(role) <= 160),
  description text check (description is null or char_length(description) <= 500),
  start_year int check (start_year is null or start_year between 1950 and 2100),
  end_year int check (end_year is null or end_year between 1950 and 2100),
  is_current boolean not null default false,
  is_public boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (end_year is null or start_year is null or end_year >= start_year)
);

-- Case stories: an anonymised "запит → що допомагає" written by the author,
-- optionally pointing at one of the author's own materials. No outcome
-- claims; no names. Same privacy model (private until is_public).
create table if not exists public.author_cases (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  situation text check (situation is null or char_length(situation) <= 600),
  approach text check (approach is null or char_length(approach) <= 800),
  content_kind text check (content_kind is null or content_kind in ('program', 'guide', 'meditation')),
  content_id text,
  is_public boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists author_cases_author_idx on public.author_cases (author_id);
alter table public.author_cases enable row level security;
drop policy if exists "cases: public rows or own" on public.author_cases;
create policy "cases: public rows or own" on public.author_cases for select
  using (is_public or author_id = auth.uid());
drop policy if exists "cases: author manages own" on public.author_cases;
create policy "cases: author manages own" on public.author_cases for all
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create index if not exists author_credentials_author_idx on public.author_credentials (author_id);
create index if not exists author_experience_author_idx on public.author_experience (author_id);

alter table public.author_credentials enable row level security;
alter table public.author_experience enable row level security;

drop policy if exists "credentials: public rows or own" on public.author_credentials;
create policy "credentials: public rows or own"
  on public.author_credentials for select
  using (is_public or author_id = auth.uid());

drop policy if exists "credentials: author manages own" on public.author_credentials;
create policy "credentials: author manages own"
  on public.author_credentials for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "experience: public rows or own" on public.author_experience;
create policy "experience: public rows or own"
  on public.author_experience for select
  using (is_public or author_id = auth.uid());

drop policy if exists "experience: author manages own" on public.author_experience;
create policy "experience: author manages own"
  on public.author_experience for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

notify pgrst, 'reload schema';
