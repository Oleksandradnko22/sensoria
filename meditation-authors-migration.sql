-- "Ця практика була корисною?" feedback reaching the author's own
-- cabinet (2026-08-30, per Sasha's explicit call). New table +
-- policies, additive only — nothing existing changes.

create table public.meditation_authors (
  meditation_id text primary key,
  author_id uuid not null references public.profiles (id) on delete cascade
);

alter table public.meditation_authors enable row level security;

create policy "meditation_authors readable by signed-in users"
  on public.meditation_authors for select
  using (auth.uid() is not null);

create policy "authors view feedback on their own meditations"
  on public.content_item_feedback for select
  using (
    exists (
      select 1 from public.meditation_authors ma
      where ma.meditation_id = content_item_feedback.content_item_id
        and ma.author_id = auth.uid()
    )
  );

-- SEEDING: assigns every meditation currently in data/meditations.ts to
-- whichever author account was created first — a reasonable single-team
-- default, not a real editorial decision. Reassign any row any time,
-- e.g.:
--   update public.meditation_authors set author_id = '<other-author-uuid>'
--   where meditation_id = 'quick-grounding';
--
-- 2026-09-24: trimmed to just quick-grounding — the other 4 meditations
-- were removed from data/meditations.ts (placeholder audio only, no
-- real content). If this migration already ran against a live database
-- before this change, the 4 now-stale rows for anti-anxiety-breathing/
-- post-load-recovery/self-support/deep-relaxation are harmless orphans
-- (meditation_id has no FK to a meditations table) but can be cleaned
-- up with:
--   delete from public.meditation_authors
--   where meditation_id in ('anti-anxiety-breathing', 'post-load-recovery', 'self-support', 'deep-relaxation');
insert into public.meditation_authors (meditation_id, author_id)
select id, (select id from public.profiles where role = 'author' order by created_at asc limit 1)
from unnest(array[
  'quick-grounding'
]) as id
where exists (select 1 from public.profiles where role = 'author')
on conflict (meditation_id) do nothing;
