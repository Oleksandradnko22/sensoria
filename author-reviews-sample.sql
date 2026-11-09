-- SAMPLE reviews so the header shows a rating (5 + 4 = 4.5 ★, 2 відгуки).
-- Reviews need real participant accounts (one review per participant per
-- author), so this uses the first two existing non-author profiles.
-- These are demo texts, not real feedback — remove them before launch:
--   delete from public.author_reviews where text like '[demo]%';
do $r$
declare a_id uuid;
begin
  select id into a_id from public.profiles where role = 'author' order by created_at limit 1;
  if a_id is null then return; end if;

  insert into public.author_reviews (participant_id, author_id, rating, text)
  select p.id, a_id, v.rating, v.text
  from (select id, row_number() over (order by created_at) as n
        from public.profiles where role <> 'author' and id <> a_id limit 2) p
  join (values
    (1, 5, '[demo] Дуже спокійний і зрозумілий стиль. Практики справді працюють, коли думки йдуть по колу.'),
    (2, 4, '[demo] Подобається, що без тиску. Хотілося б більше коротких вправ.')
  ) as v(n, rating, text) on v.n = p.n
  on conflict (participant_id, author_id) do nothing;
end
$r$;
