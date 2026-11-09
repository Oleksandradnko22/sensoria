-- «Про мене» story fields (author-written, public with the profile):
-- one jsonb column on author_details — intro video + first-person text,
-- viewpoint, principles, "why I chose this", themes (with optional material
-- link) and 2–3 short FAQ answers. Shape is validated/trimmed in the app
-- (utils/authorStory.ts). author_details is already publicly readable and
-- author-writable by RLS, so no new policies are needed. Safe to re-run.
alter table public.author_details add column if not exists story jsonb;
notify pgrst, 'reload schema';
