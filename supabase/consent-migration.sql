-- Consent to the Terms of Use and Privacy Policy: who, when, which edition.
-- Run in the Supabase SQL Editor (safe to re-run).

create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy', 'author_agreement')),
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);

alter table public.legal_consents enable row level security;

drop policy if exists "users read their own consents" on public.legal_consents;
create policy "users read their own consents"
  on public.legal_consents for select
  using (auth.uid() = user_id);

drop policy if exists "users record their own consents" on public.legal_consents;
create policy "users record their own consents"
  on public.legal_consents for insert
  with check (auth.uid() = user_id);

-- No update/delete policies: a recorded consent cannot be edited by the client.

-- Email sign-up: the form sends consent_version in the sign-up metadata and
-- the trigger records it (works even before the email is confirmed).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, name, email, avatar_initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'participant'),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    upper(left(coalesce(new.raw_user_meta_data ->> 'name', new.email), 2))
  );

  if (new.raw_user_meta_data ->> 'role') = 'author' then
    insert into public.author_details (profile_id) values (new.id);
  end if;

  if nullif(new.raw_user_meta_data ->> 'consent_version', '') is not null then
    insert into public.legal_consents (user_id, document, version)
    select new.id, d, new.raw_user_meta_data ->> 'consent_version'
    from unnest(array['terms', 'privacy']) as d
    on conflict do nothing;
  end if;

  return new;
end;
$$;
