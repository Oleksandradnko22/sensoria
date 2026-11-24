-- Заявки авторів зі сторінки /for-authors (24.11.2026). Будь-хто може лише ДОДАТИ заявку; читати й змінювати — тільки
-- сервер (admin-data, service role). Одна заявка на пошту. Ідемпотентно.
create table if not exists public.author_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 120),
  email text not null check (char_length(email) between 5 and 160),
  phone text check (phone is null or char_length(phone) <= 30),
  profession text not null check (char_length(profession) between 3 and 300),
  topics text[] not null default '{}' check (cardinality(topics) <= 10),
  plan text not null check (char_length(plan) between 10 and 2000),
  links text check (links is null or char_length(links) <= 500),
  status text not null default 'new' check (status in ('new', 'invited', 'declined')),
  invited_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists author_applications_email_key on public.author_applications (lower(email));

alter table public.author_applications enable row level security;
drop policy if exists "anyone can apply" on public.author_applications;
create policy "anyone can apply" on public.author_applications for insert to anon, authenticated
  with check (status = 'new' and invited_at is null);
grant insert on public.author_applications to anon, authenticated;

notify pgrst, 'reload schema';

-- ── Допуск авторів після схвалення (24.11.2026) ─────────────────────────────────────────────────────────────────
-- Автор реєструється за посиланням і підписує документи (як і раніше, кодом з пошти); кабінет відкривається, коли
-- власниця схвалить акаунт (profiles.author_approved_at). Пошта з запрошенням з анкети схвалюється одразу.
-- Уже наявні автори схвалюються цим скриптом. Створювати матеріали до схвалення сервер не дає.
drop trigger if exists author_invite_guard on public.profiles;
drop function if exists public.author_invite_guard();
drop function if exists public.author_invited(text);
drop table if exists public.site_flags;

alter table public.profiles add column if not exists author_approved_at timestamptz;
update public.profiles set author_approved_at = now() where role = 'author' and author_approved_at is null;

create or replace function public.author_approval_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- a person never approves themself: only the server or an admin may change the mark
  if tg_op = 'UPDATE' and new.author_approved_at is distinct from old.author_approved_at and auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    new.author_approved_at := old.author_approved_at;
  end if;
  -- invited from an application: approved at once
  if new.role = 'author' and new.author_approved_at is null
     and exists (select 1 from author_applications where lower(email) = lower(new.email) and status = 'invited') then
    new.author_approved_at := now();
  end if;
  return new;
end $$;
drop trigger if exists author_approval_guard on public.profiles;
create trigger author_approval_guard before insert or update on public.profiles
  for each row execute function public.author_approval_guard();

create or replace function public.content_author_approved_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not exists (
    select 1 from profiles where id = new.author_id and (author_approved_at is not null or is_admin)
  ) then
    raise exception 'author_not_approved: акаунт автора ще на розгляді' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists content_author_approved_guard on public.content;
create trigger content_author_approved_guard before insert on public.content
  for each row execute function public.content_author_approved_guard();

notify pgrst, 'reload schema';
