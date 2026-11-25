-- Строк зберігання анкет авторів (Політика 1.4, юрист 25.11.2026): відхилена анкета видаляється через 6 місяців після
-- рішення — разом з акаунтом, створеним для анкети, якщо автора не схвалено і в акаунті немає покупок. Щодня о 03:40.
-- Схвалена анкета стає частиною даних автора (не видаляється). Ідемпотентно.
alter table public.author_applications add column if not exists decided_at timestamptz;

-- дата рішення ставиться сама, коли анкету відхиляють (адмінка не змінюється)
create or replace function public.author_application_decided_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'declined' and (tg_op = 'INSERT' or old.status is distinct from 'declined') then
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  return new;
end $$;
drop trigger if exists author_application_decided_at on public.author_applications;
create trigger author_application_decided_at before insert or update of status on public.author_applications
  for each row execute function public.author_application_decided_at();
-- уже відхилені до цього дня: рахуємо від сьогодні
update public.author_applications set decided_at = now() where status = 'declined' and decided_at is null;

create or replace function public.purge_declined_author_applications() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; a record;
begin
  for a in select id, email, with_account from public.author_applications
           where status = 'declined' and decided_at < now() - interval '6 months' loop
    if a.with_account then
      delete from auth.users u using public.profiles p
       where p.id = u.id and lower(p.email) = lower(a.email) and p.role = 'author' and p.author_approved_at is null
         and not exists (select 1 from public.purchases x where x.participant_id = p.id);
    end if;
    delete from public.author_applications where id = a.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.purge_declined_author_applications() from public, anon, authenticated;

select cron.unschedule('purge-declined-author-applications') where exists (select 1 from cron.job where jobname = 'purge-declined-author-applications');
select cron.schedule('purge-declined-author-applications', '40 3 * * *', $$ select public.purge_declined_author_applications() $$);
