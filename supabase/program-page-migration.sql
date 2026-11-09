-- Program page rework: intro video link + cover focal point.
-- Safe to run more than once. Run in the Supabase SQL editor.
alter table public.content add column if not exists intro_video_url text;
alter table public.content add column if not exists cover_focus jsonb;
-- cover_focus shape: {"x": 0..100, "y": 0..100} — the point of the cover that must stay visible in every crop.
