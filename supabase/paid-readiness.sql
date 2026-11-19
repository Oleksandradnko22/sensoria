-- Платні матеріали — лише після підключення (19.11.2026): приймання оплат (ФОП у спліті monobank), каса для чеків
-- автора (ПРРО) і згода на умови платних продажів (A6, з кодом з листа). Без цього автор не може поставити ціну > 0.
-- У тестовому режимі (finance_settings.mode = 'test') ФОП і каса не потрібні: тестові оплати йдуть на тестового
-- отримувача й тестову касу Sensoria; згода потрібна завжди. Ідемпотентно; після legal-gate-migration.sql,
-- mono-migration.sql і fiscal-migration.sql.

create or replace function public.author_paid_ready(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'live', coalesce((select mode = 'live' from finance_settings where id = 1), false),
    'mono', exists (select 1 from author_mono_receivers where author_id = p_uid and status = 'active'),
    'prro', exists (select 1 from author_fiscal where author_id = p_uid and status = 'active'),
    'consent', public.has_current_consent(p_uid, 'author_paid_sales')
  )
$$;
revoke all on function public.author_paid_ready(uuid) from public, anon, authenticated;

-- для кабінету й редактора: лише свій стан
create or replace function public.my_paid_readiness() returns jsonb
language sql stable security definer set search_path = public as $$
  select public.author_paid_ready(auth.uid())
$$;
revoke all on function public.my_paid_readiness() from public, anon;
grant execute on function public.my_paid_readiness() to authenticated;

-- Ціна з 0 на платну (або новий платний матеріал) — лише коли автор готовий. Зміна вже платної ціни, адмінка
-- й service role (auth.uid() is null) не перевіряються: наявні платні матеріали не ламаються.
create or replace function public.content_paid_price_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or coalesce(new.price, 0) <= 0 then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.price, 0) > 0 then return new; end if;
  r := public.author_paid_ready(new.author_id);
  if not coalesce((r->>'consent')::boolean, false)
     or (coalesce((r->>'live')::boolean, false) and not (coalesce((r->>'mono')::boolean, false) and coalesce((r->>'prro')::boolean, false))) then
    raise exception 'paid_not_ready: щоб зробити матеріал платним, підключіть у «Фінансах» приймання оплат, касу для чеків і прийміть умови платних продажів'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists content_paid_price_guard on public.content;
create trigger content_paid_price_guard before insert or update of price on public.content
  for each row execute function public.content_paid_price_guard();
