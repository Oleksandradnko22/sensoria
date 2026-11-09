-- Sample materials for the author Маша (88aafc4a-…), so the "Матеріали" tab
-- and the preview flow can be checked: one guide + one meditation from the
-- built-in catalog are linked to her. Safe to re-run.
create table if not exists public.guide_authors (
  guide_id text primary key,
  author_id uuid not null references public.profiles (id) on delete cascade
);
alter table public.guide_authors enable row level security;
drop policy if exists "guide_authors readable by signed-in users" on public.guide_authors;
create policy "guide_authors readable by signed-in users"
  on public.guide_authors for select using (auth.uid() is not null);

insert into public.guide_authors (guide_id, author_id)
values ('what-to-do-when-anxiety-hits', '88aafc4a-39fc-4b5c-8a42-487d486cd58f')
on conflict (guide_id) do update set author_id = excluded.author_id;

insert into public.meditation_authors (meditation_id, author_id)
values ('quick-grounding', '88aafc4a-39fc-4b5c-8a42-487d486cd58f')
on conflict (meditation_id) do update set author_id = excluded.author_id;

notify pgrst, 'reload schema';

-- ── A program that is NOT in anyone's cabinet (to see the pre-purchase preview)
do $p$
declare a_id constant uuid := '88aafc4a-39fc-4b5c-8a42-487d486cd58f';
        c_id uuid;
begin
  select id into c_id from public.content
  where author_id = a_id and kind = 'program' and title = 'Спокій у темпі життя' limit 1;
  if c_id is null then
    insert into public.content (author_id, kind, title, description, price, status, tags)
    values (
      a_id, 'program', 'Спокій у темпі життя',
      'Три короткі модулі, які допомагають помічати напругу раніше й повертати собі опору в щоденних справах — без перфекціонізму та самокритики.',
      1200, 'published', array['stress', 'awareness', 'emotionalBalance']
    )
    returning id into c_id;

    insert into public.content_modules (content_id, order_index, title, lessons, duration_label) values
      (c_id, 0, 'Помічати напругу', 3, '25 хв'),
      (c_id, 1, 'Повертати опору', 4, '35 хв'),
      (c_id, 2, 'Підтримувати себе щодня', 3, '30 хв');
  end if;
end
$p$;
