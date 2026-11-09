-- Author kinds, first-material check, high-risk topics.
-- Run in the Supabase SQL Editor (safe to re-run).
-- Run AFTER admin-panel-migration.sql.
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
