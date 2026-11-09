-- The cart of a signed-in person, so it follows them between devices.
-- One row per (person, kind, material). A guest's cart stays on the device until sign-in.
-- Run ONCE in the Supabase SQL editor.

create table if not exists public.cart_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('program', 'guide', 'meditation')),
  content_id text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, kind, content_id)
);

alter table public.cart_items enable row level security;

drop policy if exists "people read their own cart" on public.cart_items;
create policy "people read their own cart" on public.cart_items
  for select using (auth.uid() = user_id);

drop policy if exists "people add to their own cart" on public.cart_items;
create policy "people add to their own cart" on public.cart_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "people remove from their own cart" on public.cart_items;
create policy "people remove from their own cart" on public.cart_items
  for delete using (auth.uid() = user_id);

-- at most 20 materials in a cart (same limit as the app)
create or replace function public.cart_items_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.cart_items where user_id = new.user_id) >= 20 then
    raise exception 'Cart is full';
  end if;
  return new;
end $$;
drop trigger if exists cart_items_limit on public.cart_items;
create trigger cart_items_limit before insert on public.cart_items
  for each row execute function public.cart_items_limit();

notify pgrst, 'reload schema';
