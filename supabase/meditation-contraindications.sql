-- Протипоказання до медитації від автора (перевірка безпеки 21.11.2026, С13). Ідемпотентно.
alter table public.content_meditation_meta add column if not exists contraindications text
  check (contraindications is null or char_length(contraindications) <= 500);
notify pgrst, 'reload schema';
