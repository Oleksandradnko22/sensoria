-- Free materials a person adds from the cart to their cabinet («Моє навчання»).
-- One row per (person, kind, material). Paid materials are NOT added here: their access will come
-- with payments. A real program can only be added here when it is published and costs 0.
-- Run ONCE in the Supabase SQL editor.

create table if not exists public.acquired_content (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('program', 'guide', 'meditation')),
  content_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, kind, content_id)
);

alter table public.acquired_content enable row level security;

drop policy if exists "people read their own acquired content" on public.acquired_content;
create policy "people read their own acquired content" on public.acquired_content
  for select using (auth.uid() = user_id);

drop policy if exists "people add free content to their own cabinet" on public.acquired_content;
create policy "people add free content to their own cabinet" on public.acquired_content
  for insert with check (
    auth.uid() = user_id
    and (
      kind <> 'program'
      or exists (
        select 1 from public.content c
        where c.id::text = acquired_content.content_id and c.status = 'published' and c.price = 0
      )
    )
  );

drop policy if exists "people remove their own acquired content" on public.acquired_content;
create policy "people remove their own acquired content" on public.acquired_content
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
