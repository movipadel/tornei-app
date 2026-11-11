-- READ ONLY preparation for a future, separately authorized release.
-- Set :circuit_id to the verified active Baraonda circuit ID before both runs.
-- Export both result sets before and after deployment and compare byte-for-byte.
-- Stop release if count, normalized name/key, position, points, or result count changes.
-- Name normalization trims outer whitespace, collapses inner whitespace, and
-- folds case only; the raw production name remains visible in both views.
begin;
set transaction read only;
show transaction_read_only;

-- Public standings aggregate on the existing player_name key. Also snapshot the
-- public API response: its Italian locale tie ordering is authoritative.
with totals as (
  select ranking_group_id, btrim(player_name) as raw_name,
         sum(coalesce(points,0)) as total_points, count(*) as events_played
  from public.circuit_results
  where circuit_id=:'circuit_id'::uuid and nullif(btrim(player_name),'') is not null
  group by ranking_group_id,btrim(player_name)
)
select ranking_group_id, row_number() over(partition by ranking_group_id order by total_points desc,raw_name) as position,
       raw_name, initcap(lower(regexp_replace(raw_name,'[[:space:]]+',' ','g'))) as normalized_name,
       total_points,events_played
from totals order by ranking_group_id,position;

-- Admin/key view: preserve literal historical player_key aggregation.
with totals as (
  select ranking_group_id,player_key,
         min(player_name) as raw_name,sum(coalesce(points,0)) as total_points,count(*) as result_count,
         count(distinct source_tournament_id) as tournament_count
  from public.circuit_results where circuit_id=:'circuit_id'::uuid
  group by ranking_group_id,player_key
)
select ranking_group_id,row_number() over(partition by ranking_group_id order by total_points desc,raw_name,player_key) as position,
       player_key,raw_name,initcap(lower(regexp_replace(btrim(raw_name),'[[:space:]]+',' ','g'))) as normalized_name,
       total_points,result_count,tournament_count
from totals order by ranking_group_id,position;

select count(*) as circuit_result_rows, coalesce(sum(points),0) as points_total
from public.circuit_results where circuit_id=:'circuit_id'::uuid;

-- Expected Crazy Winter baseline. This is a read-only gate for a future release;
-- it does not apply the migration or alter historical ranking rows.
with expected(position, normalized_name, total_points, result_count, tournament_count) as (
  values (1,'tiziana mellano',450,1,1),(2,'guido rosa',400,1,1),
         (3,'maddalena fumero',350,1,1),(4,'alberto negri',300,1,1),
         (5,'stefano cavazzuti',250,1,1),(6,'andrea eschine',200,1,1),
         (7,'emanuela cancellieri',150,1,1),(8,'alessandra occelli',100,1,1)
), public_totals as (
  select btrim(player_name) as raw_name, sum(points)::integer as total_points,
         count(*)::integer as result_count
  from public.circuit_results where circuit_id=:'circuit_id'::uuid
  group by btrim(player_name)
), public_actual as (
  select row_number() over(order by total_points desc,raw_name)::integer as position,
         lower(regexp_replace(raw_name,'[[:space:]]+',' ','g')) as normalized_name,
         total_points,result_count
  from public_totals
), admin_totals as (
  select ranking_group_id,player_key,min(player_name) as raw_name,
         sum(points)::integer as total_points,count(*)::integer as result_count,
         count(distinct source_tournament_id)::integer as tournament_count
  from public.circuit_results where circuit_id=:'circuit_id'::uuid
  group by ranking_group_id,player_key
), admin_actual as (
  select row_number() over(order by total_points desc,raw_name,player_key)::integer as position,
         lower(regexp_replace(btrim(raw_name),'[[:space:]]+',' ','g')) as normalized_name,
         total_points,result_count,tournament_count
  from admin_totals
), public_mismatch as (
  (select position,normalized_name,total_points,result_count from expected
   except all select * from public_actual)
  union all
  (select * from public_actual
   except all select position,normalized_name,total_points,result_count from expected)
), admin_mismatch as (
  (select * from expected except all select * from admin_actual)
  union all
  (select * from admin_actual except all select * from expected)
)
select (select count(*) from public.circuit_results where circuit_id=:'circuit_id'::uuid)=8
   and (select coalesce(sum(points),0) from public.circuit_results where circuit_id=:'circuit_id'::uuid)=2200
   and (select count(*) from public_actual)=8
   and (select count(*) from admin_actual)=8
   and (select bool_and(ranking_group_id='5c7311d8-5603-48cc-943b-01cb28252c55'::uuid
                        and player_key is not null) from admin_totals)
   and (select md5(string_agg(player_key,'|' order by total_points desc,raw_name,player_key))
        from admin_totals)='65ff5395fdee22d50f3cb0ac40ec2e90'
   and not exists(select 1 from public_mismatch)
   and not exists(select 1 from admin_mismatch) as crazy_winter_ranking_unchanged;
rollback;
