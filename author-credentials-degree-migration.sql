-- Рівень освіти (Бакалавр / Магістр …) для записів «Освіта» — показується в блоці
-- «Професійний бекграунд» на «Про мене». Виконати один раз у Supabase → SQL Editor.
alter table public.author_credentials
  add column if not exists degree text;

alter table public.author_credentials drop constraint if exists author_credentials_degree_check;
alter table public.author_credentials
  add constraint author_credentials_degree_check
  check (degree is null or degree in ('bachelor', 'specialist', 'master', 'phd'));
