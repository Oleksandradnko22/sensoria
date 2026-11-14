-- «Просування» in the author's cabinet: how many people came through the author's referral link. Run ONCE in the
-- Supabase SQL editor; safe to re-run. Works before the finance migration too (then the numbers are 0): the
-- attribution itself lives in referral_attributions + claim_referral (supabase/finance-migration.sql).
create or replace function public.my_referral_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  last30 int := 0;
  total int := 0;
begin
  if to_regclass('public.referral_attributions') is not null then
    execute 'select count(*) filter (where created_at > now() - interval ''30 days''), count(*) from public.referral_attributions where author_id = $1'
      into last30, total using auth.uid();
  end if;
  return jsonb_build_object('last_30_days', last30, 'all_time', total);
end;
$$;
revoke all on function public.my_referral_stats() from public, anon;
grant execute on function public.my_referral_stats() to authenticated;
notify pgrst, 'reload schema';
