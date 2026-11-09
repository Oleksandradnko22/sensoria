-- Character limits for «Освіта та кваліфікація» and «Професійний досвід».
-- The SAME numbers as src/utils/authorCredentials.ts (CREDENTIAL_LIMITS,
-- EXPERIENCE_LIMITS …): the form validates them first, the database enforces
-- them for every new or edited row. NOT VALID = existing (legacy) rows stay
-- readable and unchanged; a legacy row has to be shortened the next time the
-- author saves it. Counted in characters, spaces included, ends trimmed.
--
-- ORDER: after author-credentials-migration.sql (and author-credentials-degree-migration.sql).
-- Re-run safe: drops and recreates the constraints.
-- Legacy rows that break a rule are NOT deleted: they stay stored, the public profile
-- hides them (src/utils/authorCredentials.ts: publishableCredentials / publishableExperience)
-- and the cabinet marks them «потребує уваги» until the author fixes or removes them.

alter table public.author_credentials drop constraint if exists author_credentials_limits;
alter table public.author_credentials add constraint author_credentials_limits check (
  -- title: education 10–80, courses and certificates 10–100 (length only, no wording rules)
  char_length(btrim(title)) between 10 and (case kind when 'education' then 80 else 100 end)
  and issuer is not null and char_length(btrim(issuer)) between 2 and 100
  -- the description is required: 30–160
  and description is not null and char_length(btrim(description)) between 30 and 160
  -- the document picture is required
  and image_url is not null and btrim(image_url) <> ''
  -- the year is required (the «not in the future» rule is checked by the app: a CHECK cannot use now())
  and issued_year is not null and issued_year between 1950 and 2100
) not valid;

alter table public.author_experience drop constraint if exists author_experience_limits;
alter table public.author_experience add constraint author_experience_limits check (
  role is not null and char_length(btrim(role)) between 5 and 80
  and char_length(btrim(organization)) between 2 and 100
  and start_year is not null and start_year between 1950 and 2100
  and (end_year is null or (end_year between 1950 and 2100 and end_year >= start_year))
  and (is_current or end_year is not null)
  -- the description column holds the text (60–280, checked by the app) plus 2–6 «- tag» lines (the app checks the count) (≤43 each)
  and description is not null and char_length(description) <= 280 + 6 * 44
  and description ~ E'(^|\\n)- '
) not valid;

-- To check which legacy rows break the new limits (and so need a shorter text):
--   select id, title from public.author_credentials
--    where not (char_length(btrim(title)) between (case kind when 'certificate' then 3 else 5 end) and (case kind when 'education' then 100 else 120 end));
