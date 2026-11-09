-- Adds a `kind` column to content_item_saved_practices so "Моя
-- практика" can hold meditations (♡ Зберегти on the completed screen),
-- not just audio/video tools kept from a finished course. Existing
-- rows default to 'program' — no data loss, no behavior change for
-- anything already saved.
alter table public.content_item_saved_practices
  add column if not exists kind text not null default 'program';

alter table public.content_item_saved_practices
  drop constraint if exists content_item_saved_practices_kind_check;

alter table public.content_item_saved_practices
  add constraint content_item_saved_practices_kind_check
  check (kind in ('program', 'meditation'));
