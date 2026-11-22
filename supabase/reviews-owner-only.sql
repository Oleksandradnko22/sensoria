-- Відгук лишає лише той, хто має матеріал (юрист, 22.11.2026, 4.7; оферта — заборона фейкових відгуків).
-- Відгук про матеріал: оплачена покупка або безоплатний матеріал у кабінеті. Відгук про автора: хоча б один матеріал
-- цього автора в кабінеті. Обмежувальні політики лише на вставку; наявні відгуки не зачіпаються. Ідемпотентно.
drop policy if exists "review only by an owner" on public.reviews;
create policy "review only by an owner" on public.reviews as restrictive for insert to authenticated
with check (
  exists (select 1 from public.purchases p where p.participant_id::text = auth.uid()::text and p.content_id::text = reviews.content_id::text and p.status = 'completed')
  or exists (
    select 1 from public.acquired_content a join public.content c on a.content_id::text in (c.id::text, c.slug::text)
     where a.user_id::text = auth.uid()::text and c.id::text = reviews.content_id::text
  )
);

drop policy if exists "author review only by a participant" on public.author_reviews;
create policy "author review only by a participant" on public.author_reviews as restrictive for insert to authenticated
with check (
  exists (
    select 1 from public.purchases p join public.content c on c.id::text = p.content_id::text
     where p.participant_id::text = auth.uid()::text and p.status = 'completed' and c.author_id::text = author_reviews.author_id::text
  )
  or exists (
    select 1 from public.acquired_content a join public.content c on a.content_id::text in (c.id::text, c.slug::text)
     where a.user_id::text = auth.uid()::text and c.author_id::text = author_reviews.author_id::text
  )
);
