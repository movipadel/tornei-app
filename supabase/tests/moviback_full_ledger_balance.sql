begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_membership uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_global_before bigint;
  v_balance bigint;
begin
  if has_function_privilege('anon', 'public.get_moviback_points_balances(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_moviback_points_balances(uuid[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_moviback_points_balances(uuid[])', 'EXECUTE') then
    raise exception 'balance RPC grants are unsafe';
  end if;

  select points_balance into v_global_before
  from public.get_moviback_points_balances(null);

  insert into public.users(id, full_name, phone, gender)
  values (v_user, 'Synthetic balance test', '0000000000', 'M');
  insert into public.loyalty_memberships(id, user_id, membership_code, tax_code)
  values (v_membership, v_user, 'BAL-' || replace(v_membership::text, '-', ''), 'SYNTHETIC');

  insert into public.loyalty_transactions(membership_id, type, source, points_delta)
  select v_membership, 'adjustment', 'correction', 1 from generate_series(1, 16);
  select points_balance into v_balance from public.get_moviback_points_balances(array[v_membership]);
  if v_balance <> 16 then raise exception '16-row balance: %', v_balance; end if;

  insert into public.loyalty_transactions(membership_id, type, source, points_delta)
  select v_membership, 'adjustment', 'correction', 1 from generate_series(17, 80);
  select points_balance into v_balance from public.get_moviback_points_balances(array[v_membership]);
  if v_balance <> 80 then raise exception '80-row balance: %', v_balance; end if;

  insert into public.loyalty_transactions(membership_id, type, source, points_delta)
  values (v_membership, 'adjustment', 'correction', 1);
  select points_balance into v_balance from public.get_moviback_points_balances(array[v_membership]);
  if v_balance <> 81 then raise exception '81-row balance: %', v_balance; end if;

  insert into public.loyalty_transactions(membership_id, type, source, points_delta)
  select v_membership, 'adjustment', 'correction', 1 from generate_series(82, 149);
  insert into public.loyalty_transactions(membership_id, type, source, points_delta)
  values (v_membership, 'redeem', 'reward_redemption', -20);
  select points_balance into v_balance from public.get_moviback_points_balances(array[v_membership]);
  if v_balance <> 129 then raise exception '150-row reversal balance: %', v_balance; end if;

  select points_balance into v_balance from public.get_moviback_points_balances(array[v_membership, v_other]);
  if v_balance <> 129 then raise exception 'batch balance: %', v_balance; end if;
  if (select count(*) from public.get_moviback_points_balances(array[v_membership, v_other])) <> 1 then
    raise exception 'empty membership unexpectedly returned';
  end if;

  select points_balance into v_balance from public.get_moviback_points_balances(null);
  if v_balance <> v_global_before + 129 then raise exception 'global balance: %', v_balance; end if;
end;
$$;

rollback;
