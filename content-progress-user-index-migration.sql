-- 2026-09-21, real program participation architecture ("Моє навчання"
-- audit follow-up). content_progress previously had no index that
-- serves a plain "every row for this participant" scan — only the
-- implicit unique(content_id, user_id) index, which needs content_id
-- to be useful. "Моє навчання" now bulk-fetches every content_progress
-- row for the signed-in participant in one query (see
-- lib/contentProgressSync.ts's fetchAllProgress) instead of one lookup
-- per already-known program id — same shape program_saved_for_later
-- and guide_section_views already have a dedicated index for. Виконати
-- в Supabase → SQL Editor одним запитом.

create index if not exists content_progress_user_idx on public.content_progress (user_id);
