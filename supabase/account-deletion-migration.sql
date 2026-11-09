-- Account deletion that keeps what people paid for, and 18+ confirmation.
-- Run in the Supabase SQL Editor (safe to re-run).
-- Run AFTER author-exit-migration.sql and consent-migration.sql.
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
