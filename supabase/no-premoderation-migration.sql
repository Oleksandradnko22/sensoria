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
