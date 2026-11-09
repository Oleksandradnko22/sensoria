-- Sensoria — Stage 1 schema draft (backend foundation)
--
-- Run this in Supabase: Project -> SQL Editor -> New query -> paste ->
-- Run. Requires nothing beyond a fresh Supabase project (auth.users
-- already exists out of the box — Supabase Auth manages it, we only
-- extend it below).
--
-- Scope: just enough to replace the mock data in src/data/*.ts with a
-- real database for accounts, content, purchases, reviews and
-- messages. Payment-provider fields, moderation logs, and payout
-- workflow tables are intentionally left out — those get designed in
-- their own later stages (payments, moderation Phase 2, payouts) once
-- Stage 1 is live, so we don't guess their shape now.

-- ── PROFILES ────────────────────────────────────────────────────────
-- One row per authenticated user, 1:1 with auth.users. Holds the
-- fields shared by both roles; role-specific extras live in the two
-- tables below.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('author', 'participant')),
  name text not null,
  avatar_initials text,
  -- Public URL of the person's uploaded profile photo, stored in the
  -- same `content-files` bucket authors already use for covers/PDFs
  -- (path `{user_id}/avatar.{ext}`, upsert on re-upload) — its RLS
  -- policies only check that the first path segment is the uploader's
  -- own auth.uid(), not their role, so this works for both authors and
  -- participants without any new bucket/policy. Null means no photo
  -- uploaded yet — the UI falls back to the initials circle.
  avatar_url text,
  email text not null,
  member_since timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Sensoria's own team, not a self-serve role — nobody can sign up as
  -- an admin. Starts false for everyone; flip it by hand in the SQL
  -- editor for your own account once (see docs), same way the very
  -- first account always has to be bootstrapped for any admin system.
  is_admin boolean not null default false,
  -- Set by an admin from the admin panel — checked on every app boot
  -- (src/lib/auth.ts) to force a sign-out, the simplest real
  -- enforcement without needing a dedicated "you've been banned" screen
  -- yet.
  is_banned boolean not null default false,
  chat_banned_until timestamptz,
  chat_ban_permanent boolean not null default false,
  chat_ban_count int not null default 0,
  chat_ban_since timestamptz,
  -- Real, persisted "Сповіщення" toggle state — keyed by notification
  -- id (the same ids ParticipantProfile.tsx/AuthorSettings.tsx already
  -- use locally, e.g. "message", "reply"), each value `{ "email": bool }`
  -- (push was removed — see src/lib/notificationPrefs.ts). Missing keys
  -- fall back to the client's hardcoded defaults — this column only
  -- ever needs to hold what the person actually changed.
  notification_prefs jsonb not null default '{}'::jsonb,
  -- Set the moment someone requests account deletion
  -- (request-account-deletion Edge Function) — null means "not pending
  -- deletion". Deliberately NOT an immediate hard delete: the person
  -- gets a 14-day window to log back in and restore (see
  -- RestoreAccountStep.tsx) before purge-deleted-accounts (a scheduled
  -- Edge Function) actually removes the account for real. Checked in
  -- fetchCurrentProfile() — unlike is_banned, this does NOT force a
  -- sign-out; the person needs to be able to log in to see the restore
  -- screen at all.
  deletion_requested_at timestamptz
);

-- Author-only public-facing fields (bio, credentials, site/instagram —
-- see the "off-platform sales" warning already in AuthorProfile.tsx,
-- these links stay display-only).
create table public.author_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  title text,
  bio text,
  credentials text,
  verified boolean not null default false,
  site text,
  instagram text
);

-- ── CONTENT ─────────────────────────────────────────────────────────
-- Unifies programs/guides/meditations (src/data/programs.ts,
-- guides.ts, meditations.ts) into one table with a `kind` discriminator
-- instead of three separate files — one source of truth the frontend
-- can query and filter, same as getContentInfo() already does client-
-- side against the mocks today.
create table public.content (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('program', 'guide', 'meditation')),
  title text not null,
  description text,
  price numeric(10, 2) not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  cover_url text,
  -- Emotional-topic categories (same vocabulary as categoryLabels.ts /
  -- the public catalog's filter chips) — lets a published item actually
  -- get found through the "Стрес" / "Тривожність" / etc. filters
  -- instead of only ever showing up under "Всі".
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_modules (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  order_index int not null default 0,
  title text not null,
  lessons int not null default 1,
  duration_label text,
  video_url text,
  materials_url text
);

-- Real per-lesson content within a module — same shape as the
-- long-standing client-side ContentItem type (src/data/contentTypes.ts,
-- which was deliberately designed to slot a real table in without
-- changing any consuming UI). Until this table existed, a "module" was
-- the smallest real unit an author could edit (one video + one PDF for
-- the whole module, plus a bare lessons COUNT); this is what finally
-- gives every individual lesson inside a module its own video/body/
-- audio/PDF/checklist, editable one at a time in AuthorCourseEditor and
-- rendered one at a time in the Lesson Player (ProgramExperience.tsx).
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.content_modules (id) on delete cascade,
  order_index int not null default 0,
  title text not null,
  type text not null default 'text'
    check (type in ('text', 'video', 'audio', 'image', 'pdf', 'checklist', 'mixed')),
  is_required boolean not null default true,
  body text,
  video_url text,
  audio_url text,
  image_url text,
  file_url text,
  file_name text,
  file_size_label text,
  -- Ordered list of checklist lines (type = 'checklist' items only) —
  -- a plain text[] is enough since these are never individually
  -- checked-off/persisted server-side (completion is per-item, not
  -- per-checklist-line, same as the demo data).
  checklist text[],
  duration_minutes int,
  -- "Спробуйте зараз" — an optional inline practice attached to the
  -- lesson (src/data/contentTypes.ts's PracticeSpec). A single jsonb
  -- column rather than one column per practice type/field, since the
  -- shape genuinely varies by type (text has none of scale's min/max/
  -- labels, choice/checkboxes share `options` but nothing else) and
  -- nothing here ever needs to query inside it — the client reads the
  -- whole object and switches on `.type`.
  practice jsonb,
  -- Full text of the video/audio, pasted in by the author — there's no
  -- reliable way to pull captions from an unlisted YouTube video
  -- client-side (see contentTypes.ts's ContentItem["transcript"]), so
  -- this is manual, not fetched/generated.
  transcript text,
  -- "Перед початком" content warning (contentTypes.ts's
  -- ContentItem["contentWarning"]) — a short author note on sensitive
  -- topics, gating the item's real content until acknowledged (see
  -- content_item_warning_acks below).
  content_warning text
);

create index content_items_module_idx on public.content_items (module_id);

-- ── PURCHASES ───────────────────────────────────────────────────────
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.profiles (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete restrict,
  amount numeric(10, 2) not null,
  status text not null default 'completed'
    check (status in ('completed', 'refunded')),
  purchased_at timestamptz not null default now()
);

-- ── REVIEWS ─────────────────────────────────────────────────────────
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.profiles (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  text text not null,
  author_reply text,
  created_at timestamptz not null default now(),
  unique (participant_id, content_id)
);

-- Separate from `reviews` on purpose: a review there is scoped to one
-- piece of content, this one is scoped to the author as a person (their
-- teaching style, communication, etc.) — a participant can leave both,
-- and one program review does not imply an author review or vice versa.
create table public.author_reviews (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  text text not null,
  created_at timestamptz not null default now(),
  unique (participant_id, author_id)
);

-- ── MESSAGES ────────────────────────────────────────────────────────
-- Client-side moderation (src/utils/contactFilter.ts) already runs
-- before a message is sent; `moderation_action` records what Phase 1
-- decided, ready for the Phase 2 server-side re-check to fill in later
-- without a schema change.
--
-- content_id is `text`, NOT `uuid` (2026-09-29 bugfix — see
-- messages-content-id-text-migration.sql) — "Запитати автора" is wired
-- up for programs, guides, AND meditations (AskAuthorBox.tsx, used from
-- all three *Experience.tsx screens), but only programs are real rows
-- in `content` with a uuid id; guides/meditations are static catalog
-- entries (data/guides.ts / data/meditations.ts) with their own text
-- slug ids (e.g. "quick-grounding") — see contentAuthors.ts's own
-- comment on exactly this gap. A `uuid` column made every message about
-- a guide/meditation fail outright (Postgres rejects the slug as an
-- invalid uuid before the insert even reaches RLS/moderation), which is
-- why this has no FK to `content` either — a slug that isn't a real
-- content row can't reference one. ParticipantMessages.tsx/
-- AuthorMessages.tsx already resolve a message's content_id against
-- guides/meditations client-side (falling back to a real `content` row
-- for programs) — see fetchConversations' own three-way lookup — so
-- this column has always been expected to hold either kind of id.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  content_id text,
  body text not null,
  moderation_action text not null default 'ALLOW'
    check (moderation_action in ('ALLOW', 'WARN', 'BLOCK')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── PAYOUT SETTINGS ─────────────────────────────────────────────────
-- Real requisites an author fills in ahead of when payments actually
-- launch — everything else on the Finance screen (revenue, pending
-- balance, transactions) stays mock until purchases exist for real,
-- but there's no reason requisites collection has to wait for that.
create table public.payout_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  is_registered_entity boolean not null default false,
  bank_name text,
  iban text,
  edrpou text,
  updated_at timestamptz not null default now()
);

alter table public.payout_settings enable row level security;

create policy "authors manage their own payout settings"
  on public.payout_settings for all
  using (auth.uid() = profile_id);

-- ── ASSESSMENT RESULTS ───────────────────────────────────────────────
-- The wellbeing assessment's outcome (src/store/funnelStore.ts's
-- `FunnelInsight`), persisted against the real account instead of only
-- living in sessionStorage. One row per profile, upserted on every
-- completed assessment — "Ваш емоційний профіль" in the participant
-- dashboard always means the latest one, not a history log.
create table public.assessment_results (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  primary_state text not null,
  intensity text not null,
  primary_score int not null,
  secondary_state text,
  supporting_patterns jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);

alter table public.assessment_results enable row level security;

create policy "users manage their own assessment result"
  on public.assessment_results for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- ── MESSAGE MODERATION LOG (Phase 2) ────────────────────────────────
-- Written only by the send-message Edge Function (service-role key),
-- one row per moderation decision — including ALLOW, not just
-- blocked/warned ones, per the design doc's logging requirements. The
-- raw message body is deliberately never stored here, only the
-- redacted signal (categories/detectors/score) — enough for a future
-- admin queue or escalation logic, nothing sensitive to leak.
create table public.message_moderation_log (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  content_id uuid references public.content (id) on delete set null,
  action text not null check (action in ('ALLOW', 'WARN', 'BLOCK')),
  risk_score int not null default 0,
  categories text[] not null default '{}',
  detectors_triggered text[] not null default '{}',
  url_detected boolean not null default false,
  allowlisted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.message_moderation_log enable row level security;
-- Deliberately zero policies — nobody using the anon/authenticated key
-- (i.e. every real client) can read or write this table at all, only
-- the service-role key used inside the Edge Function can (service role
-- always bypasses RLS by design). This is an internal moderation
-- record, not user-facing data; the future admin panel (roadmap item
-- 7) will read it the same way, via its own service-role-backed
-- server call, never directly from the browser.

-- ── MESSAGE REPORTS ──────────────────────────────────────────────────
-- "Поскаржитися" in the messaging UI (ParticipantMessages.tsx) — a
-- participant flagging a specific author/conversation for the Sensoria
-- team to review. The reporter can read and, while still "open",
-- delete their own filed reports ("Мої скарги" in ParticipantReviews.tsx
-- — see the two policies below the insert one). Nobody else can read
-- them directly: not the reported person, not any other client using
-- the anon/authenticated key — that stays team-internal, reviewed via
-- Table Editor or the admin panel's service-role-backed Edge Function
-- (same pattern as message_moderation_log), which is also the only
-- path an author's own dashboard uses to learn *that* a report exists
-- against them (count only, no identity/reason/details — see
-- supabase/functions/author-report-count).
create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  content_id uuid references public.content (id) on delete set null,
  reason text not null check (
    reason in (
      'inappropriate_content',
      'requests_contact_info',
      'offers_off_platform_payment',
      'inappropriate_behavior',
      'other'
    )
  ),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

alter table public.message_reports enable row level security;

create policy "users file their own reports"
  on public.message_reports for insert
  with check (auth.uid() = reporter_id);

-- Added after the fact: a reporter can see their own report history
-- ("Мої скарги" in ParticipantReviews.tsx) — still nobody else's, and
-- still no update/delete (a filed report is a permanent record once
-- submitted, same idea as message_moderation_log).
create policy "reporters view their own reports"
  on public.message_reports for select
  using (auth.uid() = reporter_id);

-- A reporter can withdraw their own report ("Видалити" in
-- ParticipantReviews.tsx's "Мої скарги"), but only while it's still
-- open — once the team has reviewed it, it's a permanent record, same
-- reasoning as message_moderation_log never being editable either.
create policy "reporters delete their own open reports"
  on public.message_reports for delete
  using (auth.uid() = reporter_id and status = 'open');

-- ── CONTENT REPORTS ("•••" → "Поскаржитися" on a meditation, per
-- Sasha's explicit call 2026-08-30 — "особливо важливо для emotional
-- wellbeing content") ───────────────────────────────────────────────
-- Deliberately its own table, not reused from message_reports (reports
-- a PERSON, reported_id not null) or content_comment_reports (reports
-- one COMMENT, comment_id not null): this reports the CONTENT ITEM
-- ITSELF — a meditation whose guidance might be inappropriate or
-- factually wrong, not a person's behavior or a user-left comment.
-- content_item_id is plain text with no FK, same reasoning as every
-- other content_item_* table here — meditations are static
-- data/meditations.ts entries, not rows in public.content. content_kind/
-- content_title are captured as a snapshot at report time, same as
-- refund_requests' content_title/content_kind, so the report keeps
-- describing what was true when filed even if the catalog entry is
-- later renamed. Scoped to meditations in the UI today; content_kind
-- already covers 'program'/'guide' too if this extends there later.
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

-- ── REFUND REQUESTS ─────────────────────────────────────────────────
-- "Запросити повернення коштів" in ParticipantBilling.tsx — only
-- offered within REFUND_WINDOW_DAYS (14) of a purchase, for paid items.
-- purchase_id is nullable and NOT the source of truth for what was
-- bought: real purchases don't exist yet (payments launch is a later
-- stage — see purchaseHistory's comment in participantDashboard.ts),
-- so today every request comes from the mock purchase history, which
-- has no row in `purchases` to point at. content_title/content_kind/
-- amount/purchased_at are captured as a snapshot at request time
-- instead — same reasoning as message_moderation_log never doing a
-- live join: a refund request should keep describing what was true
-- when it was filed, not drift if the underlying content is later
-- renamed or removed. Once real purchases exist, purchase_id can be
-- populated too, but the snapshot fields stay either way.
create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.profiles (id) on delete cascade,
  purchase_id uuid references public.purchases (id) on delete set null,
  content_title text not null,
  content_kind text not null check (content_kind in ('program', 'guide', 'meditation')),
  amount numeric(10, 2) not null,
  purchased_at timestamptz not null,
  full_name text not null,
  email text not null,
  phone text not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

alter table public.refund_requests enable row level security;

create policy "participants create their own refund requests"
  on public.refund_requests for insert
  with check (auth.uid() = participant_id);

-- A participant can see their own request history — nobody else's, and
-- there's deliberately no update/delete policy for them: once filed, a
-- refund request is a permanent record (same as message_reports), and
-- only the team (via the admin panel's service-role-backed
-- admin-data Edge Function) moves it from 'open' to 'reviewed'. The
-- actual money movement always happens manually outside the app —
-- this table only ever tracks the request and its review status.
create policy "participants view their own refund requests"
  on public.refund_requests for select
  using (auth.uid() = participant_id);

-- ── SUPPORT TICKETS (Help page "Повідомити про проблему" + "Ваші
-- звернення") ────────────────────────────────────────────────────
-- General-purpose support requests, distinct from message_reports
-- (which is specifically for reporting the content of a conversation)
-- and refund_requests (specifically for refund claims tied to a
-- purchase). category is deliberately a free-text-ish check list
-- rather than its own lookup table — same lightweight pattern as
-- message_reports.reason. author_id is nullable and only set for
-- authors filing a ticket (role is read off profiles at query time in
-- the admin panel, not duplicated here).
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (
    category in (
      'content',
      'payment',
      'author',
      'rule_violation',
      'technical',
      'other'
    )
  ),
  description text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  admin_response text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.support_tickets enable row level security;

create policy "users create their own support tickets"
  on public.support_tickets for insert
  with check (auth.uid() = user_id);

-- Same pattern as refund_requests: the person can see their own
-- ticket (and its status/response) but can't edit or delete it once
-- filed, and can't set its own status — only the team, via the
-- service-role-backed admin-data Edge Function, moves it to
-- 'resolved' and optionally attaches admin_response.
create policy "users view their own support tickets"
  on public.support_tickets for select
  using (auth.uid() = user_id);

-- ── DEVICE SESSIONS (for "Активні сеанси" in Profile/Settings) ──────
-- Supabase Auth itself has no client-facing "list my sessions across
-- devices" API (its internal auth.sessions table isn't exposed via the
-- normal client), so this is a lightweight, purpose-built substitute:
-- one row per (account, browser), upserted every time that browser
-- successfully establishes a session (see src/lib/deviceSessions.ts).
-- device_id is a random id the client generates once and keeps in
-- localStorage — it identifies "this browser," not "this login," so
-- repeated logins from the same browser update one row instead of
-- piling up duplicates.
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  device_id text not null,
  user_agent text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id, device_id)
);

alter table public.user_sessions enable row level security;

create policy "users manage their own device sessions"
  on public.user_sessions for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- ── AUTO-CREATE PROFILE ON SIGN-UP ─────────────────────────────────
-- Registration (src/lib/auth.ts) calls supabase.auth.signUp() with
-- { data: { role, name } } in options — that lands in
-- auth.users.raw_user_meta_data. This trigger reads it and creates the
-- matching public.profiles (+ author_details, if role = 'author') row
-- automatically. `security definer` means it runs as the function
-- owner, not the calling client, so it works regardless of RLS
-- policies or whether email confirmation is required/pending yet.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, name, email, avatar_initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'participant'),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    upper(left(coalesce(new.raw_user_meta_data ->> 'name', new.email), 2))
  );

  if (new.raw_user_meta_data ->> 'role') = 'author' then
    insert into public.author_details (profile_id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────
-- Off by default in Postgres is "everyone can do everything" once RLS
-- itself is enabled with no policies — so enabling without policies
-- actually locks a table down completely until a policy opens it back
-- up. Below is a first-pass, deliberately conservative set: read what
-- you're meant to see, write only your own rows. Revisit before launch.

alter table public.profiles enable row level security;
alter table public.author_details enable row level security;
alter table public.content enable row level security;
alter table public.content_modules enable row level security;
alter table public.content_items enable row level security;
alter table public.purchases enable row level security;
alter table public.reviews enable row level security;
alter table public.author_reviews enable row level security;
alter table public.messages enable row level security;

-- Profiles: everyone can read (names/avatars are shown publicly on
-- content cards and reviews), only the owner can update their own row.
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "users update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- RLS policies gate ROWS, not COLUMNS — "users update their own
-- profile" above only checks auth.uid() = id, so as written it would
-- let anyone run supabase.from("profiles").update({ is_admin: true })
-- on their own row from the browser console and grant themselves
-- admin. This trigger pins the genuinely privileged columns back to
-- their stored values on any update that isn't running as the
-- service role (Edge Functions use the service-role key, which
-- bypasses this). `role` is deliberately NOT pinned here — flipping
-- participant <-> author right after a fresh OAuth signup is a real,
-- intentional client-side feature (see reconcileOAuthRole() in
-- src/lib/auth.ts), and there's no material privilege gain from it
-- anyway since anyone can just sign up as an author directly.
-- `email` is pinned too: the app now writes it only via
-- fetchCurrentProfile()'s self-heal from the confirmed
-- auth.users.email, never as a direct client update.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
    new.is_banned := old.is_banned;
    new.chat_banned_until := old.chat_banned_until;
    new.chat_ban_permanent := old.chat_ban_permanent;
    new.chat_ban_count := old.chat_ban_count;
    new.chat_ban_since := old.chat_ban_since;
    new.member_since := old.member_since;
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row
  execute function public.protect_profile_privileged_columns();

-- Belt-and-suspenders alongside the security-definer trigger above —
-- normally the trigger creates this row, but a direct client insert
-- (matching one's own id) is allowed too, in case that path is ever
-- used instead.
create policy "users create their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "author details are publicly readable"
  on public.author_details for select
  using (true);

create policy "authors update their own details"
  on public.author_details for all
  using (auth.uid() = profile_id);

-- Content: published items are public; drafts/review/archived are
-- visible only to their author.
create policy "published content is publicly readable"
  on public.content for select
  using (status = 'published' or auth.uid() = author_id);

create policy "authors manage their own content"
  on public.content for insert with check (auth.uid() = author_id);

create policy "authors update their own content"
  on public.content for update using (auth.uid() = author_id);

create policy "modules follow their content's visibility"
  on public.content_modules for select
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (c.status = 'published' or c.author_id = auth.uid())
    )
  );

create policy "authors manage their own content modules"
  on public.content_modules for all
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id and c.author_id = auth.uid()
    )
  );

-- Same visibility rule as content_modules, one hop further through
-- module_id -> content_modules.content_id -> content.
create policy "items follow their content's visibility"
  on public.content_items for select
  using (
    exists (
      select 1 from public.content_modules m
      join public.content c on c.id = m.content_id
      where m.id = module_id
        and (c.status = 'published' or c.author_id = auth.uid())
    )
  );

create policy "authors manage their own content items"
  on public.content_items for all
  using (
    exists (
      select 1 from public.content_modules m
      join public.content c on c.id = m.content_id
      where m.id = module_id and c.author_id = auth.uid()
    )
  );

-- Purchases: visible to the participant who bought and the author who
-- sold — nobody else.
create policy "purchases visible to buyer and seller"
  on public.purchases for select
  using (
    auth.uid() = participant_id
    or auth.uid() = (select author_id from public.content where id = content_id)
  );

create policy "participants create their own purchases"
  on public.purchases for insert with check (auth.uid() = participant_id);

-- Reviews: publicly readable (they're shown on content cards), only
-- the reviewing participant can write/edit their own.
create policy "reviews are publicly readable"
  on public.reviews for select
  using (true);

create policy "participants manage their own reviews"
  on public.reviews for all
  using (auth.uid() = participant_id);

-- Authors reply to reviews on their own content (author_reply column).
-- Accepted simplification: this permits a row UPDATE, not just the one
-- column — the client only ever sends { author_reply } in that update,
-- but Postgres RLS alone can't restrict *which* column an UPDATE policy
-- covers without an extra trigger/column-privilege setup, which felt
-- like overkill for an author editing feedback on their own course.
create policy "authors reply to reviews on their own content"
  on public.reviews for update
  using (
    exists (
      select 1 from public.content c
      where c.id = reviews.content_id and c.author_id = auth.uid()
    )
  );

-- Author-level reviews: publicly readable (shown as a rating summary on
-- AuthorProfile.tsx), writable only by the participant who left them —
-- no author-reply column here, this is feedback about the person, not
-- about one piece of content.
create policy "author reviews are publicly readable"
  on public.author_reviews for select
  using (true);

create policy "participants manage their own author reviews"
  on public.author_reviews for all
  using (auth.uid() = participant_id);

-- Messages: visible only to sender and recipient.
create policy "messages visible to sender and recipient"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- No direct client INSERT policy on purpose (Phase 2). Every message now
-- goes through the send-message Edge Function, which re-runs moderation
-- server-side and inserts using the service-role key (which bypasses RLS
-- entirely) — that's the only way a row can land in this table. Without
-- this policy, a client trying to insert directly (e.g. via devtools,
-- skipping the moderation check) is rejected by RLS before it ever
-- reaches the table. See supabase/functions/send-message/index.ts.

create policy "recipients can mark messages read"
  on public.messages for update using (auth.uid() = recipient_id);

-- ── STORAGE — content files ─────────────────────────────────────────
-- Stage 3: course covers, guide PDFs, meditation audio, module
-- materials. Video lessons are NOT stored here — per the free-only
-- constraint, lesson/intro videos live on YouTube (unlisted) and only
-- the link is saved on the content/module row; this bucket is for
-- everything else an author uploads directly.
--
-- Path convention every upload must follow: `{author_id}/{filename}`
-- — the policies below check that the first path segment is the
-- uploader's own auth.uid(), so one author can never overwrite or
-- delete another's files. Reads are public (covers/PDFs need to
-- display without requiring login).
insert into storage.buckets (id, name, public)
values ('content-files', 'content-files', true)
on conflict (id) do nothing;

create policy "authors upload their own content files"
  on storage.objects for insert
  with check (
    bucket_id = 'content-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "authors update their own content files"
  on storage.objects for update
  using (
    bucket_id = 'content-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "authors delete their own content files"
  on storage.objects for delete
  using (
    bucket_id = 'content-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "content files are publicly readable"
  on storage.objects for select
  using (bucket_id = 'content-files');

-- ── LESSON DISCUSSION ("Обговорення" on the item/Lesson Player screen)
-- ─────────────────────────────────────────────────────────────────
-- content_item_id is a plain TEXT id, deliberately NOT a foreign key
-- into public.content (unlike reviews.content_id). Reason: the
-- item-level Lesson Player screen (ProgramExperience.tsx's
-- view === "item") today only ever renders the demo catalog
-- (src/data/programModules.ts), whose item ids are opaque strings
-- like "stress-course__m4__i2" — real authored programs have no
-- content_items table/rows at all yet, so a uuid FK here would make
-- this feature permanently unusable for the only programs that
-- actually have a working per-item screen.
--
-- Accepted trade-off, decided with Sasha 2026-08-25: because these ids
-- aren't real content rows, there is no row to check "is this user
-- allowed to comment/read here" against — so, same as reviews, this is
-- open to any signed-in user on any item id, not scoped to purchasers
-- or enrolled participants. is_author_reply is stored for forward
-- compatibility but is always false today — there's no real author
-- account behind a demo program to ever set it true. Revisit both
-- points once real authored programs get real per-item content rows.
create table public.content_comments (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  is_author_reply boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index content_comments_item_idx on public.content_comments (content_item_id);

alter table public.content_comments enable row level security;

create policy "lesson comments are readable by signed-in users"
  on public.content_comments for select
  using (auth.uid() is not null);

create policy "users post their own lesson comments"
  on public.content_comments for insert
  with check (auth.uid() = user_id);

create policy "users edit their own lesson comments"
  on public.content_comments for update
  using (auth.uid() = user_id);

create policy "users delete their own lesson comments"
  on public.content_comments for delete
  using (auth.uid() = user_id);

-- Reports filed against a lesson comment ("Поскаржитися" in the
-- comment's "⋯" menu) — same shape/RLS style as message_reports
-- above, just pointed at content_comments instead of a profile.
create table public.content_comment_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.content_comments (id) on delete cascade,
  reason text not null check (
    reason in (
      'Спам',
      'Образи / агресія',
      'Неприйнятний контент',
      'Реклама',
      'Порушення правил платформи',
      'Інше'
    )
  ),
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

alter table public.content_comment_reports enable row level security;

create policy "users file their own comment reports"
  on public.content_comment_reports for insert
  with check (auth.uid() = reporter_id);

create policy "reporters view their own comment reports"
  on public.content_comment_reports for select
  using (auth.uid() = reporter_id);

create policy "reporters delete their own open comment reports"
  on public.content_comment_reports for delete
  using (auth.uid() = reporter_id and status = 'open');

-- ── LESSON FEEDBACK ("Цей матеріал був для вас корисним?") ──────────
-- One row per (item, participant) — re-answering upserts in place,
-- same idea as reviews' one-row-per-(participant,content) uniqueness.
-- reason is only ever filled in for is_helpful = false (the "Не зовсім"
-- follow-up window asking what specifically didn't work) — optional
-- even then, since the person can submit without writing anything.
--
-- content_item_id is the same plain TEXT, no-FK convention as
-- content_comments above, for the same reason: the Lesson Player only
-- renders the demo catalog today, whose item ids aren't real content
-- rows. Same accepted consequence as comments — there's no author
-- account to route "надіслати автору" to for demo programs, so unlike
-- content_comments (deliberately public/readable-by-anyone, since it's
-- a discussion feature), this table is select-restricted to the
-- person's own rows only: it's captured for real, but nobody
-- (including "the author") can actually read someone else's answer
-- through RLS yet, EXCEPT meditations (2026-08-30, per Sasha's
-- explicit call — "и это текстовое поле тоже должно отправляться
-- автору в кабинет"): see meditation_authors further down, which
-- gives a real author-read path for meditation feedback specifically,
-- via a small id→author mapping rather than a real content_items row
-- (meditations still don't have one). Lesson feedback (real course
-- content_items) still has no author-read path — same accepted
-- limitation as before, revisit once real per-item content rows exist
-- there too.
create table public.content_item_feedback (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_helpful boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (content_item_id, user_id)
);

create index content_item_feedback_item_idx on public.content_item_feedback (content_item_id);

alter table public.content_item_feedback enable row level security;

create policy "users manage their own item feedback"
  on public.content_item_feedback for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── PRACTICE RESPONSES ("Спробуйте зараз" — inline in-lesson practice)
-- ─────────────────────────────────────────────────────────────────
-- One row per (item, participant), same upsert-in-place convention as
-- content_item_feedback right above — re-answering a practice replaces
-- the previous answer rather than accumulating a history (a running
-- history of answers over time is Sasha's separate, later "Ваші
-- спостереження" reflection feature, not this one). `response` is a
-- single jsonb column because its shape depends on the item's
-- practice.type (src/data/contentTypes.ts's PracticeSpec):
--   text        -> { "text": string }
--   scale       -> { "value": number }
--   choice      -> { "choice": string }
--   checkboxes  -> { "choices": string[] }
-- Same content_item_id-is-plain-TEXT, self-only-read convention as
-- content_item_feedback, for the identical reason (no real per-item
-- content row to scope an "author can see this" policy against for
-- demo programs yet).
--
-- program_id/program_title/item_title/prompt: same denormalization as
-- content_item_reflections/content_item_mood_checkins and for the same
-- reason (content_item_id is plain text with no FK) — plus prompt,
-- since unlike a mood/reflection entry a practice answer is meaningless
-- on its own ("8", "так") without the question it was answering. All
-- captured once at write time from what the Lesson Player already has
-- in memory, so "Ваші спостереження" can show a real, standalone card
-- for it without a join.
create table public.content_item_practice_responses (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  item_title text,
  prompt text,
  response jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (content_item_id, user_id)
);

create index content_item_practice_responses_item_idx on public.content_item_practice_responses (content_item_id);

alter table public.content_item_practice_responses enable row level security;

create policy "users manage their own practice responses"
  on public.content_item_practice_responses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── REFLECTIONS ("Що я помітив?" — the personal observation journal
-- promised by content_item_practice_responses's comment above)
-- ─────────────────────────────────────────────────────────────────
-- Unlike practice responses (one row per item+person, overwritten on
-- re-answer) this is deliberately append-only — every "Зберегти
-- нотатку" tap is a new row, since the whole point is a running,
-- growing history the person can look back over later ("Ваші
-- спостереження"), not a single current answer. No unique constraint,
-- unlike content_item_practice_responses just above.
--
-- program_id/program_title/item_title are a deliberate denormalization,
-- not an oversight: content_item_id is plain text with no FK (same
-- reason as every other content_item_* table — demo lessons aren't
-- real rows), so there's nothing reliable to join against for the
-- "Ваші спостереження" history page to show what each note was
-- actually about. Captured once at write time from what the Lesson
-- Player already has in memory, same "honest, not fabricated" spirit
-- as the rest of this schema — if a program/item is later renamed, old
-- notes simply keep the title they had when they were written, which
-- reads truer than the alternative (either a live join that breaks for
-- demo content, or silently reflecting a name the person never saw).
create table public.content_item_reflections (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  item_title text,
  note text not null,
  created_at timestamptz not null default now()
);

create index content_item_reflections_user_idx on public.content_item_reflections (user_id, created_at desc);

alter table public.content_item_reflections enable row level security;

create policy "users manage their own reflections"
  on public.content_item_reflections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── MOOD CHECK-INS ("Як ви себе почуваєте зараз?" — before/after a
-- lesson, e.g. "Було: 8/10 → Стало: 5/10")
-- ─────────────────────────────────────────────────────────────────
-- One row per (item, person), upserted in place — same convention as
-- content_item_practice_responses, not content_item_reflections: this
-- is a single before/after pair tied to one sitting with one lesson,
-- not a growing log. before_value is written once on first open;
-- after_value is written once on completion. Both nullable (not every
-- person answers — this is explicitly skippable, never forced) and
-- deliberately NOT constrained to be answered together — a person can
-- skip "before" and the Lesson Player just never offers "after" either
-- (no meaningful delta without a starting point).
--
-- program_id/program_title/item_title: same denormalization as
-- content_item_reflections and for the same reason — content_item_id
-- is plain text with no FK (demo lessons aren't real rows), so there's
-- nothing reliable to join against for the "Ваші спостереження" history
-- page to show what each "Було ... Стало ..." pair was actually about.
create table public.content_item_mood_checkins (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  item_title text,
  before_value smallint check (before_value between 1 and 10),
  after_value smallint check (after_value between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (content_item_id, user_id)
);

create index content_item_mood_checkins_item_idx on public.content_item_mood_checkins (content_item_id);

alter table public.content_item_mood_checkins enable row level security;

create policy "users manage their own mood checkins"
  on public.content_item_mood_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── BOOKMARKS ("Закладки" — save a specific lesson to come back to)
-- ─────────────────────────────────────────────────────────────────
-- A plain toggle, not upserted state — bookmarked means a row exists,
-- not bookmarked means it doesn't (insert on save, delete on unsave).
-- Same program_id/program_title/item_title denormalization as
-- content_item_reflections/content_item_mood_checkins, for the
-- identical reason: content_item_id is plain text with no FK, so
-- there's nothing reliable to join against for the "Ваші
-- спостереження" bookmarks list to show what was actually saved.
create table public.content_item_bookmarks (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  item_title text,
  created_at timestamptz not null default now(),
  unique (content_item_id, user_id)
);

create index content_item_bookmarks_user_idx on public.content_item_bookmarks (user_id, created_at desc);

alter table public.content_item_bookmarks enable row level security;

create policy "users manage their own bookmarks"
  on public.content_item_bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── VIDEO POSITIONS ("Повернутися пізніше" — resume a video from where
-- you left off, not from the start) ─────────────────────────────────
-- One row per (item, user), overwritten on every save — this is a
-- single current playback position, not a history, same shape as
-- content_item_practice_responses. No program/item title columns like
-- the tables above: this is purely functional (feeds ProgramExperience's
-- own "start=" resume, never displayed anywhere on its own), so there's
-- nothing to show that would need a denormalized title.
create table public.content_item_video_positions (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position_seconds numeric not null,
  duration_seconds numeric,
  updated_at timestamptz not null default now(),
  unique (content_item_id, user_id)
);

alter table public.content_item_video_positions enable row level security;

create policy "users manage their own video positions"
  on public.content_item_video_positions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── SAVED PRACTICES ("Моя практика" — the audio/video tools a person
-- chooses to keep using after finishing the course) ──────────────────
-- A plain toggle, same shape as content_item_bookmarks (row exists =
-- saved) — a different concept from bookmarks (Sasha's own distinction:
-- a bookmark is "take me back to this lesson", this is "this is a tool
-- I keep using", offered specifically at course completion rather than
-- during any lesson), but the same underlying data shape, so it gets
-- its own table rather than overloading bookmarks with a second
-- meaning. Same program_id/program_title/item_title denormalization as
-- every other content_item_* table, same reason (no FK to join
-- against).
--
-- `kind` (2026-08-28, per Sasha's explicit call — "Мої практики", the
-- ♡ Зберегти button on a meditation's completed screen): the exact
-- same "tool I keep using" concept now also applies to a meditation
-- reaching its own completed screen, not just a finished course.
-- content_item_id holds the meditation's id in that case; program_id/
-- program_title stay null (there isn't one).
create table public.content_item_saved_practices (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'program' check (kind in ('program', 'meditation')),
  program_id text,
  program_title text,
  item_title text,
  created_at timestamptz not null default now(),
  unique (content_item_id, user_id)
);

create index content_item_saved_practices_user_idx on public.content_item_saved_practices (user_id, created_at desc);

alter table public.content_item_saved_practices enable row level security;

create policy "users manage their own saved practices"
  on public.content_item_saved_practices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── MODULE CHECK-INS ("Перед тим як почнемо" / "Що змінилося?" — a
-- lighter, module-level wellbeing pulse, distinct from
-- content_item_mood_checkins' per-lesson 1..10 scale) ─────────────────
-- Before/after use two DIFFERENT small vocabularies on purpose, not the
-- same three options twice: before asks for a plain state ("як ви
-- зараз"), after asks for a change ("що змінилося") — matching what's
-- actually being asked. One row per (module, person), same upsert-in-
-- place shape as content_item_mood_checkins (a single current pair, not
-- a growing log) — module_id has no FK for the same reason every other
-- content_item_* table's content_item_id doesn't (demo modules aren't
-- real rows either).
create table public.content_module_mood_checkins (
  id uuid primary key default gen_random_uuid(),
  module_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  module_title text,
  before_value text check (before_value in ('calm', 'neutral', 'hard')),
  after_value text check (after_value in ('easier', 'same', 'harder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (module_id, user_id)
);

alter table public.content_module_mood_checkins enable row level security;

create policy "users manage their own module check-ins"
  on public.content_module_mood_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── CONTENT PROGRESS (server-side mirror of the per-item progress map
-- that used to live only in utils/demoProgressStore.ts's localStorage)
-- ─────────────────────────────────────────────────────────────────
-- One row per (program/content, person), the whole ItemProgressMap
-- stored as jsonb rather than one row per item — matches exactly how
-- the app already models progress in memory (contentTypes.ts's
-- ItemProgressMap), so no reshaping between client and server. Written
-- on every progress change (fire-and-forget, localStorage stays the
-- instant source of truth for rendering); read back and merged into
-- localStorage on program open, so progress survives a new device/
-- cleared browser instead of silently resetting to 0%. content_id has
-- no FK, same reason as every other content_item_* table (demo
-- programs aren't real rows).
create table public.content_progress (
  id uuid primary key default gen_random_uuid(),
  content_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (content_id, user_id)
);

-- 2026-09-21, real program participation architecture: "Моє навчання"
-- now bulk-fetches every row for one participant (see
-- lib/contentProgressSync.ts's fetchAllProgress) instead of one lookup
-- per already-known program id — same "WHERE user_id = X, no second
-- filter" shape as program_saved_for_later/guide_section_views below,
-- both of which already have a user_id-leading index for exactly this
-- read pattern. The existing unique(content_id, user_id) index doesn't
-- serve a plain user_id scan efficiently on its own.
create index content_progress_user_idx on public.content_progress (user_id);

alter table public.content_progress enable row level security;

create policy "users manage their own content progress"
  on public.content_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── CONTENT WARNING ACKNOWLEDGEMENTS ("Перед початком" — see
-- content_items.content_warning above) ────────────────────────────────
-- A plain insert-only toggle, same shape as content_item_bookmarks
-- minus the delete path — once acknowledged, a warning stays
-- acknowledged (no reason to ever "un-acknowledge" it), so this only
-- ever grows, never shrinks, per person per item.
create table public.content_item_warning_acks (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (content_item_id, user_id)
);

alter table public.content_item_warning_acks enable row level security;

create policy "users manage their own warning acks"
  on public.content_item_warning_acks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── PROGRAM COMPLETION SNAPSHOTS (the "Підсумок програми" report —
-- ProgramExperience.tsx's "completed" view) ────────────────────────────
-- A frozen tally (modules/items done, practices answered, reflections
-- left) taken the FIRST moment a program reaches 100%, never touched
-- again after that — per Sasha's explicit call: reopening the report
-- later, even after revisiting/redoing lessons inside an already-
-- completed program, must always show the exact same numbers, not
-- whatever the live counts happen to be that day. That's why this is
-- select+insert only (no update/delete policy at all, unlike every
-- other content_item_*/content_module_* table above which use "for
-- all") — immutability is enforced at the database level, not just by
-- the client never calling update. The unique constraint is what makes
-- a second completion a no-op: lib/programCompletions.ts's
-- recordProgramCompletion tries an insert, and on a unique-violation
-- simply fetches back the row that already exists instead of
-- overwriting it.
create table public.content_program_completions (
  id uuid primary key default gen_random_uuid(),
  program_id text not null,
  program_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz not null default now(),
  modules_done integer not null default 0,
  modules_total integer not null default 0,
  items_done integer not null default 0,
  items_total integer not null default 0,
  practices_count integer not null default 0,
  reflections_count integer not null default 0,
  invested_minutes integer not null default 0,
  -- null means no mood check-in pair existed yet at the moment of
  -- completion — the report omits that line rather than showing a
  -- meaningless 0 -> 0.
  mood_before_avg real,
  mood_after_avg real,
  -- A few actual note excerpts (short free text, most recent first),
  -- not just the count — copied in at write time so the report still
  -- reads like a real keepsake even if the person writes more notes
  -- into this program afterward (see lib/programCompletions.ts).
  reflection_excerpts jsonb not null default '[]'::jsonb,
  -- The program's own module/item titles + each item's frozen progress
  -- status at the moment of completion — lets the report show a real
  -- "Зміст програми" checklist that can't later disagree with itself
  -- if the author edits/reorders lessons afterward.
  modules_snapshot jsonb not null default '[]'::jsonb,
  unique (program_id, user_id)
);

alter table public.content_program_completions enable row level security;

create policy "users view their own program completions"
  on public.content_program_completions for select
  using (auth.uid() = user_id);

create policy "users record their own program completions"
  on public.content_program_completions for insert
  with check (auth.uid() = user_id);

-- ── AUTHOR READ ACCESS TO PARTICIPANT ENGAGEMENT (real "Учасники" +
-- per-participant engagement summary in the author cabinet) ───────────
-- Every table below was, until now, select-restricted to `auth.uid() =
-- user_id` only — honest for a participant's own history page, but it
-- meant an author had literally no way to see how people were actually
-- using their real (non-demo) content, even in aggregate. These are
-- ADDITIVE select-only policies (Postgres OR's multiple permissive
-- policies for the same command together), so the existing
-- participant-owns-their-own-row policies are untouched — an author
-- gains read access to rows tied to THEIR OWN content, nothing else,
-- and still can't write/delete anyone else's row.
--
-- content_item_id/program_id/content_id stay plain TEXT with no FK
-- (same reason as everywhere else in this schema: demo content isn't
-- real rows), so every policy below compares the real uuid content/item
-- id CAST TO TEXT against the stored text column — safe in both
-- directions (a demo id like "stress-course__m4__i2" just never
-- matches a real uuid's text form, no invalid-cast risk from casting
-- the untrusted text column itself).
create policy "authors view progress on their own content"
  on public.content_progress for select
  using (
    exists (
      select 1 from public.content c
      where c.id::text = content_progress.content_id
        and c.author_id = auth.uid()
    )
  );

create policy "authors view practice responses on their own programs"
  on public.content_item_practice_responses for select
  using (
    exists (
      select 1 from public.content c
      where c.id::text = content_item_practice_responses.program_id
        and c.author_id = auth.uid()
    )
  );

create policy "authors view reflections on their own programs"
  on public.content_item_reflections for select
  using (
    exists (
      select 1 from public.content c
      where c.id::text = content_item_reflections.program_id
        and c.author_id = auth.uid()
    )
  );

create policy "authors view mood checkins on their own programs"
  on public.content_item_mood_checkins for select
  using (
    exists (
      select 1 from public.content c
      where c.id::text = content_item_mood_checkins.program_id
        and c.author_id = auth.uid()
    )
  );

-- content_item_feedback has no program_id/content_id column at all
-- (see its own comment above) — the only way to scope this one to "the
-- author's own content" is through content_items -> content_modules ->
-- content, the same three-table join content_items' own "authors
-- manage their own content items" policy already does.
create policy "authors view feedback on their own content items"
  on public.content_item_feedback for select
  using (
    exists (
      select 1 from public.content_items ci
      join public.content_modules m on m.id = ci.module_id
      join public.content c on c.id = m.content_id
      where ci.id::text = content_item_feedback.content_item_id
        and c.author_id = auth.uid()
    )
  );

-- ── MEDITATION AUTHORS (2026-08-30, per Sasha's explicit call —
-- "Ця практика була корисною?" feedback must reach the author's own
-- cabinet) ─────────────────────────────────────────────────────────
-- Meditations (data/meditations.ts) have no real content_items row to
-- hang an author_id off of, unlike course lessons — this is the
-- minimal fix: a plain id→author mapping, just enough for an RLS
-- policy to exist. Not a general "meditations are now real authored
-- content" migration (that's a much bigger change) — meditation_id
-- stays plain text, matching every other content_item_id column here.
create table public.meditation_authors (
  meditation_id text primary key,
  author_id uuid not null references public.profiles (id) on delete cascade
);

alter table public.meditation_authors enable row level security;

-- Harmless to read (just an id→id mapping, no personal content) —
-- open to any signed-in user rather than author-only, so nothing else
-- that might reasonably want it later needs its own policy.
create policy "meditation_authors readable by signed-in users"
  on public.meditation_authors for select
  using (auth.uid() is not null);

-- Exact same id→author mapping, for guides (2026-09-09, per Sasha's
-- "Запитати автора" spec — see guide-authors-migration.sql). Lets
-- GuideExperience.tsx resolve a real author account for a guide the
-- same way meditation_authors does for meditations, without guides
-- needing to become real `content` rows.
create table public.guide_authors (
  guide_id text primary key,
  author_id uuid not null references public.profiles (id) on delete cascade
);

alter table public.guide_authors enable row level security;

create policy "guide_authors readable by signed-in users"
  on public.guide_authors for select
  using (auth.uid() is not null);

-- A second, additive SELECT policy on content_item_feedback (Postgres
-- RLS OR's multiple permissive policies together) — extends the
-- existing lesson-only author-read path above to also cover
-- meditations, via meditation_authors instead of the content_items
-- join meditations don't have rows in.
create policy "authors view feedback on their own meditations"
  on public.content_item_feedback for select
  using (
    exists (
      select 1 from public.meditation_authors ma
      where ma.meditation_id = content_item_feedback.content_item_id
        and ma.author_id = auth.uid()
    )
  );

-- ── MEDITATION AUDIO POSITIONS ("продовжити з місця зупинки" — same
-- resume idea as content_item_video_positions above, for the real
-- meditation audio player) ────────────────────────────────────────────
-- One row per (meditation, user), overwritten on every save — a single
-- current position, not a history, same shape/reasoning as the video
-- positions table it mirrors. meditation_id is plain text (not a real
-- FK) for the same reason content_item_id is text there: meditations
-- currently only exist as data/meditations.ts demo ids, no real
-- meditation-authoring table yet.
create table public.meditation_audio_positions (
  id uuid primary key default gen_random_uuid(),
  meditation_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position_seconds numeric not null,
  duration_seconds numeric,
  updated_at timestamptz not null default now(),
  unique (meditation_id, user_id)
);

alter table public.meditation_audio_positions enable row level security;

create policy "users manage their own meditation audio positions"
  on public.meditation_audio_positions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
  );

-- ── MEDITATION MOOD CHECK-IN ("Як ви почуваєтесь зараз?" before a
-- session, optional, + "А як тепер?" after — Sasha's explicit call,
-- 2026-08-28, meant as one of Sensoria's signature features) ─────────
-- Unlike content_item_mood_checkins (one row per lesson item,
-- overwritten forever — a lesson is "done" once), this is one row PER
-- SESSION: a meditation is reusable (see meditationSessionStore.ts),
-- so every fresh start deserves its own before/after pair instead of
-- erasing the last one — that's what lets this become real history
-- ("напруга знижується щоразу"), not just a single one-off comparison.
-- `states` is the optional set of feeling tags picked before starting
-- (Тривожно/Напружено/Втомлено/...) — purely descriptive, never
-- required. before_value/after_value are the paired 1-10 tension scale
-- ("Було: напруга 8/10 → Стало: 5/10"). meditation_id is plain text,
-- same reasoning as meditation_audio_positions above (no real
-- meditation-authoring table yet).
create table public.meditation_mood_checkins (
  id uuid primary key default gen_random_uuid(),
  meditation_id text not null,
  meditation_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  states text[] not null default '{}',
  before_value numeric,
  after_value numeric,
  -- "Що змінилося?" — one of a fixed set of options (Стало
  -- спокійніше / Стало легше зосередитись / Майже без змін / Важко
  -- сказати), asked right after after_value, equally optional. Plain
  -- text rather than an enum: same reasoning as `states` above — a
  -- fixed UI-level set, not a constraint worth enforcing in the DB.
  change_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meditation_mood_checkins_user_idx on public.meditation_mood_checkins (user_id, created_at desc);

alter table public.meditation_mood_checkins enable row level security;

create policy "users manage their own meditation mood checkins"
  on public.meditation_mood_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── GUIDE FRAGMENT SAVES ("Зберегти конкретну частину" — save one
-- specific point/step from a guide, not the whole document) ──────────
-- See guide-fragment-saves-migration.sql for the full rationale.
-- guide_id is plain text (no FK — guides.ts is static demo data, same
-- as every other content_item_* table above); guide_title/
-- fragment_text are denormalized so "Мої збереження" can always show
-- what was actually saved even if guides.ts changes later.
-- fragment_index (not the text) is what identity/uniqueness is keyed
-- on — two different steps could coincidentally share text.
create table public.guide_fragment_saves (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  fragment_index integer not null,
  fragment_text text not null,
  guide_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, fragment_index, user_id)
);

create index guide_fragment_saves_user_idx on public.guide_fragment_saves (user_id, created_at desc);

alter table public.guide_fragment_saves enable row level security;

create policy "users manage their own guide fragment saves"
  on public.guide_fragment_saves for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── GUIDE SAVED FOR LATER ("Додати в обране" — a person bookmarking a
-- guide themselves from the dashboard, independent of enrollments)
-- ─────────────────────────────────────────────────────────────────
-- See guide-saved-for-later-migration.sql for the full rationale. Same
-- plain-toggle shape as content_item_bookmarks/
-- content_item_saved_practices above; guide_id is plain text for the
-- same reason guide_fragment_saves' is.
create table public.guide_saved_for_later (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  guide_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, user_id)
);

create index guide_saved_for_later_user_idx on public.guide_saved_for_later (user_id, created_at desc);

alter table public.guide_saved_for_later enable row level security;

create policy "users manage their own saved guides"
  on public.guide_saved_for_later for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Same plain-toggle shape, mirrored for programs (2026-09-21, per
-- Sasha's request — "Збережені" needs a real save/unsave action
-- instead of a static demo entry). See
-- program-saved-for-later-migration.sql for the standalone migration.
create table public.program_saved_for_later (
  id uuid primary key default gen_random_uuid(),
  program_id text not null,
  program_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (program_id, user_id)
);

create index program_saved_for_later_user_idx on public.program_saved_for_later (user_id, created_at desc);

alter table public.program_saved_for_later enable row level security;

create policy "users manage their own saved programs"
  on public.program_saved_for_later for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── GUIDE INTERACTIVE ELEMENTS (2026-09-09, per Sasha's spec) ──────
-- See guide-interactive-blocks-migration.sql for the full rationale.
-- Same shape as guide_fragment_saves/guide_saved_for_later above:
-- guide_id is plain text (guides.ts is static demo data), RLS is a
-- straight auth.uid() = user_id row-ownership check.

-- Real per-item checklist state ("Чек-лист... користувач реально
-- відмічає це всередині гайду") — a plain toggle, row exists = checked.
create table public.guide_checklist_checks (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  block_index integer not null,
  item_index integer not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, block_index, item_index, user_id)
);

create index guide_checklist_checks_user_idx on public.guide_checklist_checks (user_id, guide_id);

alter table public.guide_checklist_checks enable row level security;

create policy "users manage their own guide checklist checks"
  on public.guide_checklist_checks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A free-text reflection note under a specific block ("Що я
-- помітив/ла?") — one row per person+guide+block, upserted in place.
create table public.guide_notes (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  block_index integer not null,
  note_text text not null default '',
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (guide_id, block_index, user_id)
);

create index guide_notes_user_idx on public.guide_notes (user_id, guide_id);

alter table public.guide_notes enable row level security;

create policy "users manage their own guide notes"
  on public.guide_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A 1–10 self-rating, before/after ("Було: 8/10 → Стало: 5/10") — phase
-- keeps the two readings distinct for the same guide+block+person.
create table public.guide_self_assessments (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  block_index integer not null,
  phase text not null check (phase in ('before', 'after')),
  score integer not null check (score between 1 and 10),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, block_index, phase, user_id)
);

create index guide_self_assessments_user_idx on public.guide_self_assessments (user_id, guide_id);

alter table public.guide_self_assessments enable row level security;

create policy "users manage their own guide self-assessments"
  on public.guide_self_assessments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── GUIDE SECTION VIEWS (2026-09-09, per Sasha's spec) ─────────────
-- See guide-section-views-migration.sql for the full rationale.
-- "Ви переглянули X із Y розділів" instead of an artificial % — a
-- plain toggle, row exists = that section (heading-grouped page in
-- GuideBlockRenderer.tsx) has been viewed.
create table public.guide_section_views (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  section_index integer not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, section_index, user_id)
);

create index guide_section_views_user_idx on public.guide_section_views (user_id, guide_id);

alter table public.guide_section_views enable row level security;

create policy "users manage their own guide section views"
  on public.guide_section_views for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── ENTITY REPORTS (автор / публікація / відгук) — див. entity-reports-migration.sql
create table if not exists public.entity_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('author', 'post', 'review')),
  target_id text not null,
  target_owner_id uuid references public.profiles (id) on delete set null,
  target_label text,
  reason text not null check (
    reason in ('inappropriate_content','harassment','spam_or_ads','misleading','impersonation','other')
  ),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);
create unique index if not exists entity_reports_unique_per_reporter
  on public.entity_reports (reporter_id, target_type, target_id);
alter table public.entity_reports enable row level security;
create policy "users file their own entity reports"
  on public.entity_reports for insert
  with check (auth.uid() = reporter_id and (target_owner_id is null or target_owner_id <> auth.uid()));
create policy "reporters view their own entity reports"
  on public.entity_reports for select using (auth.uid() = reporter_id);

-- ── AUTHOR VERIFICATION — див. author-verification-migration.sql
-- (заявки author_verification_requests, приватний bucket verification-docs,
-- тригер protect_author_verified: автор не може сам поставити verified).


-- ── AUTHOR EXIT (author-exit-migration.sql) ──────────────────────────
-- Sensoria — author exit: stop sales, keep buyers' access, close the chat.
-- Run ONCE in the Supabase SQL Editor (safe to re-run), then redeploy the
-- Edge Functions: delete-account, purge-deleted-accounts, send-message.
--
-- Rules implemented here (see Умови використання and Договір з автором):
--  1. An author cannot delete a course that has been sold. They can stop
--     selling it (status 'archived'); buyers keep their access.
--  2. Content stays in Sensoria's database/storage. It does not disappear
--     because the author's account is closed.
--  4. Closing the account does not cancel obligations: purchases, refunds
--     and payout settings are kept.
--  (Rule 3 — delayed payouts / reserve — needs the payment provider; there
--   is nothing to enforce in the database until payments are connected.)

-- 1) When an author left the platform (null = still here).
alter table public.profiles add column if not exists left_platform_at timestamptz;

-- 2) Buyers can read what they paid for, whatever its status.
--    SECURITY DEFINER avoids an RLS recursion (purchases' own policy reads content).
create or replace function public.has_active_purchase(p_content uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.purchases p
    where p.content_id = p_content
      and p.participant_id = auth.uid()
      and p.status = 'completed'
  );
$$;
grant execute on function public.has_active_purchase(uuid) to authenticated;

drop policy if exists "published content is publicly readable" on public.content;
create policy "published content is publicly readable"
  on public.content for select
  using (status = 'published' or auth.uid() = author_id or public.has_active_purchase(id));

drop policy if exists "modules follow their content's visibility" on public.content_modules;
create policy "modules follow their content's visibility"
  on public.content_modules for select
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (c.status = 'published' or c.author_id = auth.uid() or public.has_active_purchase(c.id))
    )
  );

drop policy if exists "items follow their content's visibility" on public.content_items;
create policy "items follow their content's visibility"
  on public.content_items for select
  using (
    exists (
      select 1 from public.content_modules m
      join public.content c on c.id = m.content_id
      where m.id = module_id
        and (c.status = 'published' or c.author_id = auth.uid() or public.has_active_purchase(c.id))
    )
  );

-- 3) A sold course cannot be deleted (friendly message instead of a raw FK error).
create or replace function public.protect_sold_content()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.purchases where content_id = old.id) then
    raise exception 'Цей матеріал уже придбано, тому його не можна видалити. Зніміть його з продажу (архів): покупці збережуть доступ.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_sold_content_trg on public.content;
create trigger protect_sold_content_trg
  before delete on public.content
  for each row execute function public.protect_sold_content();

create table if not exists public.closed_authors (
  profile_id uuid primary key references public.profiles (id) on delete restrict,
  former_name text not null,
  closed_at timestamptz not null default now()
);
alter table public.closed_authors enable row level security;
revoke all on public.closed_authors from anon, authenticated;

-- 4) Close an author's account WITHOUT deleting what buyers paid for.
--    Called only by the purge-deleted-accounts Edge Function (service role).
create or replace function public.close_author_account(p_author uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_author and role = 'author') then
    raise exception 'Not an author account';
  end if;

  -- stop sales of everything that has buyers; buyers keep access (archived)
  update public.content c
     set status = 'archived', updated_at = now()
   where c.author_id = p_author
     and c.status <> 'archived'
     and exists (select 1 from public.purchases p where p.content_id = c.id);

  -- unsold material (drafts, items nobody bought) is removed
  delete from public.content c
   where c.author_id = p_author
     and not exists (select 1 from public.purchases p where p.content_id = c.id);

  -- public contact/bio details go; payout_settings stay until settlements are done
  delete from public.author_details where profile_id = p_author;

  -- keep the real name privately for settlements (no RLS policies = service role only)
  insert into public.closed_authors (profile_id, former_name)
  select id, name from public.profiles where id = p_author
  on conflict (profile_id) do nothing;

  update public.profiles
     set left_platform_at = coalesce(left_platform_at, now()),
         avatar_url = null,
         name = 'Sensoria',
         avatar_initials = 'S',
         email = 'closed-' || p_author::text || '@deleted.invalid',
         notification_prefs = '{}'::jsonb
   where id = p_author;
end;
$$;

revoke all on function public.close_author_account(uuid) from public, anon, authenticated;

-- ── CONSENT TO TERMS / PRIVACY (see consent-migration.sql) ──

create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy', 'author_agreement')),
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);

alter table public.legal_consents enable row level security;

drop policy if exists "users read their own consents" on public.legal_consents;
create policy "users read their own consents"
  on public.legal_consents for select
  using (auth.uid() = user_id);

drop policy if exists "users record their own consents" on public.legal_consents;
create policy "users record their own consents"
  on public.legal_consents for insert
  with check (auth.uid() = user_id);

-- No update/delete policies: a recorded consent cannot be edited by the client.

-- Email sign-up: the form sends consent_version in the sign-up metadata and
-- the trigger records it (works even before the email is confirmed).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, name, email, avatar_initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'participant'),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    upper(left(coalesce(new.raw_user_meta_data ->> 'name', new.email), 2))
  );

  if (new.raw_user_meta_data ->> 'role') = 'author' then
    insert into public.author_details (profile_id) values (new.id);
  end if;

  if nullif(new.raw_user_meta_data ->> 'consent_version', '') is not null then
    insert into public.legal_consents (user_id, document, version)
    select new.id, d, new.raw_user_meta_data ->> 'consent_version'
    from unnest(array['terms', 'privacy']) as d
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- ── COMPLAINTS → DELISTING (see complaints-migration.sql; run after the author-exit part above) ──
-- Complaints → manual delisting by the admin. Run in the Supabase SQL Editor (safe to re-run).
-- Run AFTER author-exit-migration.sql (it replaces the content SELECT policy).
--
-- Product rules (Умови використання, Договір з автором, Політика повернення):
--  * a complaint only goes to the admin queue; the admin takes the material
--    off sale for NEW buyers by hand (sale_status 'complaint_pending' =
--    paused, 'unlisted' = permanently); records and files are never deleted;
--  * people who already bought keep access (has_active_purchase);
--  * only Sensoria's admin (service role) can move sale_status afterwards:
--    'unlisted' (permanently off sale) or 'restored' (back on sale);
--  * every step is written to content_events.

-- 1) Sale status, separate from the author's own status (draft/review/…).
alter table public.content
  add column if not exists sale_status text not null default 'published'
  check (sale_status in ('published', 'complaint_pending', 'unlisted', 'restored'));

-- 2) Audit trail (no policies: readable only with the service role).
create table if not exists public.content_events (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  event text not null,
  actor_id uuid,
  actor_kind text not null default 'system' check (actor_kind in ('user', 'admin', 'system')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists content_events_content_idx on public.content_events (content_id, created_at);
alter table public.content_events enable row level security;
revoke all on public.content_events from anon, authenticated;

-- 3) Only the system may change sale_status (an author's UPDATE must not
--    put a delisted item back on sale, nor insert as 'restored').
create or replace function public.guard_sale_status()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('sensoria.sale_system', true), '') = '1' then
    return new;
  end if;
  if auth.uid() is null then          -- service role (admin Edge Function)
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sale_status := 'published';
  else
    new.sale_status := old.sale_status;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_sale_status_trg on public.content;
create trigger guard_sale_status_trg
  before insert or update on public.content
  for each row execute function public.guard_sale_status();

-- 4) Public catalog: published AND on sale. Authors see their own; buyers keep
--    what they paid for whatever the sale status.
drop policy if exists "published content is publicly readable" on public.content;
create policy "published content is publicly readable"
  on public.content for select
  using (
    (status = 'published' and sale_status in ('published', 'restored'))
    or auth.uid() = author_id
    or public.has_active_purchase(id)
  );

drop policy if exists "modules follow their content's visibility" on public.content_modules;
create policy "modules follow their content's visibility"
  on public.content_modules for select
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          (c.status = 'published' and c.sale_status in ('published', 'restored'))
          or c.author_id = auth.uid()
          or public.has_active_purchase(c.id)
        )
    )
  );

drop policy if exists "items follow their content's visibility" on public.content_items;
create policy "items follow their content's visibility"
  on public.content_items for select
  using (
    exists (
      select 1 from public.content_modules m
      join public.content c on c.id = m.content_id
      where m.id = module_id
        and (
          (c.status = 'published' and c.sale_status in ('published', 'restored'))
          or c.author_id = auth.uid()
          or public.has_active_purchase(c.id)
        )
    )
  );

-- 5) Complaints: no duplicates, basic rate limit, audit event.
create unique index if not exists content_reports_one_open_per_user
  on public.content_reports (reporter_id, content_item_id)
  where status = 'open';

create or replace function public.content_report_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.content_reports
       where reporter_id = new.reporter_id
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Забагато скарг за короткий час. Спробуйте пізніше.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.content_reports
              where reporter_id = new.reporter_id
                and content_item_id = new.content_item_id
                and status = 'open') then
    raise exception 'Ви вже надіслали скаргу на цей матеріал — ми її розглядаємо.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists content_report_before_insert_trg on public.content_reports;
create trigger content_report_before_insert_trg
  before insert on public.content_reports
  for each row execute function public.content_report_before_insert();

create or replace function public.content_report_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if new.content_item_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;        -- catalog (non-database) item: nothing to delist
  end if;
  v_id := new.content_item_id::uuid;

  if not exists (select 1 from public.content where id = v_id) then
    return new;
  end if;

  insert into public.content_events (content_id, event, actor_id, actor_kind, details)
  values (v_id, 'complaint_submitted', new.reporter_id, 'user',
          jsonb_build_object('report_id', new.id, 'reason', new.reason));

  -- No automatic delisting: the complaint goes to the admin queue and
  -- Sensoria's admin takes the material off sale manually.
  return new;
end;
$$;

drop trigger if exists content_report_after_insert_trg on public.content_reports;
create trigger content_report_after_insert_trg
  after insert on public.content_reports
  for each row execute function public.content_report_after_insert();

-- ── ADMIN PANEL: roles, reasons, access restriction (see admin-panel-migration.sql) ──

-- 1) Roles. is_admin stays the master switch; admin_role says what the person
--    may do: 'owner' (everything) or 'support' (view + handle requests, pause
--    a sale). An admin with no role set is treated as 'owner' (back-compat).
alter table public.profiles
  add column if not exists admin_role text
  check (admin_role in ('owner', 'support'));

update public.profiles set admin_role = 'owner' where is_admin and admin_role is null;

-- Nobody can give themselves a role from the browser (service role only).
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
    new.admin_role := old.admin_role;
    new.is_banned := old.is_banned;
    new.chat_banned_until := old.chat_banned_until;
    new.chat_ban_permanent := old.chat_ban_permanent;
    new.chat_ban_count := old.chat_ban_count;
    new.chat_ban_since := old.chat_ban_since;
    new.left_platform_at := old.left_platform_at;
    new.member_since := old.member_since;
    new.email := old.email;
  end if;
  return new;
end;
$$;

-- 2) Why an admin did something (shown in «Журнал дій»).
alter table public.admin_actions add column if not exists reason text;

-- 3) Restricting access for ALL buyers of a material (serious risk / law /
--    third-party rights). Only the admin (service role) sets these; the
--    protect trigger below stops authors from touching them.
alter table public.content
  add column if not exists access_restricted_at timestamptz,
  add column if not exists access_restricted_reason text;

create or replace function public.guard_sale_status()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('sensoria.sale_system', true), '') = '1' then
    return new;
  end if;
  if auth.uid() is null then          -- service role (admin Edge Function)
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sale_status := 'published';
    new.access_restricted_at := null;
    new.access_restricted_reason := null;
  else
    new.sale_status := old.sale_status;
    new.access_restricted_at := old.access_restricted_at;
    new.access_restricted_reason := old.access_restricted_reason;
  end if;
  return new;
end;
$$;

-- A purchase gives access only while the material is not restricted.
create or replace function public.has_active_purchase(p_content uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.purchases p
    join public.content c on c.id = p.content_id
    where p.content_id = p_content
      and p.participant_id = auth.uid()
      and p.status = 'completed'
      and c.access_restricted_at is null
  );
$$;
grant execute on function public.has_active_purchase(uuid) to authenticated;

-- ── AUTHOR KINDS, FIRST-MATERIAL CHECK, HIGH-RISK TOPICS (see author-kind-migration.sql) ──
--
-- Rules:
--  * «Фахівець» = the author's education documents were reviewed by Sensoria
--    (author_details.education_verified, set only by the admin function).
--    Everyone else is «Автор» (own educational content, no profile
--    qualification claimed). Experience is never verified.
--  * An author's FIRST material is checked by the admin before it goes live
--    (status 'review' → admin «Схвалити»). After that the author is trusted
--    (approved_to_publish) and later materials publish at once; complaints
--    are handled afterwards.
--  * High-risk topics (trauma/PTSD, suicidal thoughts and self-harm, eating
--    disorders, addictions, diagnoses/medication/treatment, work with
--    children) can be published only by a «Фахівець».

alter table public.author_details
  add column if not exists education_verified boolean not null default false,
  add column if not exists approved_to_publish boolean not null default false;

-- Only the service role (admin function) may change these two flags.
create or replace function public.protect_author_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.verified := false;
      new.education_verified := false;
      new.approved_to_publish := false;
    else
      new.verified := old.verified;
      new.education_verified := old.education_verified;
      new.approved_to_publish := old.approved_to_publish;
    end if;
  end if;
  return new;
end;
$$;

-- Authors who already have live material keep publishing as before.
update public.author_details d
   set approved_to_publish = true
 where exists (
   select 1 from public.content c
   where c.author_id = d.profile_id and c.status in ('published', 'archived')
 );

-- Two kinds of verification request: identity (the «галочка») and education.
alter table public.author_verification_requests
  add column if not exists kind text not null default 'identity'
  check (kind in ('identity', 'education'));

drop index if exists public.author_verification_one_pending;
create unique index if not exists author_verification_one_pending_per_kind
  on public.author_verification_requests (author_id, kind) where status = 'pending';

drop policy if exists "authors submit their own verification request" on public.author_verification_requests;
create policy "authors submit their own verification request"
  on public.author_verification_requests for insert
  with check (
    auth.uid() = author_id
    and status = 'pending'
    and reviewed_at is null
    and cardinality(document_paths) between 1 and 3
    and exists (
      select 1 from public.author_details d
      where d.profile_id = auth.uid()
        and coalesce(btrim(d.title), '') <> ''
        and coalesce(btrim(d.bio), '') <> ''
        and (kind = 'identity' or coalesce(btrim(d.credentials), '') <> '')
    )
  );

-- High-risk topics declared by the author on a material.
alter table public.content
  add column if not exists risk_topics text[] not null default '{}';

-- Publishing gate (skipped for the service role / admin function).
create or replace function public.content_publish_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_specialist boolean;
  v_risky boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status not in ('review', 'published') then
    return new;
  end if;

  select coalesce(approved_to_publish, false), coalesce(education_verified, false)
    into v_ok, v_specialist
    from public.author_details where profile_id = new.author_id;
  v_ok := coalesce(v_ok, false);
  v_specialist := coalesce(v_specialist, false);

  -- high-risk topic → only a verified specialist
  v_risky := coalesce(cardinality(new.risk_topics), 0) > 0
    or (coalesce(new.title, '') || ' ' || coalesce(new.description, '')) ~*
       '(птср|посттравм|суїцид|самоушкодж|розлад[иуіав]* харчов|булімі|анорекс|залежн(ість|остей|остям)|діагноз|лікуванн|ліки|медикамент|психотерапі)';
  if v_risky and not v_specialist
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.risk_topics is distinct from old.risk_topics) then
    raise exception 'Теми підвищеного ризику (травма, суїцидальні думки, розлади харчової поведінки, залежності, діагнози й лікування) доступні лише авторам зі статусом «Фахівець» (документи про освіту переглянуто Sensoria). Надішліть документи в розділі «Модерація» або приберіть цю тему.'
      using errcode = 'P0001';
  end if;

  -- the first material of an author is checked by hand
  if not v_ok and new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.status := 'review';
  end if;
  -- later materials of a trusted author go live at once
  if v_ok and new.status = 'review' then
    new.status := 'published';
  end if;
  return new;
end;
$$;

drop trigger if exists content_publish_gate_trg on public.content;
create trigger content_publish_gate_trg
  before insert or update on public.content
  for each row execute function public.content_publish_gate();

-- ── ACCOUNT DELETION THAT KEEPS PURCHASES, 18+ (see account-deletion-migration.sql) ──
--
-- Rules (Умови використання, «Акаунти»):
--  * a deletion request is processed within 30 calendar days (the app waits
--    14 days for a possible restore, then the purge job runs daily);
--  * a participant who has completed purchases is CLOSED, not erased: the
--    purchase records stay, personal data and learning/personal records are
--    deleted, sign-in is closed. Access can be restored into a new account by
--    Sensoria's admin (transfer_purchases) after the person is identified;
--  * only a hash of the old email is kept, to find the right record later.

-- 1) 18+ is recorded like the other consents.
alter table public.legal_consents drop constraint if exists legal_consents_document_check;
alter table public.legal_consents
  add constraint legal_consents_document_check
  check (document in ('terms', 'privacy', 'author_agreement', 'age_18'));

-- Sign-up metadata may carry age_confirmed = 'true' (email sign-up).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, name, email, avatar_initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'participant'),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    upper(left(coalesce(new.raw_user_meta_data ->> 'name', new.email), 2))
  );

  if (new.raw_user_meta_data ->> 'role') = 'author' then
    insert into public.author_details (profile_id) values (new.id);
  end if;

  if nullif(new.raw_user_meta_data ->> 'consent_version', '') is not null then
    insert into public.legal_consents (user_id, document, version)
    select new.id, d, new.raw_user_meta_data ->> 'consent_version'
    from unnest(array['terms', 'privacy']) as d
    on conflict do nothing;

    if (new.raw_user_meta_data ->> 'age_confirmed') = 'true' then
      insert into public.legal_consents (user_id, document, version)
      values (new.id, 'age_18', new.raw_user_meta_data ->> 'consent_version')
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- 2) Closed participant accounts (service role only; no policies).
create table if not exists public.closed_participants (
  profile_id uuid primary key references public.profiles (id) on delete restrict,
  email_hash text not null,          -- sha256 of the lower-cased old email
  closed_at timestamptz not null default now(),
  restored_to uuid references public.profiles (id) on delete set null,
  restored_at timestamptz
);
create index if not exists closed_participants_hash_idx on public.closed_participants (email_hash);
alter table public.closed_participants enable row level security;
revoke all on public.closed_participants from anon, authenticated;

-- 3) Close a participant who has purchases: keep purchases, remove personal data.
create or replace function public.close_participant_account(p_profile uuid, p_email_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if not exists (select 1 from public.profiles where id = p_profile and role = 'participant') then
    raise exception 'Not a participant account';
  end if;

  -- (consent records are kept as evidence of what was accepted)
  -- personal and learning records (a missing table/column in an older database is skipped)
  for t in
    select * from (values
      ('reviews', 'participant_id'), ('author_reviews', 'participant_id'),
      ('assessment_results', 'profile_id'), ('support_tickets', 'user_id'),
      ('content_reports', 'reporter_id'), ('content_comments', 'user_id'),
      ('content_progress', 'user_id'), ('content_program_completions', 'user_id'),
      ('content_item_feedback', 'user_id'), ('content_item_practice_responses', 'user_id'),
      ('content_item_reflections', 'user_id'), ('content_item_mood_checkins', 'user_id'),
      ('content_module_mood_checkins', 'user_id'), ('content_item_bookmarks', 'user_id'),
      ('content_item_saved_practices', 'user_id'), ('content_item_video_positions', 'user_id'),
      ('content_item_warning_acks', 'user_id'), ('meditation_audio_positions', 'user_id'),
      ('meditation_mood_checkins', 'user_id'), ('guide_fragment_saves', 'user_id'),
      ('guide_saved_for_later', 'user_id'), ('program_saved_for_later', 'user_id'),
      ('guide_checklist_checks', 'user_id'), ('guide_notes', 'user_id'),
      ('guide_self_assessments', 'user_id'), ('guide_section_views', 'user_id'),
      ('meditation_sessions', 'user_id'), ('author_post_comments', 'user_id'),
      ('author_post_likes', 'user_id'), ('author_follows', 'follower_id'),
      ('content_comment_reports', 'reporter_id'), ('author_post_comment_reports', 'reporter_id'),
      ('acquired_content', 'user_id'), ('user_sessions', 'profile_id')
    ) as v(tbl, col)
  loop
    begin
      execute format('delete from public.%I where %I = $1', t.tbl, t.col) using p_profile;
    exception when undefined_table or undefined_column or foreign_key_violation then
      null;
    end;
  end loop;

  insert into public.closed_participants (profile_id, email_hash)
  values (p_profile, p_email_hash)
  on conflict (profile_id) do nothing;

  update public.profiles
     set name = 'Видалений користувач',
         avatar_url = null,
         avatar_initials = null,
         email = 'closed-' || p_profile::text || '@deleted.invalid',
         notification_prefs = '{}'::jsonb,
         left_platform_at = coalesce(left_platform_at, now())
   where id = p_profile;
end;
$$;
revoke all on function public.close_participant_account(uuid, text) from public, anon, authenticated;

-- 4) Restore access: move the closed account's completed purchases to a new account.
create or replace function public.transfer_purchases(p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.closed_participants where profile_id = p_from) then
    raise exception 'Source account is not a closed participant account';
  end if;
  if not exists (select 1 from public.profiles where id = p_to and role = 'participant' and left_platform_at is null) then
    raise exception 'Target must be an active participant account';
  end if;
  update public.purchases set participant_id = p_to where participant_id = p_from;
  get diagnostics n = row_count;
  update public.closed_participants set restored_to = p_to, restored_at = now() where profile_id = p_from;
  return n;
end;
$$;
revoke all on function public.transfer_purchases(uuid, uuid) from public, anon, authenticated;

-- No pre-moderation: authors publish themselves; Sensoria reacts to complaints.
-- Run in the Supabase SQL Editor (safe to re-run). Run AFTER author-kind-migration.sql.
--
-- Changes content_publish_gate(): the "first material is checked by hand" rule
-- is gone. A material sent as 'review' goes live at once. What stays: the
-- high-risk-topic restriction (only for «Фахівець»). Materials already sitting
-- in 'review' are published too, so nothing stays stuck.

create or replace function public.content_publish_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_specialist boolean;
  v_risky boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status not in ('review', 'published') then
    return new;
  end if;

  select coalesce(education_verified, false)
    into v_specialist
    from public.author_details where profile_id = new.author_id;
  v_specialist := coalesce(v_specialist, false);

  -- high-risk topic → only a verified specialist (a publishing restriction,
  -- not a review of the material)
  v_risky := coalesce(cardinality(new.risk_topics), 0) > 0
    or (coalesce(new.title, '') || ' ' || coalesce(new.description, '')) ~*
       '(птср|посттравм|суїцид|самоушкодж|розлад[иуіав]* харчов|булімі|анорекс|залежн(ість|остей|остям)|діагноз|лікуванн|ліки|медикамент|психотерапі)';
  if v_risky and not v_specialist
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.risk_topics is distinct from old.risk_topics) then
    raise exception 'Теми підвищеного ризику (травма, суїцидальні думки, розлади харчової поведінки, залежності, діагнози й лікування) доступні лише авторам зі статусом «Фахівець» (документи про освіту переглянуто Sensoria). Надішліть документи в розділі «Модерація» або приберіть цю тему.'
      using errcode = 'P0001';
  end if;

  if new.status = 'review' then
    new.status := 'published';
  end if;
  return new;
end;
$$;

-- BEFORE running this file, look at what is waiting in the old queue:
--   select id, title, author_id, sale_status from public.content where status = 'review';
-- Only materials that waited for the old first-material approval are released
-- below. Anything with a complaint (open report) or a restricted sale status
-- stays in 'review' for a manual decision in the admin panel.
update public.content c set status = 'published'
 where c.status = 'review'
   and c.sale_status in ('published', 'restored')
   and not exists (
     select 1 from public.content_reports r
      where r.content_item_id = c.id::text and r.status = 'open'
   );

-- Sensoria own finance module: immutable ledger, author accounts, refunds,
-- debts, reserve, payouts, notifications, audit.
-- Run in the Supabase SQL Editor (safe to re-run). Run AFTER account-deletion-migration.sql.
-- It REPLACES the earlier Tranzzo-oriented payments-migration.sql (cleaned up in section 0).
--
-- Design (docs/finance-engine.md):
--  * every calculation is done by supabase/functions/finance (code tested in
--    src/utils/financeEngine.test.ts); this file stores the result atomically;
--  * all money is bigint KOPECKS;
--  * ledger_entries is append-only (update/delete/truncate are rejected);
--  * author_financial_accounts is a projection of the ledger, changed only by
--    finance_apply() in the same transaction as the ledger lines;
--  * nothing here moves real money. Real payments/payouts need the banking
--    layer after the legal review; until then finance_settings.mode = 'test'.

-- ── 0) remove the earlier Tranzzo-oriented objects ─────────────────────────
drop trigger if exists purchase_set_settlement_trg on public.purchases;
drop trigger if exists purchase_guard_settlement_trg on public.purchases;
drop function if exists public.purchase_set_settlement();
drop function if exists public.purchase_guard_settlement();
drop function if exists public.request_payout(numeric);
drop function if exists public.my_author_balance();
drop function if exists public.author_balance_of(uuid);
drop function if exists public.platform_commission_rate();
drop function if exists public.payment_hold_days();
drop function if exists public.min_payout_amount();
drop table if exists public.payout_requests;
drop table if exists public.author_card_tokens;
drop table if exists public.author_payment_accounts;
alter table public.purchases
  drop column if exists settlement_status,
  drop column if exists hold_until,
  drop column if exists platform_fee,
  drop column if exists author_amount,
  drop column if exists released_at,
  drop column if exists disputed_at,
  drop column if exists tranzzo_order_id,
  drop column if exists tranzzo_split_id;

-- ── 1) settings (one row; percentages live ONLY here) ──────────────────────
create table if not exists public.finance_settings (
  id int primary key default 1 check (id = 1),
  author_bps int not null default 7000 check (author_bps between 0 and 10000),
  commission_bps int not null default 3000 check (commission_bps between 0 and 10000),
  referral_commission_bps int not null default 1500 check (referral_commission_bps between 0 and 10000),
  hold_days int not null default 14 check (hold_days >= 0),
  reserve_bps int not null default 0 check (reserve_bps between 0 and 10000),
  reserve_days int not null default 0 check (reserve_days >= 0),
  inactivity_days int not null default 14 check (inactivity_days > 0),
  warning_grace_days int not null default 3 check (warning_grace_days >= 0),
  reminder_days int not null default 3 check (reminder_days >= 0),
  min_payout_kop bigint not null default 50000 check (min_payout_kop >= 0),
  -- the bank's tariff, charged to the BUYER on top of the price (grossed up by the engine)
  bank_fee_bps int not null default 0 check (bank_fee_bps between 0 and 9999),
  bank_fee_fixed_kop bigint not null default 0 check (bank_fee_fixed_kop >= 0),
  auto_payout boolean not null default true,
  -- the acquirer/bank splits each payment at once: 25 % to Sensoria's FOP account, 75 % to the author's (no hold, no payouts)
  split_at_source boolean not null default true,
  -- Sensoria's own account that receives the platform's 25 % (shown in the registry)
  sensoria_iban text,
  sensoria_account_holder text,
  -- 'test' = nothing real moves; 'live' needs the banking layer (not built yet)
  mode text not null default 'test' check (mode in ('test', 'live')),
  updated_at timestamptz not null default now(),
  constraint finance_shares_sum check (author_bps + commission_bps = 10000)
);
insert into public.finance_settings (id) values (1) on conflict do nothing;
alter table public.finance_settings enable row level security;
-- no policies: read/changed only by the finance Edge Function (service role)

-- ── 2) accounts, payments, debts, reserves, refunds, payouts ───────────────
-- No foreign keys to profiles/purchases on purpose: the financial history must
-- survive the deletion or closing of any account.
create table if not exists public.author_financial_accounts (
  author_id uuid primary key,
  pending_kop bigint not null default 0 check (pending_kop >= 0),
  available_kop bigint not null default 0 check (available_kop >= 0),
  reserved_kop bigint not null default 0 check (reserved_kop >= 0),
  debt_kop bigint not null default 0 check (debt_kop >= 0),
  in_flight_kop bigint not null default 0 check (in_flight_kop >= 0),
  lifetime_earnings_kop bigint not null default 0,
  total_paid_out_kop bigint not null default 0,
  total_refunded_kop bigint not null default 0,
  account_status text not null default 'ACTIVE'
    check (account_status in ('ACTIVE','DEBT','INACTIVE_WITH_DEBT','WARNING','SALES_SUSPENDED','DEBT_COLLECTION','CLOSURE_REQUESTED','CLOSED')),
  admin_hold boolean not null default false,
  sales_suspended boolean not null default false,
  last_meaningful_activity_at timestamptz,
  warning_at timestamptz,
  reminder_sent_at timestamptz,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_payments (
  id uuid primary key,
  purchase_id uuid not null unique,
  author_id uuid not null,
  buyer_id uuid,
  amount_kop bigint not null check (amount_kop > 0),     -- the PRICE
  fee_kop bigint not null default 0 check (fee_kop >= 0),  -- bank fee the buyer paid on top
  gross_kop bigint,                                        -- price + fee: what the buyer was charged
  content_id uuid,
  content_title text,
  fee_refunded_kop bigint not null default 0,
  split_author_kop bigint,      -- instruction for the acquirer: what goes to the author's account
  split_sensoria_kop bigint,    -- ... and what goes to Sensoria's (25 % + author debt recovered)
  currency text not null default 'UAH',
  payment_status text not null default 'received'
    check (payment_status in ('initiated','confirmed','received','failed')),
  external_reference text,
  mode text not null default 'test' check (mode in ('test','live')),
  -- the shares this order was made with: later settings changes never touch it
  author_bps int not null,
  commission_bps int not null,
  sale_source text not null default 'catalog' check (sale_source in ('catalog','referral')),
  author_kop bigint not null,
  sensoria_kop bigint not null,
  pending_kop bigint not null default 0 check (pending_kop >= 0),
  hold_until timestamptz not null,
  refunded_kop bigint not null default 0 check (refunded_kop >= 0),
  author_refunded_kop bigint not null default 0,
  sensoria_refunded_kop bigint not null default 0,
  disputed boolean not null default false,
  confirmed_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  check (author_kop + sensoria_kop = amount_kop),
  check (refunded_kop <= amount_kop)
);
create index if not exists finance_payments_author_idx on public.finance_payments (author_id, hold_until);

create table if not exists public.finance_refunds (
  id uuid primary key,
  payment_id uuid not null references public.finance_payments (id),
  order_id uuid not null,
  buyer_id uuid,
  author_id uuid not null,
  total_refund_kop bigint not null check (total_refund_kop > 0),  -- price part
  fee_refund_kop bigint not null default 0,                         -- bank fee returned to the buyer
  buyer_refund_kop bigint,                                          -- price part + fee: what the buyer gets
  author_share_kop bigint not null,
  sensoria_share_kop bigint not null,
  refund_type text not null check (refund_type in ('full','partial','chargeback')),
  idempotency_key text not null unique,
  status text not null default 'approved' check (status in ('requested','approved','completed','failed')),
  reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.author_debts (
  id uuid primary key,
  author_id uuid not null,
  source_refund_id uuid references public.finance_refunds (id),
  original_kop bigint not null check (original_kop > 0),
  outstanding_kop bigint not null check (outstanding_kop >= 0),
  reason text not null,
  status text not null default 'open' check (status in ('open','repaid')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists author_debts_author_idx on public.author_debts (author_id, status, created_at);

create table if not exists public.refund_reserves (
  id uuid primary key,
  author_id uuid not null,
  payment_id uuid not null references public.finance_payments (id),
  reserved_kop bigint not null check (reserved_kop > 0),
  released_kop bigint not null default 0,
  used_kop bigint not null default 0,
  status text not null default 'held' check (status in ('held','released','used')),
  release_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (released_kop + used_kop <= reserved_kop)
);
create index if not exists refund_reserves_author_idx on public.refund_reserves (author_id, status, release_at);

create table if not exists public.payouts (
  id uuid primary key,
  author_id uuid not null,
  amount_kop bigint not null check (amount_kop > 0),
  currency text not null default 'UAH',
  payout_status text not null default 'requested'
    check (payout_status in ('requested','processing','paid','failed','cancelled')),
  destination text not null,           -- masked label for screens
  bank_account_id uuid,                -- the author's VERIFIED account this order was made for
  destination_iban text,               -- snapshot for the bank registry (the only place it is copied)
  destination_holder text,
  destination_tax_id text,
  is_auto boolean not null default false,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  confirmation_reference text,
  failure_reason text
);
create index if not exists payouts_author_idx on public.payouts (author_id, requested_at desc);
create index if not exists payouts_status_idx on public.payouts (payout_status);

-- The author's bank account. Money is paid ONLY to a 'verified' one: an
-- administrator checks that the holder is the author (name + tax id) before
-- verifying. A changed account starts as 'pending' again; the old verified one
-- keeps working until the new one is verified (then it becomes 'replaced').
create table if not exists public.author_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  iban text not null check (iban ~ '^UA[0-9]{27}$'),
  bank_name text,
  holder_name text not null check (length(btrim(holder_name)) >= 5),
  tax_id text not null check (tax_id ~ '^([0-9]{8}|[0-9]{10})$'),
  status text not null default 'pending' check (status in ('pending','verified','rejected','replaced')),
  reject_reason text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists author_bank_one_verified on public.author_bank_accounts (author_id) where status = 'verified';
create unique index if not exists author_bank_one_pending on public.author_bank_accounts (author_id) where status = 'pending';
create index if not exists author_bank_author_idx on public.author_bank_accounts (author_id, created_at desc);
alter table public.author_bank_accounts enable row level security;
drop policy if exists "authors read own" on public.author_bank_accounts;
create policy "authors read own" on public.author_bank_accounts for select using (auth.uid() = author_id);
-- writes: only the finance Edge Function (it validates the IBAN checksum)

-- ── 3) the immutable ledger ────────────────────────────────────────────────
create table if not exists public.finance_operations (
  key text primary key,                -- idempotency: an operation is applied at most once
  kind text not null,
  author_id uuid,
  actor_id uuid,
  created_at timestamptz not null default now()
);
alter table public.finance_operations enable row level security;

create table if not exists public.ledger_entries (
  id bigint generated always as identity primary key,
  operation_key text not null references public.finance_operations (key),
  type text not null check (type in (
    'PAYMENT_RECEIVED','AUTHOR_EARNING','SENSORIA_COMMISSION','AUTHOR_PAYOUT','REFUND','PARTIAL_REFUND',
    'AUTHOR_DEBT_CREATED','AUTHOR_DEBT_REPAID','REFUND_RESERVE_CREATED','REFUND_RESERVE_RELEASED',
    'CHARGEBACK','MANUAL_ADJUSTMENT','HOLD_RELEASED','BANK_FEE_COLLECTED','BANK_FEE_PAID')),
  account text not null check (account in (
    'cash_in','cash_out','sensoria_revenue','author_pending','author_available','author_reserved',
    'author_debt','payout_in_flight','bank_fee','author_paid_out','author_earned','author_refunded')),
  delta_kop bigint not null,
  currency text not null default 'UAH',
  author_id uuid,
  payment_id uuid,
  refund_id uuid,
  payout_id uuid,
  order_id uuid,
  buyer_id uuid,
  author_share_kop bigint,
  sensoria_share_kop bigint,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_author_idx on public.ledger_entries (author_id, id desc);
create index if not exists ledger_order_idx on public.ledger_entries (order_id);
create index if not exists ledger_op_idx on public.ledger_entries (operation_key);
alter table public.ledger_entries enable row level security;

create or replace function public.ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Фінансовий журнал не редагується: зробіть компенсуючу операцію.' using errcode = 'P0001';
end;
$$;
drop trigger if exists ledger_no_change on public.ledger_entries;
create trigger ledger_no_change before update or delete on public.ledger_entries
  for each row execute function public.ledger_immutable();
drop trigger if exists ledger_no_truncate on public.ledger_entries;
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function public.ledger_immutable();

-- ── 4) notifications, activity, status history, audit ──────────────────────
create table if not exists public.financial_notifications (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  event_type text not null,
  dedupe_key text not null,
  message text not null,
  amount_kop bigint,
  related_operation text,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','skipped','failed')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (author_id, dedupe_key)       -- the same event is never sent twice
);
create index if not exists financial_notifications_author_idx on public.financial_notifications (author_id, created_at desc);
create index if not exists financial_notifications_pending_idx on public.financial_notifications (delivery_status) where delivery_status = 'pending';

create table if not exists public.author_activity (
  id bigint generated always as identity primary key,
  author_id uuid not null,
  activity_type text not null,
  is_meaningful boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists author_activity_author_idx on public.author_activity (author_id, created_at desc);

create table if not exists public.author_status_log (
  id bigint generated always as identity primary key,
  author_id uuid not null,
  from_status text not null,
  to_status text not null,
  reason text,
  operation_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_audit_log (
  id bigint generated always as identity primary key,
  administrator_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create or replace function public.audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Журнал аудиту не редагується.' using errcode = 'P0001';
end;
$$;
drop trigger if exists finance_audit_no_change on public.finance_audit_log;
create trigger finance_audit_no_change before update or delete on public.finance_audit_log
  for each row execute function public.audit_immutable();

alter table public.author_financial_accounts enable row level security;
alter table public.finance_payments enable row level security;
alter table public.finance_refunds enable row level security;
alter table public.author_debts enable row level security;
alter table public.refund_reserves enable row level security;
alter table public.payouts enable row level security;
alter table public.financial_notifications enable row level security;
alter table public.author_activity enable row level security;
alter table public.author_status_log enable row level security;
alter table public.finance_audit_log enable row level security;

-- An author reads ONLY their own rows; nobody writes from the browser.
do $$
declare t text;
begin
  foreach t in array array['author_financial_accounts','finance_payments','finance_refunds','author_debts','refund_reserves','payouts','author_status_log'] loop
    execute format('drop policy if exists "authors read own" on public.%I', t);
    execute format('create policy "authors read own" on public.%I for select using (auth.uid() = author_id)', t);
  end loop;
end $$;
drop policy if exists "authors read own" on public.ledger_entries;
create policy "authors read own" on public.ledger_entries for select using (auth.uid() = author_id);
drop policy if exists "authors read own" on public.financial_notifications;
create policy "authors read own" on public.financial_notifications for select using (auth.uid() = author_id);
drop policy if exists "authors mark own notifications read" on public.financial_notifications;
-- (marking as read goes through the Edge Function; no update policy)

-- ── 5) a new sale status: sales paused because of an unpaid debt ───────────
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.content'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%sale_status%' loop
    execute format('alter table public.content drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.content add constraint content_sale_status_check
  check (sale_status in ('published', 'complaint_pending', 'unlisted', 'restored', 'suspended_debt'));

-- No NEW purchase of material that is not on sale (existing buyers keep access).
create or replace function public.purchase_sale_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_sale text;
begin
  if auth.uid() is null then return new; end if;     -- service role
  select sale_status into v_sale from public.content where id = new.content_id;
  if v_sale is not null and v_sale not in ('published', 'restored') then
    raise exception 'Продаж цього матеріалу тимчасово призупинено.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists purchase_sale_gate_trg on public.purchases;
create trigger purchase_sale_gate_trg before insert on public.purchases
  for each row execute function public.purchase_sale_gate();

-- Authors managing their material count as «meaningful activity».
create or replace function public.finance_touch_on_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = new.author_id then
    update public.author_financial_accounts
       set last_meaningful_activity_at = now(),
           account_status = case when account_status in ('WARNING','INACTIVE_WITH_DEBT')
                                 then case when debt_kop > 0 then 'DEBT' else 'ACTIVE' end
                                 else account_status end,
           warning_at = case when account_status in ('WARNING','INACTIVE_WITH_DEBT') then null else warning_at end,
           version = version + 1,
           updated_at = now()
     where author_id = new.author_id;
  end if;
  return new;
end;
$$;
drop trigger if exists finance_touch_on_content_trg on public.content;
create trigger finance_touch_on_content_trg after insert or update on public.content
  for each row execute function public.finance_touch_on_content();

-- ── 6) finance_apply: ONE transaction per operation ────────────────────────
-- p = a Plan made by the engine (see src/utils/financeEngine.ts).
create or replace function public.finance_apply(p jsonb, p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := p->>'key';
  v_author uuid := nullif(p->>'authorId', '')::uuid;
  v_acc public.author_financial_accounts;
  v_acct jsonb := coalesce(p->'account', '{}'::jsonb);
  v_op jsonb;
  v_row jsonb;
  v_sums record;
  v_susp text;
begin
  if auth.role() is distinct from 'service_role' and auth.uid() is not null then
    raise exception 'Лише сервер фінансового модуля може змінювати баланси.' using errcode = 'P0001';
  end if;

  -- idempotency: the same operation is applied at most once
  begin
    insert into finance_operations (key, kind, author_id, actor_id)
    values (v_key, p->>'kind', v_author, p_actor);
  exception when unique_violation then
    raise exception 'finance_duplicate' using errcode = 'P0001';
  end;

  if v_author is not null then
    insert into author_financial_accounts (author_id) values (v_author) on conflict do nothing;
    select * into v_acc from author_financial_accounts where author_id = v_author for update;
    if p->>'expectedVersion' is not null and (p->>'expectedVersion')::int <> v_acc.version then
      raise exception 'finance_version_conflict' using errcode = 'P0001';
    end if;
  end if;

  -- payments → reserves → refunds → debts → payouts (FK order)
  for v_op in select * from jsonb_array_elements(coalesce(p->'payments', '[]')) loop
    v_row := v_op->'row';
    if v_op->>'op' = 'insert' then
      insert into finance_payments (id, purchase_id, author_id, buyer_id, amount_kop, fee_kop, gross_kop, content_id,
        content_title, currency, payment_status,
        external_reference, mode, author_bps, commission_bps, sale_source, author_kop, sensoria_kop, pending_kop, hold_until,
        split_author_kop, split_sensoria_kop, confirmed_at, received_at)
      values ((v_row->>'id')::uuid, (v_row->>'purchase_id')::uuid, (v_row->>'author_id')::uuid,
        nullif(v_row->>'buyer_id','')::uuid, (v_row->>'amount_kop')::bigint, coalesce((v_row->>'fee_kop')::bigint, 0),
        nullif(v_row->>'gross_kop','')::bigint, nullif(v_row->>'content_id','')::uuid, v_row->>'content_title',
        coalesce(v_row->>'currency','UAH'),
        v_row->>'payment_status', v_row->>'external_reference', v_row->>'mode', (v_row->>'author_bps')::int,
        (v_row->>'commission_bps')::int, coalesce(v_row->>'sale_source','catalog'), (v_row->>'author_kop')::bigint, (v_row->>'sensoria_kop')::bigint,
        (v_row->>'pending_kop')::bigint, (v_row->>'hold_until')::timestamptz,
        nullif(v_row->>'split_author_kop','')::bigint, nullif(v_row->>'split_sensoria_kop','')::bigint,
        (v_row->>'confirmed_at')::timestamptz, (v_row->>'received_at')::timestamptz);
    else
      update finance_payments set
        pending_kop = case when v_row ? 'pending_kop' then (v_row->>'pending_kop')::bigint else pending_kop end,
        refunded_kop = case when v_row ? 'refunded_kop' then (v_row->>'refunded_kop')::bigint else refunded_kop end,
        author_refunded_kop = case when v_row ? 'author_refunded_kop' then (v_row->>'author_refunded_kop')::bigint else author_refunded_kop end,
        sensoria_refunded_kop = case when v_row ? 'sensoria_refunded_kop' then (v_row->>'sensoria_refunded_kop')::bigint else sensoria_refunded_kop end,
        fee_refunded_kop = case when v_row ? 'fee_refunded_kop' then (v_row->>'fee_refunded_kop')::bigint else fee_refunded_kop end,
        disputed = case when v_row ? 'disputed' then (v_row->>'disputed')::boolean else disputed end
      where id = (v_row->>'id')::uuid;
    end if;
  end loop;

  for v_op in select * from jsonb_array_elements(coalesce(p->'reserves', '[]')) loop
    v_row := v_op->'row';
    if v_op->>'op' = 'insert' then
      insert into refund_reserves (id, author_id, payment_id, reserved_kop, released_kop, used_kop, status, release_at)
      values ((v_row->>'id')::uuid, (v_row->>'author_id')::uuid, (v_row->>'payment_id')::uuid,
        (v_row->>'reserved_kop')::bigint, 0, 0, 'held', (v_row->>'release_at')::timestamptz);
    else
      update refund_reserves set
        released_kop = case when v_row ? 'released_kop' then (v_row->>'released_kop')::bigint else released_kop end,
        used_kop = case when v_row ? 'used_kop' then (v_row->>'used_kop')::bigint else used_kop end,
        status = coalesce(v_row->>'status', status)
      where id = (v_row->>'id')::uuid;
    end if;
  end loop;

  for v_op in select * from jsonb_array_elements(coalesce(p->'refunds', '[]')) loop
    v_row := v_op->'row';
    insert into finance_refunds (id, payment_id, order_id, buyer_id, author_id, total_refund_kop, fee_refund_kop,
      buyer_refund_kop, author_share_kop,
      sensoria_share_kop, refund_type, idempotency_key, status, reason, completed_at)
    values ((v_row->>'id')::uuid, (v_row->>'payment_id')::uuid, (v_row->>'order_id')::uuid, nullif(v_row->>'buyer_id','')::uuid,
      (v_row->>'author_id')::uuid, (v_row->>'total_refund_kop')::bigint, coalesce((v_row->>'fee_refund_kop')::bigint, 0),
      nullif(v_row->>'buyer_refund_kop','')::bigint, (v_row->>'author_share_kop')::bigint,
      (v_row->>'sensoria_share_kop')::bigint, v_row->>'refund_type', v_row->>'idempotency_key', v_row->>'status',
      v_row->>'reason', null);
  end loop;

  for v_op in select * from jsonb_array_elements(coalesce(p->'debts', '[]')) loop
    v_row := v_op->'row';
    if v_op->>'op' = 'insert' then
      insert into author_debts (id, author_id, source_refund_id, original_kop, outstanding_kop, reason, status)
      values ((v_row->>'id')::uuid, (v_row->>'author_id')::uuid, nullif(v_row->>'source_refund_id','')::uuid,
        (v_row->>'original_kop')::bigint, (v_row->>'outstanding_kop')::bigint, v_row->>'reason', 'open');
    else
      update author_debts set
        outstanding_kop = (v_row->>'outstanding_kop')::bigint,
        status = v_row->>'status',
        resolved_at = nullif(v_row->>'resolved_at','')::timestamptz
      where id = (v_row->>'id')::uuid;
    end if;
  end loop;

  for v_op in select * from jsonb_array_elements(coalesce(p->'payouts', '[]')) loop
    v_row := v_op->'row';
    if v_op->>'op' = 'insert' then
      insert into payouts (id, author_id, amount_kop, currency, payout_status, destination, bank_account_id,
        destination_iban, destination_holder, destination_tax_id, is_auto, requested_at)
      values ((v_row->>'id')::uuid, (v_row->>'author_id')::uuid, (v_row->>'amount_kop')::bigint,
        coalesce(v_row->>'currency','UAH'), 'requested', v_row->>'destination', nullif(v_row->>'bank_account_id','')::uuid,
        v_row->>'destination_iban', v_row->>'destination_holder', v_row->>'destination_tax_id',
        coalesce((v_row->>'is_auto')::boolean, false), (v_row->>'requested_at')::timestamptz);
    else
      update payouts set
        payout_status = coalesce(v_row->>'payout_status', payout_status),
        processed_at = case when v_row ? 'processed_at' then (v_row->>'processed_at')::timestamptz else processed_at end,
        confirmation_reference = coalesce(v_row->>'confirmation_reference', confirmation_reference),
        failure_reason = coalesce(v_row->>'failure_reason', failure_reason)
      where id = (v_row->>'id')::uuid;
    end if;
  end loop;

  -- the ledger lines
  insert into ledger_entries (operation_key, type, account, delta_kop, author_id, payment_id, refund_id, payout_id,
    order_id, buyer_id, author_share_kop, sensoria_share_kop, reason)
  select v_key, l->>'type', l->>'account', (l->>'delta')::bigint, nullif(l->>'authorId','')::uuid,
    nullif(l->>'paymentId','')::uuid, nullif(l->>'refundId','')::uuid, nullif(l->>'payoutId','')::uuid,
    nullif(l->>'orderId','')::uuid, nullif(l->>'buyerId','')::uuid,
    nullif(l->>'authorShare','')::bigint, nullif(l->>'sensoriaShare','')::bigint, l->>'reason'
  from jsonb_array_elements(coalesce(p->'lines', '[]')) l;

  -- the projection: exactly the sums of this operation's author lines
  if v_author is not null then
    select
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_pending'), 0) as pending,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_available'), 0) as available,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_reserved'), 0) as reserved,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_debt'), 0) as debt,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'payout_in_flight'), 0) as in_flight,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_earned'), 0) as earned,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_paid_out'), 0) as paid_out,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_refunded'), 0) as refunded
    into v_sums
    from jsonb_array_elements(coalesce(p->'lines', '[]')) l
    where nullif(l->>'authorId','')::uuid = v_author;

    update author_financial_accounts set
      pending_kop = pending_kop + v_sums.pending,
      available_kop = available_kop + v_sums.available,
      reserved_kop = reserved_kop + v_sums.reserved,
      debt_kop = debt_kop + v_sums.debt,
      in_flight_kop = in_flight_kop + v_sums.in_flight,
      lifetime_earnings_kop = lifetime_earnings_kop + v_sums.earned,
      total_paid_out_kop = total_paid_out_kop + v_sums.paid_out,
      total_refunded_kop = total_refunded_kop + v_sums.refunded,
      account_status = coalesce(v_acct->>'status', account_status),
      admin_hold = case when v_acct ? 'adminHold' then (v_acct->>'adminHold')::boolean else admin_hold end,
      sales_suspended = case when v_acct ? 'salesSuspended' then (v_acct->>'salesSuspended')::boolean else sales_suspended end,
      last_meaningful_activity_at = case when v_acct ? 'lastMeaningfulActivityAt' then (v_acct->>'lastMeaningfulActivityAt')::timestamptz else last_meaningful_activity_at end,
      warning_at = case when v_acct ? 'warningAt' then nullif(v_acct->>'warningAt','')::timestamptz else warning_at end,
      reminder_sent_at = case when v_acct ? 'reminderSentAt' then nullif(v_acct->>'reminderSentAt','')::timestamptz else reminder_sent_at end,
      version = version + 1,
      updated_at = now()
    where author_id = v_author;

    -- pause / resume NEW sales of this author's published materials
    if v_acct ? 'salesSuspended' then
      perform set_config('sensoria.sale_system', '1', true);
      if (v_acct->>'salesSuspended')::boolean then
        update content set sale_status = 'suspended_debt'
         where author_id = v_author and sale_status in ('published', 'restored');
      else
        update content set sale_status = 'published'
         where author_id = v_author and sale_status = 'suspended_debt';
      end if;
    end if;

    for v_op in select * from jsonb_array_elements(coalesce(p->'statusLog', '[]')) loop
      insert into author_status_log (author_id, from_status, to_status, reason, operation_key)
      values (v_author, v_op->>'from', v_op->>'to', v_op->>'reason', v_key);
    end loop;

    insert into financial_notifications (author_id, event_type, dedupe_key, message, amount_kop, related_operation)
    select v_author, n->>'eventType', n->>'dedupeKey', n->>'message', nullif(n->>'amountKop','')::bigint, n->>'relatedOperation'
    from jsonb_array_elements(coalesce(p->'notifications', '[]')) n
    on conflict (author_id, dedupe_key) do nothing;
  end if;

  if p ? 'audit' and p->'audit' is not null and jsonb_typeof(p->'audit') = 'object' then
    insert into finance_audit_log (administrator_id, action, entity_type, entity_id, reason, previous_value, new_value)
    values (p_actor, p->'audit'->>'action', 'author', v_author::text, p->'audit'->>'reason',
      p->'audit'->'previous', p->'audit'->'next');
  end if;

  return jsonb_build_object('ok', true, 'key', v_key);
end;
$$;
revoke all on function public.finance_apply(jsonb, uuid) from public, anon, authenticated;

-- ── 7) checks and reports (service role only) ──────────────────────────────
-- Projection vs ledger, per author. Empty result = consistent.
create or replace function public.finance_verify()
returns table (author_id uuid, field text, projection bigint, ledger bigint)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select e.author_id,
      coalesce(sum(delta_kop) filter (where account = 'author_pending'), 0)::bigint as pending,
      coalesce(sum(delta_kop) filter (where account = 'author_available'), 0)::bigint as available,
      coalesce(sum(delta_kop) filter (where account = 'author_reserved'), 0)::bigint as reserved,
      coalesce(sum(delta_kop) filter (where account = 'author_debt'), 0)::bigint as debt,
      coalesce(sum(delta_kop) filter (where account = 'payout_in_flight'), 0)::bigint as in_flight
    from ledger_entries e where e.author_id is not null group by e.author_id
  )
  select a.author_id, f.field, f.proj, f.led
  from author_financial_accounts a
  left join s on s.author_id = a.author_id
  cross join lateral (values
    ('pending', a.pending_kop, coalesce(s.pending, 0)::bigint),
    ('available', a.available_kop, coalesce(s.available, 0)),
    ('reserved', a.reserved_kop, coalesce(s.reserved, 0)),
    ('debt', a.debt_kop, coalesce(s.debt, 0)),
    ('in_flight', a.in_flight_kop, coalesce(s.in_flight, 0))
  ) as f(field, proj, led)
  where f.proj <> f.led;
$$;
revoke all on function public.finance_verify() from public, anon, authenticated;

-- Whole-platform conservation: confirmed cash in − cash out = everything owed.
create or replace function public.finance_totals()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'turnover_kop', coalesce(sum(delta_kop) filter (where account = 'cash_in'), 0),
    'cash_out_kop', coalesce(sum(delta_kop) filter (where account = 'cash_out'), 0),
    'sensoria_revenue_kop', coalesce(sum(delta_kop) filter (where account = 'sensoria_revenue'), 0),
    'author_pending_kop', coalesce(sum(delta_kop) filter (where account = 'author_pending'), 0),
    'author_available_kop', coalesce(sum(delta_kop) filter (where account = 'author_available'), 0),
    'author_reserved_kop', coalesce(sum(delta_kop) filter (where account = 'author_reserved'), 0),
    'author_debt_kop', coalesce(sum(delta_kop) filter (where account = 'author_debt'), 0),
    'in_flight_kop', coalesce(sum(delta_kop) filter (where account = 'payout_in_flight'), 0),
    'bank_fee_owed_kop', coalesce(sum(delta_kop) filter (where account = 'bank_fee'), 0),
    'paid_out_kop', coalesce(sum(delta_kop) filter (where account = 'author_paid_out'), 0),
    'earned_kop', coalesce(sum(delta_kop) filter (where account = 'author_earned'), 0),
    'refunded_kop', coalesce(sum(delta_kop) filter (where type in ('REFUND','PARTIAL_REFUND','CHARGEBACK') and account = 'cash_out'), 0),
    'gap_kop',
      coalesce(sum(delta_kop) filter (where account = 'cash_in'), 0)
      - coalesce(sum(delta_kop) filter (where account = 'cash_out'), 0)
      - ( coalesce(sum(delta_kop) filter (where account in ('sensoria_revenue','author_pending','author_available','author_reserved','payout_in_flight','bank_fee')), 0)
          - coalesce(sum(delta_kop) filter (where account = 'author_debt'), 0) )
  ) from ledger_entries;
$$;
revoke all on function public.finance_totals() from public, anon, authenticated;

-- ── 8) journal of the buyer's actions (chargeback evidence) ────────────────
-- Exact time, IP and user id at the moment a buyer opens or downloads paid
-- content. Written ONLY by the `log-content-access` Edge Function, which
-- reads the IP from the request itself — a client cannot choose or skip it.
create table if not exists public.content_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content_id uuid not null,
  purchase_id uuid,
  action text not null check (action in ('open', 'download')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists content_access_log_user_idx on public.content_access_log (user_id, created_at desc);
create index if not exists content_access_log_content_idx on public.content_access_log (content_id, created_at desc);
create index if not exists content_access_log_purchase_idx on public.content_access_log (purchase_id);
alter table public.content_access_log enable row level security;
-- no policies: neither authors nor buyers can read or edit it; the service
-- role (admin function, evidence export for Tranzzo) bypasses RLS.
-- Deliberately no foreign keys: the journal must survive account/content deletion.

-- ── 9) the terms authors may SEE (the settings table itself stays private) ──
create or replace function public.finance_public_terms()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'commission_bps', commission_bps,
    'author_bps', author_bps,
    'referral_commission_bps', referral_commission_bps,
    'hold_days', hold_days,
    'reserve_bps', reserve_bps,
    'reserve_days', reserve_days,
    'inactivity_days', inactivity_days,
    'warning_grace_days', warning_grace_days,
    'min_payout_kop', min_payout_kop,
    'bank_fee_bps', bank_fee_bps,
    'bank_fee_fixed_kop', bank_fee_fixed_kop,
    'auto_payout', auto_payout,
    'split_at_source', split_at_source,
    'mode', mode
  ) from finance_settings where id = 1;
$$;
grant execute on function public.finance_public_terms() to authenticated;


-- ── Referral attribution ────────────────────────────────────────────────────
-- A buyer who came through an author's referral link gets a lower platform
-- commission on that author's materials for 30 days. The browser only remembers
-- the author id; THIS table is the proof, and only the server writes it.
-- The finance function reads it when a payment is confirmed (never the client).
create table if not exists public.referral_attributions (
  buyer_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (buyer_id, author_id)
);
alter table public.referral_attributions enable row level security;
-- no policies: no direct reads or writes from the app

create or replace function public.claim_referral(p_author uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- an author cannot refer themselves; the target must be a real author
  if p_author = auth.uid() then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_author and role = 'author') then
    return;
  end if;
  -- last click wins: a fresh click refreshes the 30-day window
  insert into public.referral_attributions (buyer_id, author_id, created_at)
  values (auth.uid(), p_author, now())
  on conflict (buyer_id, author_id) do update set created_at = excluded.created_at;
end;
$$;
revoke all on function public.claim_referral(uuid) from public;
grant execute on function public.claim_referral(uuid) to authenticated;

-- Free materials added from the cart to the cabinet (see acquired-content-migration.sql).
create table if not exists public.acquired_content (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('program', 'guide', 'meditation')),
  content_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, kind, content_id)
);
alter table public.acquired_content enable row level security;
drop policy if exists "people read their own acquired content" on public.acquired_content;
create policy "people read their own acquired content" on public.acquired_content for select using (auth.uid() = user_id);
drop policy if exists "people add free content to their own cabinet" on public.acquired_content;
create policy "people add free content to their own cabinet" on public.acquired_content for insert with check (
  auth.uid() = user_id
  and (kind <> 'program' or exists (select 1 from public.content c where c.id::text = acquired_content.content_id and c.status = 'published' and c.price = 0))
);
drop policy if exists "people remove their own acquired content" on public.acquired_content;
create policy "people remove their own acquired content" on public.acquired_content for delete using (auth.uid() = user_id);
