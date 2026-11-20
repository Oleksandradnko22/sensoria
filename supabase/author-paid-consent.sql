-- Галочка A6 перед платними продажами, підписана кодом з листа (author-consent.md, розділ А; ТЗ 2.5).
-- Оновлює лише функцію accept_legal (додає вид згоди 'author_paid'). Ідемпотентно; запускати після legal-gate-migration.sql.

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
  elsif p_kind = 'author_paid' then
    -- A6: before paid sales, signed with its own code from the email (author-consent.md, А; spec 2.5)
    if not ('a6' = any (keys)) then raise exception 'missing_required'; end if;
    if (select role from profiles where id = uid) <> 'author' then raise exception 'not_author'; end if;
    select id, verified_at into otp_id, otp_at from legal_otp
      where user_id = uid and purpose = 'author_paid_sales' and verified_at is not null and consumed_at is null
        and verified_at > now() - interval '30 minutes'
      order by verified_at desc limit 1;
    if otp_id is null then raise exception 'otp_required'; end if;
    update legal_otp set consumed_at = now() where id = otp_id;
    ctx := 'author_paid';
    docs := array['author_paid_sales'];
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
        where document = case when p_kind in ('author', 'author_paid') then 'author_agreement' else 'participant_agreement' end and is_current;
      if ver is null then ver := '1.0'; end if;
    end if;
    insert into legal_consents (user_id, document, version, text_hash, items, context, ip, user_agent, viewed_ms, opened_docs, otp_verified_at, otp_channel)
    values (uid, doc, ver, hsh, p_items, ctx, v_ip, v_ua, p_viewed_ms, coalesce(p_opened_docs, '{}'),
            case when doc in ('author_agreement', 'author_paid_sales') then otp_at end, case when doc in ('author_agreement', 'author_paid_sales') then 'email' end)
    -- an earlier acceptance of the same edition without a code (e.g. made before the code was required) must not swallow
    -- the signature: the code confirmation is added to it, otherwise the consent screen would come back forever
    on conflict (user_id, document, version) where withdrawn_at is null do update set
      otp_verified_at = coalesce(legal_consents.otp_verified_at, excluded.otp_verified_at),
      otp_channel = coalesce(legal_consents.otp_channel, excluded.otp_channel),
      text_hash = coalesce(legal_consents.text_hash, excluded.text_hash);
  end loop;
end $$;
grant execute on function public.accept_legal(text, jsonb, int, text[]) to authenticated;
