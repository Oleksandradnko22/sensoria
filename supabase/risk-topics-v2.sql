-- Теми ризику, версія 2 (перевірка безпеки 21.11.2026, С1–С2). Ідемпотентно; після no-premoderation-migration.sql і feeds.sql.
-- Один список слів для бази — той самий, що src/utils/riskTopics.ts RISK_WORDS (міняти разом):
-- лише ТЕМИ (без «діагноз», «лікування», «психотерапія», «ліки» — це заборонені всім твердження, не тема),
-- слово з початку («публіки», «незалежність» не спрацьовують), українські й російські написання.
create or replace function public.risk_text_hit(t text)
returns boolean
language sql
immutable
as $$
  select coalesce(t, '') ~* '(?<![а-яіїєґё''’])(птср|посттравм|травм|суїцид|суицид|самогуб|самоубийств|самоушкодж|самоповрежд|розлад[а-яіїєґё]* харчов|расстройств[а-яіїєґё]* пищев|булімі|булими|анорекс|залежн|зависим|наркот|алкогол|азартн|лудоман|насильств|насили|згвалтув|изнасил|гор(е|я|ю|ем)(?![а-яіїєґё])|втрат[аиуі] (близьк|рідн|дитин)|утрат[аы] (близк|родн|ребен)|смерт|помер|війн|войн|бойов|боев|депрес|біполяр|биполяр|шизофрен|панічн[а-яіїєґё]* розлад|паническ[а-яіїєґё]* расстройств|окр(?![а-яіїєґё]))';
$$;

-- матеріали: публікувати тему ризику може лише «Фахівець»
create or replace function public.content_publish_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_specialist boolean;
  v_risky boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status not in ('review', 'published') then
    return new;
  end if;

  select coalesce(education_verified, false)
    into v_specialist
    from public.author_details where profile_id = new.author_id;
  v_specialist := coalesce(v_specialist, false);

  -- high-risk topic → only a verified specialist (a publishing restriction,
  -- not a review of the material)
  v_risky := coalesce(cardinality(new.risk_topics), 0) > 0
    or public.risk_text_hit(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if v_risky and not v_specialist
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.risk_topics is distinct from old.risk_topics) then
    raise exception 'Теми підвищеного ризику (травма й наслідки війни, кризові стани, насильство, втрата й горе, розлади харчової поведінки, залежності, психічні розлади, робота з дітьми й підлітками) доступні лише авторам зі статусом «Фахівець».'
      using errcode = 'P0001';
  end if;

  if new.status = 'review' then
    new.status := 'published';
  end if;
  return new;
end;
$$;

-- публікації й опитування в «Публікаціях»
create or replace function public.feed_text_specialist(t text)
returns boolean
language sql
immutable
as $$
  select public.risk_text_hit(t);
$$;

-- перевірка: має бути f, f, t, t
select public.risk_text_hit('Курс не замінює психотерапію'), public.risk_text_hit('Фінансова незалежність'),
       public.risk_text_hit('Травма покинутості'), public.risk_text_hit('Домашнє насильство');
