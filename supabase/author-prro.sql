-- Каса автора (ПРРО) для фіскальних чеків (ТЗ 3.4; accountant-dps-review-2026-11-18.md, В1). Ідемпотентно.
-- Запускати після fiscal-migration.sql. Ключ ліцензії каси й PIN касира зберігаються лише у Vault;
-- у таблиці author_fiscal — тільки назва секрету. Приватні ключі (КЕП) автора не приймаються.

-- автор бачить стан своєї каси (без секрету)
drop policy if exists "author reads own fiscal" on public.author_fiscal;
create policy "author reads own fiscal" on public.author_fiscal for select to authenticated using (author_id = auth.uid());

-- зберегти або оновити дані доступу до каси автора (викликає лише edge-функція finance)
create or replace function public.author_fiscal_store(p_author uuid, p_license text, p_pin text, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_name text := 'author_prro_' || replace(p_author::text, '-', '');
  v_secret text := json_build_object('licenseKey', p_license, 'pin', p_pin)::text;
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(v_secret, v_name, 'ПРРО автора для фіскальних чеків Sensoria');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
  insert into author_fiscal (author_id, provider, secret_ref, status, last_error, updated_at)
  values (p_author, 'checkbox', v_name, p_status, p_error, now())
  on conflict (author_id) do update set provider = 'checkbox', secret_ref = excluded.secret_ref, status = excluded.status,
    last_error = excluded.last_error, updated_at = now();
end $$;

-- прочитати дані доступу (лише edge-функція finance, для відправки чека)
create or replace function public.author_fiscal_secret(p_author uuid) returns text
language sql stable security definer set search_path = public, vault as $$
  select ds.decrypted_secret from vault.decrypted_secrets ds
  join author_fiscal af on af.secret_ref = ds.name
  where af.author_id = p_author;
$$;

revoke execute on function public.author_fiscal_store(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.author_fiscal_secret(uuid) from public, anon, authenticated;
grant execute on function public.author_fiscal_store(uuid, text, text, text, text) to service_role;
grant execute on function public.author_fiscal_secret(uuid) to service_role;

-- покупець бачить свої фіскальні чеки (посилання в «Оплатах» і квитанції), автор — чеки Sensoria на тариф для себе
drop policy if exists "buyer reads own fiscal receipts" on public.fiscal_receipts;
create policy "buyer reads own fiscal receipts" on public.fiscal_receipts for select to authenticated
  using (deliver_to = 'buyer' and exists (select 1 from public.mono_invoices mi where mi.id = invoice_id and mi.buyer_id = auth.uid()));
drop policy if exists "author reads own fiscal receipts" on public.fiscal_receipts;
create policy "author reads own fiscal receipts" on public.fiscal_receipts for select to authenticated
  using (author_id = auth.uid());
