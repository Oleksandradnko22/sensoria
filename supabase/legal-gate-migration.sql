-- Реліз B: реєстр юридичних документів, екран згоди, код з листа для автора, перевірки в базі.
-- docs/consent-legal-spec.md, розділи 1–2. Ідемпотентно; запускає власниця в SQL Editor.
-- Після запуску: задеплоїти edge-функції legal-otp, send-message і finance.

-- ─── 1. Реєстр документів ───────────────────────────────────────────────────
create table if not exists public.legal_documents (
  document text not null check (document in ('participant_agreement', 'author_agreement', 'terms', 'privacy', 'refunds')),
  version text not null,
  text_hash text not null,                 -- node scripts/legal-hash.mjs
  published_at timestamptz not null default now(),
  effective_from timestamptz not null default now(),
  changes_summary text,
  is_current boolean not null default false,
  primary key (document, version)
);
create unique index if not exists legal_documents_one_current on public.legal_documents (document) where is_current;
alter table public.legal_documents enable row level security;
drop policy if exists "anyone reads legal documents" on public.legal_documents;
create policy "anyone reads legal documents" on public.legal_documents for select using (true);

-- Поточні редакції (хеші станом на 17.11.2026). Нова редакція: вставити рядок, у старої зняти is_current.
insert into public.legal_documents (document, version, text_hash, effective_from, is_current) values
  ('participant_agreement', '1.0', 'c20de6d366d734b2d12143c5352a4780fceccf647674c6e4e4a71d1d4e61c430', now(), true),
  ('author_agreement',      '1.0', '43c1bcfb5104e098a328263c119f44fe7f4bb5aabf03e2c49f5f695f1b7c1804', '2026-11-17', true),
  ('terms',                 '1.0', 'e69c32bfbdc7c162f4cdc0e7a388a918ceb3cb6bd9c2cf75d075e223a7b3c154', now(), true),
  ('privacy',               '1.0', 'a8bbebbd4cbf7fad4cec5744c1a312bf3d4b916e4b3e5b7f3944be1ba8b39b13', now(), true),
  ('refunds',               '1.0', 'dfd23e3b23c8343d69e11d0a275617a62c1786ec524fec3e245a43377d2abef9', now(), true)
on conflict (document, version) do nothing;

-- ─── 2. Розширення legal_consents ───────────────────────────────────────────
alter table public.legal_consents
  add column if not exists text_hash text,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists context text not null default 'gate',
  add column if not exists ip inet,
  add column if not exists user_agent text,
  add column if not exists viewed_ms integer,
  add column if not exists opened_docs text[] not null default '{}',
  add column if not exists otp_verified_at timestamptz,
  add column if not exists otp_channel text,
  add column if not exists withdrawn_at timestamptz;

alter table public.legal_consents drop constraint if exists legal_consents_context_check;
alter table public.legal_consents add constraint legal_consents_context_check
  check (context in ('registration', 'gate', 'checkout', 'author_paid', 'profile'));

alter table public.legal_consents drop constraint if exists legal_consents_document_check;
alter table public.legal_consents add constraint legal_consents_document_check check (document in (
  'terms', 'privacy', 'author_agreement', 'age_18',
  'participant_agreement', 'refunds', 'not_medical', 'health_data', 'marketing_email', 'author_paid_sales'
));

-- Повторна згода після відкликання — новий запис: унікальність лише серед чинних.
alter table public.legal_consents drop constraint if exists legal_consents_user_id_document_version_key;
create unique index if not exists legal_consents_active_uniq
  on public.legal_consents (user_id, document, version) where withdrawn_at is null;

-- Клієнт більше не пише згоди напряму — лише через accept_legal.
drop policy if exists "users record their own consents" on public.legal_consents;

-- ─── 3. Код з листа (одноразовий ідентифікатор, ст. 12 ЗУ «Про електронну комерцію») ───
create table if not exists public.legal_otp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('author_agreement', 'author_paid_sales')),
  code_hash text not null,                 -- sha256(user_id || ':' || code); сам код не зберігається
  sent_to text not null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts int not null default 0,
  verified_at timestamptz,
  consumed_at timestamptz
);
create index if not exists legal_otp_user_idx on public.legal_otp (user_id, purpose, sent_at desc);
alter table public.legal_otp enable row level security;  -- лише service role (edge-функція legal-otp)

-- ─── 4. Перевірки ───────────────────────────────────────────────────────────
-- Редакції, за якими згода чинна: поточна, а поки вона не набрала чинності — і остання чинна.
create or replace function public.acceptable_versions(p_document text) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    (select version from legal_documents where document = p_document and is_current),
    (select version from legal_documents where document = p_document and effective_from <= now()
      order by effective_from desc limit 1)
  ], null);
$$;

create or replace function public.has_current_consent(p_uid uuid, p_document text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return false; end if;
  if p_document in ('participant_agreement', 'author_agreement', 'terms', 'privacy', 'refunds') then
    return exists (
      select 1 from legal_consents c
      where c.user_id = p_uid and c.document = p_document and c.withdrawn_at is null
        and c.version = any (acceptable_versions(p_document))
        and (p_document <> 'author_agreement' or c.otp_verified_at is not null)
    );
  end if;
  -- age_18, not_medical, health_data, marketing_email, author_paid_sales
  return exists (
    select 1 from legal_consents c
    where c.user_id = p_uid and c.document = p_document and c.withdrawn_at is null
      and (p_document <> 'author_paid_sales' or c.otp_verified_at is not null)
  );
end $$;

create or replace function public.required_documents(p_uid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select case (select role from profiles where id = p_uid)
    when 'author' then array['author_agreement', 'terms', 'privacy']
    else array['participant_agreement', 'terms', 'refunds', 'privacy', 'age_18', 'not_medical']
  end;
$$;

create or replace function public.has_required_consents(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_uid is not null and not exists (
    select 1 from unnest(public.required_documents(p_uid)) d where not public.has_current_consent(p_uid, d)
  );
$$;

-- Що користувачу треба прийняти зараз (для екрана згоди).
create or replace function public.missing_consents()
returns table (document text, version text, changes_summary text, is_update boolean)
language sql stable security definer set search_path = public as $$
  select d,
         ld.version,
         ld.changes_summary,
         exists (select 1 from legal_consents c where c.user_id = auth.uid() and c.document = d)
  from unnest(public.required_documents(auth.uid())) d
  left join legal_documents ld on ld.document = d and ld.is_current
  where auth.uid() is not null and not public.has_current_consent(auth.uid(), d);
$$;
grant execute on function public.missing_consents() to authenticated;
grant execute on function public.has_current_consent(uuid, text) to authenticated;

-- ─── 5. accept_legal ────────────────────────────────────────────────────────
-- p_kind: 'participant' | 'author' | 'health_data' | 'marketing_email'
-- p_items: [{ "key": "p1", "text": "…точний текст галочки…" }]
create or replace function public.accept_legal(p_kind text, p_items jsonb, p_viewed_ms int default null, p_opened_docs text[] default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hdr json := nullif(current_setting('request.headers', true), '')::json;
  v_ip inet;
  v_ua text;
  keys text[];
  ctx text := 'gate';
  otp_id uuid;
  otp_at timestamptz;
  doc text;
  ver text;
  hsh text;
  docs text[];
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'bad_items'; end if;
  select array_agg(e ->> 'key') into keys from jsonb_array_elements(p_items) e;
  keys := coalesce(keys, '{}');

  begin
    v_ip := nullif(trim(split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), '')::inet;
  exception when others then v_ip := null;
  end;
  v_ua := left(hdr ->> 'user-agent', 500);

  if p_kind = 'participant' then
    if not (keys @> array['p1', 'p2', 'p3']) then raise exception 'missing_required'; end if;
    docs := array['participant_agreement', 'terms', 'refunds', 'privacy', 'age_18', 'not_medical'];
    if 'p4' = any (keys) then docs := docs || 'health_data'::text; end if;
    if 'p5' = any (keys) then docs := docs || 'marketing_email'::text; end if;
  elsif p_kind = 'author' then
    if not (keys @> array['a1', 'a2', 'a3', 'a4', 'a5']) then raise exception 'missing_required'; end if;
    if (select role from profiles where id = uid) <> 'author' then raise exception 'not_author'; end if;
    select id, verified_at into otp_id, otp_at from legal_otp
      where user_id = uid and purpose = 'author_agreement' and verified_at is not null and consumed_at is null
        and verified_at > now() - interval '30 minutes'
      order by verified_at desc limit 1;
    if otp_id is null then raise exception 'otp_required'; end if;
    update legal_otp set consumed_at = now() where id = otp_id;
    docs := array['author_agreement', 'terms', 'privacy'];
  elsif p_kind in ('health_data', 'marketing_email') then
    ctx := 'profile';
    docs := array[p_kind];
  else
    raise exception 'bad_kind';
  end if;

  foreach doc in array docs loop
    if doc in ('participant_agreement', 'author_agreement', 'terms', 'privacy', 'refunds') then
      select version, text_hash into ver, hsh from legal_documents where document = doc and is_current;
      if ver is null then raise exception 'stale_version'; end if;
    else
      -- похідні згоди йдуть за редакцією основного договору ролі
      select version, text_hash into ver, hsh from legal_documents
        where document = case when p_kind = 'author' then 'author_agreement' else 'participant_agreement' end and is_current;
      if ver is null then ver := '1.0'; end if;
    end if;
    insert into legal_consents (user_id, document, version, text_hash, items, context, ip, user_agent, viewed_ms, opened_docs, otp_verified_at, otp_channel)
    values (uid, doc, ver, hsh, p_items, ctx, v_ip, v_ua, p_viewed_ms, coalesce(p_opened_docs, '{}'),
            case when doc = 'author_agreement' then otp_at end, case when doc = 'author_agreement' then 'email' end)
    on conflict (user_id, document, version) where withdrawn_at is null do nothing;
  end loop;
end $$;
grant execute on function public.accept_legal(text, jsonb, int, text[]) to authenticated;

-- Відкликання необов'язкових згод (дані про емоційний стан, листи).
create or replace function public.withdraw_consent(p_document text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_document not in ('health_data', 'marketing_email') then raise exception 'not_withdrawable'; end if;
  update legal_consents set withdrawn_at = now()
    where user_id = auth.uid() and document = p_document and withdrawn_at is null;
end $$;
grant execute on function public.withdraw_consent(text) to authenticated;

-- ─── 6. Без згоди база відмовляє (restrictive: додається до наявних політик) ───
do $$
declare t text;
begin
  foreach t in array array['acquired_content', 'content_comments', 'author_posts', 'author_post_comments', 'reviews', 'author_reviews'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "consent required" on public.%I', t);
      execute format('create policy "consent required" on public.%I as restrictive for insert to authenticated with check (public.has_required_consents(auth.uid()))', t);
    end if;
  end loop;
end $$;

-- Публікація матеріалу автором — лише з прийнятою офертою (service role / адмінка не перевіряються).
create or replace function public.content_publish_consent_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not public.has_required_consents(auth.uid()) then
    raise exception 'consent_required: прийміть Договір з автором, щоб публікувати матеріали' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists content_publish_consent_guard on public.content;
create trigger content_publish_consent_guard before insert or update of status on public.content
  for each row execute function public.content_publish_consent_guard();
