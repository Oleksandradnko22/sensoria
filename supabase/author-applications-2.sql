-- Анкета автора на /author-signup (24.11.2026): додаткові поля заявки. Запустити ПІСЛЯ author-applications.sql.
-- Ідемпотентно.
alter table public.author_applications add column if not exists education text check (education is null or char_length(education) <= 1000);
alter table public.author_applications add column if not exists experience text check (experience is null or char_length(experience) <= 40);
alter table public.author_applications add column if not exists formats text[] not null default '{}' check (cardinality(formats) <= 5);
alter table public.author_applications add column if not exists ready text check (ready is null or ready in ('yes', 'partly', 'no'));
alter table public.author_applications add column if not exists with_account boolean not null default false;
notify pgrst, 'reload schema';
