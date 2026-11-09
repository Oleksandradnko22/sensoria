-- Deleting messages and conversations («Повідомлення»). Run once in the Supabase SQL editor.
-- Safe to re-run.
--
--   • «Видалити повідомлення» — only the SENDER, only their own message. It disappears for
--     BOTH people (a tombstone «Повідомлення видалено» stays in the thread). The original
--     text is moved to `deleted_body`, which clients can NOT read — it is kept for moderation
--     and complaints only.
--   • «Видалити переписку» — hides the whole conversation for the person who asked, and ONLY
--     for them: the other person keeps their copy. New messages after that start a fresh thread.
--
-- Both go through functions (no client UPDATE/DELETE rights are added).

alter table public.messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_body text,
  add column if not exists hidden_by_sender boolean not null default false,
  add column if not exists hidden_by_recipient boolean not null default false;

-- clients never read the preserved original
revoke select (deleted_body) on public.messages from anon, authenticated;

-- a conversation hidden by me is not visible to me any more
drop policy if exists "messages visible to sender and recipient" on public.messages;
create policy "messages visible to sender and recipient"
  on public.messages for select
  using (
    (auth.uid() = sender_id and not hidden_by_sender)
    or (auth.uid() = recipient_id and not hidden_by_recipient)
  );

-- the old policy let a recipient change ANY column of a message they received;
-- the only thing they may change directly is «read»
revoke update on public.messages from anon, authenticated;
grant update (read) on public.messages to authenticated;

create or replace function public.delete_my_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
     set deleted_body = coalesce(deleted_body, body),
         body = '',
         deleted_at = coalesce(deleted_at, now()),
         read = true
   where id = p_message_id
     and sender_id = auth.uid();
  if not found then
    raise exception 'Повідомлення не знайдено або воно не ваше';
  end if;
end;
$$;

create or replace function public.hide_conversation(p_other uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
     set hidden_by_sender = true
   where sender_id = auth.uid()
     and recipient_id = p_other
     and content_id is not distinct from p_content;
  update public.messages
     set hidden_by_recipient = true,
         read = true
   where recipient_id = auth.uid()
     and sender_id = p_other
     and content_id is not distinct from p_content;
end;
$$;

revoke all on function public.delete_my_message(uuid) from public;
revoke all on function public.hide_conversation(uuid, text) from public;
grant execute on function public.delete_my_message(uuid) to authenticated;
grant execute on function public.hide_conversation(uuid, text) to authenticated;

notify pgrst, 'reload schema';
