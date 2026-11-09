-- «Кейси» redesign: ONE optional jsonb column for the extra parts of a case.
-- Existing columns are reused as they are:
--   situation → «ЗАПИТ» (and «Запит» in the full case)
--   approach  → «ЩО МОЖЕ ДОПОМОГТИ»
-- `details` holds, all optional (see src/utils/authorCases.ts):
--   { "topic": "stress",            -- one key of src/data/categoryLabels.ts
--     "summary": "…",               -- 1–2 lines for the card
--     "focus": "…",                 -- «ФОКУС РОБОТИ»
--     "context": "…", "process": "…", "changes": "…", "useful": "…",
--     "tags": ["…"] }               -- up to 3 short tags
-- Old cases stay valid (the column is null) and render with what they have.
-- Safe to run twice. The app works without this column too (it just cannot
-- save/show the extra parts until it exists).
alter table public.author_cases add column if not exists details jsonb;
alter table public.author_cases drop constraint if exists author_cases_details_shape;
alter table public.author_cases add constraint author_cases_details_shape
  check (details is null or (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 6000)) not valid;

-- tags and review screenshots: at most 3 each
alter table public.author_cases drop constraint if exists author_cases_details_arrays;
alter table public.author_cases add constraint author_cases_details_arrays
  check (details is null or (
    (not (details ? 'tags')          or (jsonb_typeof(details->'tags') = 'array'          and jsonb_array_length(details->'tags') <= 3)) and
    (not (details ? 'reviewImages')  or (jsonb_typeof(details->'reviewImages') = 'array'  and jsonb_array_length(details->'reviewImages') <= 3))
  )) not valid;

-- last line of defence for anonymity (the app already filters contacts): no e-mail
-- addresses or links in the visible text columns
alter table public.author_cases drop constraint if exists author_cases_no_contacts;
alter table public.author_cases add constraint author_cases_no_contacts
  check (
    coalesce(title, '') || ' ' || coalesce(situation, '') || ' ' || coalesce(approach, '')
      !~* '(@|https?://|www\.)'
  ) not valid;
