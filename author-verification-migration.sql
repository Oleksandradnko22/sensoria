-- Верифікація автора: автор надсилає документ (лише щоб команда бачила, що
-- людина існує — решту даних на фото можна закрити), команда розглядає в
-- адмінці. Після рішення файли видаляються.
-- Нове + одне виправлення безпеки (див. тригер нижче). Запускати цілим файлом.

-- 1) БЕЗПЕКА: політика "authors update their own details" дозволяє автору
--    змінювати свій рядок, а отже міг би сам поставити verified = true.
--    Тепер це поле може міняти лише service role (адмін-панель).
create or replace function public.protect_author_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.verified := false;
    else
      new.verified := old.verified;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_author_verified_trg on public.author_details;
create trigger protect_author_verified_trg
  before insert or update on public.author_details
  for each row execute function public.protect_author_verified();

-- 2) Заявки на верифікацію
create table if not exists public.author_verification_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- шляхи файлів у приватному bucket verification-docs ({author_id}/…)
  document_paths text[] not null default '{}',
  note text check (note is null or char_length(note) <= 500),
  reject_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Не більше однієї заявки на розгляді від одного автора.
create unique index if not exists author_verification_one_pending
  on public.author_verification_requests (author_id) where status = 'pending';

alter table public.author_verification_requests enable row level security;

-- Подати можна лише за себе, зі статусом pending і лише якщо профіль
-- заповнено базово (назва/спеціалізація і опис).
drop policy if exists "authors submit their own verification request" on public.author_verification_requests;
create policy "authors submit their own verification request"
  on public.author_verification_requests for insert
  with check (
    auth.uid() = author_id
    and status = 'pending'
    and reviewed_at is null
    and cardinality(document_paths) between 1 and 3
    and exists (
      select 1 from public.author_details d
      where d.profile_id = auth.uid()
        and coalesce(btrim(d.title), '') <> ''
        and coalesce(btrim(d.bio), '') <> ''
    )
  );

drop policy if exists "authors view their own verification requests" on public.author_verification_requests;
create policy "authors view their own verification requests"
  on public.author_verification_requests for select
  using (auth.uid() = author_id);
-- Оновлювати/видаляти клієнт не може — рішення приймає лише адмін-функція.

-- 3) Приватне сховище документів: читати не може ніхто з клієнтів
--    (адмін-функція видає тимчасові посилання), завантажити — лише у свою папку.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false;

drop policy if exists "authors upload their own verification docs" on storage.objects;
create policy "authors upload their own verification docs"
  on storage.objects for insert
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
