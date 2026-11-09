-- 2026-09-29 bugfix: messages.content_id was declared `uuid references
-- content(id)`, but "Запитати автора" (AskAuthorBox.tsx) sends messages
-- for programs, guides, AND meditations — only programs are real rows
-- in `content` with a uuid id; guides/meditations are static catalog
-- entries with their own text slug ids (e.g. "quick-grounding" — see
-- data/meditations.ts / data/guides.ts). Postgres rejected any such
-- slug as an invalid uuid before the insert even reached RLS or
-- moderation, so every "Запитати автора" message about a guide or
-- meditation failed outright with "invalid input syntax for type uuid".
--
-- Drops the FK too — a slug that isn't a real `content` row can't
-- reference one; ParticipantMessages.tsx/AuthorMessages.tsx already
-- resolve a message's content_id against guides/meditations/programs
-- client-side (see fetchConversations' own three-way lookup), so no
-- code needs to change for this, only the column's own type/constraint.
alter table public.messages drop constraint if exists messages_content_id_fkey;
alter table public.messages alter column content_id type text using content_id::text;
