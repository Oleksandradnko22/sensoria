-- Нотатки власниці в адмінці (25.11.2026): особисті записи — що зробити, кому відповісти, ідеї.
-- Бачать і змінюють лише адміністратори, і лише після входу з кодом з телефона (aal2). Ідемпотентно.
create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 4000),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.admin_notes enable row level security;
drop policy if exists admin_notes_admin on public.admin_notes;
create policy admin_notes_admin on public.admin_notes for all to authenticated
  using ((select is_admin from public.profiles where id = auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
  with check ((select is_admin from public.profiles where id = auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2');
revoke all on public.admin_notes from anon;
