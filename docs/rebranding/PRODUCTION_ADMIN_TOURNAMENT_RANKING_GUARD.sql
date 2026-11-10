-- READ ONLY preparation for a future, separately authorized release.
-- Set :circuit_id to the verified active Baraonda circuit ID before both runs.
-- Export both result sets before and after deployment and compare byte-for-byte.
-- Stop release if count, name/key, position, points, or result count changes.
begin;
set transaction read only;
show transaction_read_only;

-- Public standings aggregate on the existing player_name key. Also snapshot the
-- public API response: its Italian locale tie ordering is authoritative.
with totals as (
  select ranking_group_id, btrim(player_name) as player_name,
         sum(coalesce(points,0)) as total_points, count(*) as events_played
  from public.circuit_results
  where circuit_id=:'circuit_id'::uuid and nullif(btrim(player_name),'') is not null
  group by ranking_group_id,btrim(player_name)
)
select ranking_group_id, row_number() over(partition by ranking_group_id order by total_points desc,player_name) as position,
       player_name,total_points,events_played
from totals order by ranking_group_id,position;

-- Admin/key view: preserve literal historical player_key aggregation.
with totals as (
  select ranking_group_id,player_key,
         min(player_name) as player_name,sum(coalesce(points,0)) as total_points,count(*) as result_count,
         count(distinct source_tournament_id) as tournament_count
  from public.circuit_results where circuit_id=:'circuit_id'::uuid
  group by ranking_group_id,player_key
)
select ranking_group_id,row_number() over(partition by ranking_group_id order by total_points desc,player_name,player_key) as position,
       player_key,player_name,total_points,result_count,tournament_count
from totals order by ranking_group_id,position;

select count(*) as circuit_result_rows from public.circuit_results where circuit_id=:'circuit_id'::uuid;
rollback;
