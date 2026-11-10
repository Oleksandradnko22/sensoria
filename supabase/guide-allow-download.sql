-- Автор гайду може заборонити читачам завантажувати гайд (PDF-файл або PDF-версію інтерактивного гайду).
-- true = дозволено (так було до цієї зміни), false = лише читання на сайті.
alter table public.content_guide_meta
  add column if not exists allow_download boolean not null default true;
