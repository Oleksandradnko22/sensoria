-- Complaints → manual delisting by the admin. Run in the Supabase SQL Editor (safe to re-run).
-- Run AFTER author-exit-migration.sql (it replaces the content SELECT policy).
--
-- Product rules (Умови використання, Договір з автором, Політика повернення):
--  * a complaint only goes to the admin queue; the admin takes the material
--    off sale for NEW buyers by hand (sale_status 'complaint_pending' =
--    paused, 'unlisted' = permanently); records and files are never deleted;
--  * people who already bought keep access (has_active_purchase);
--  * only Sensoria's admin (service role) can move sale_status afterwards:
--    'unlisted' (permanently off sale) or 'restored' (back on sale);
--  * every step is written to content_events.

-- 1) Sale status, separate from the author's own status (draft/review/…).
alter table public.content
  add column if not exists sale_status text not null default 'published'
  check (sale_status in ('published', 'complaint_pending', 'unlisted', 'restored'));

-- 2) Audit trail (no policies: readable only with the service role).
create table if not exists public.content_events (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  event text not null,
  actor_id uuid,
  actor_kind text not null default 'system' check (actor_kind in ('user', 'admin', 'system')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists content_events_content_idx on public.content_events (content_id, created_at);
alter table public.content_events enable row level security;
revoke all on public.content_events from anon, authenticated;

-- 3) Only the system may change sale_status (an author's UPDATE must not
--    put a delisted item back on sale, nor insert as 'restored').
create or replace function public.guard_sale_status()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('sensoria.sale_system', true), '') = '1' then
    return new;
  end if;
  if auth.uid() is null then          -- service role (admin Edge Function)
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sale_status := 'published';
  else
    new.sale_status := old.sale_status;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_sale_status_trg on public.content;
create trigger guard_sale_status_trg
  before insert or update on public.content
  for each row execute function public.guard_sale_status();

-- 4) Public catalog: published AND on sale. Authors see their own; buyers keep
--    what they paid for whatever the sale status.
drop policy if exists "published content is publicly readable" on public.content;
create policy "published content is publicly readable"
  on public.content for select
  using (
    (status = 'published' and sale_status in ('published', 'restored'))
    or auth.uid() = author_id
    or public.has_active_purchase(id)
  );

drop policy if exists "modules follow their content's visibility" on public.content_modules;
create policy "modules follow their content's visibility"
  on public.content_modules for select
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          (c.status = 'published' and c.sale_status in ('published', 'restored'))
          or c.author_id = auth.uid()
          or public.has_active_purchase(c.id)
        )
    )
  );

drop policy if exists "items follow their content's visibility" on public.content_items;
create policy "items follow their content's visibility"
  on public.content_items for select
  using (
    exists (
      select 1 from public.content_modules m
      join public.content c on c.id = m.content_id
      where m.id = module_id
        and (
          (c.status = 'published' and c.sale_status in ('published', 'restored'))
          or c.author_id = auth.uid()
          or public.has_active_purchase(c.id)
        )
    )
  );

-- 5) Complaints: no duplicates, basic rate limit, audit event.
create unique index if not exists content_reports_one_open_per_user
  on public.content_reports (reporter_id, content_item_id)
  where status = 'open';

create or replace function public.content_report_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.content_reports
       where reporter_id = new.reporter_id
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Забагато скарг за короткий час. Спробуйте пізніше.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.content_reports
              where reporter_id = new.reporter_id
                and content_item_id = new.content_item_id
                and status = 'open') then
    raise exception 'Ви вже надіслали скаргу на цей матеріал — ми її розглядаємо.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists content_report_before_insert_trg on public.content_reports;
create trigger content_report_before_insert_trg
  before insert on public.content_reports
  for each row execute function public.content_report_before_insert();

create or replace function public.content_report_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if new.content_item_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;        -- catalog (non-database) item: nothing to delist
  end if;
  v_id := new.content_item_id::uuid;

  if not exists (select 1 from public.content where id = v_id) then
    return new;
  end if;

  insert into public.content_events (content_id, event, actor_id, actor_kind, details)
  values (v_id, 'complaint_submitted', new.reporter_id, 'user',
          jsonb_build_object('report_id', new.id, 'reason', new.reason));

  -- No automatic delisting: the complaint goes to the admin queue and
  -- Sensoria's admin takes the material off sale manually.
  return new;
end;
$$;

drop trigger if exists content_report_after_insert_trg on public.content_reports;
create trigger content_report_after_insert_trg
  after insert on public.content_reports
  for each row execute function public.content_report_after_insert();
