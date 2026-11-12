-- One aggregate for member balances and the global outstanding-points KPI.
-- A NULL input requests the global total; a non-NULL array scopes member rows.
create function public.get_moviback_points_balances(p_membership_ids uuid[] default null)
returns table (membership_id uuid, points_balance bigint)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_membership_ids is null then
    return query
      select null::uuid, coalesce(sum(tx.points_delta), 0)::bigint
      from public.loyalty_transactions as tx;
  else
    return query
      select tx.membership_id, sum(tx.points_delta)::bigint
      from public.loyalty_transactions as tx
      where tx.membership_id = any(p_membership_ids)
      group by tx.membership_id;
  end if;
end;
$$;

revoke all on function public.get_moviback_points_balances(uuid[]) from public, anon, authenticated;
grant execute on function public.get_moviback_points_balances(uuid[]) to service_role;
