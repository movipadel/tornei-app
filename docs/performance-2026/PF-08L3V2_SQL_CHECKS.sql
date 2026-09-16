-- PF-08L3V2 supplemental production metadata checks.
-- Manual execution only after separate owner approval.
-- All statements are catalog-only SELECT queries.

-- Q01: current PostgreSQL version.
SELECT
  current_setting('server_version') AS server_version,
  current_setting('server_version_num') AS server_version_num;

-- Q02: installed extensions, versions, and schemas.
SELECT
  e.extname AS extension_name,
  e.extversion AS extension_version,
  n.nspname AS extension_schema
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname;

-- Q03: public schema owner and effective schema ACL.
SELECT
  n.nspname AS schema_name,
  owner_role.rolname AS owner_name,
  CASE WHEN n.nspacl IS NULL THEN 'default' ELSE 'explicit' END AS acl_source,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee_name,
  acl.privilege_type,
  acl.is_grantable
FROM pg_catalog.pg_namespace AS n
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = n.nspowner
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
WHERE n.nspname = 'public'
ORDER BY grantee_name, acl.privilege_type;

-- Q04: properties and ownership of the two public staff functions.
SELECT
  p.oid::pg_catalog.regprocedure AS function_identity,
  owner_role.rolname AS owner_name,
  l.lanname AS language_name,
  CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END AS security_mode,
  CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' WHEN 'v' THEN 'volatile' END AS volatility,
  CASE p.proparallel WHEN 's' THEN 'safe' WHEN 'r' THEN 'restricted' WHEN 'u' THEN 'unsafe' END AS parallel_safety,
  p.proconfig AS function_config
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
WHERE p.oid IN (
  'public.set_staff_password(uuid,text)'::pg_catalog.regprocedure,
  'public.verify_staff_login(text,text)'::pg_catalog.regprocedure
)
ORDER BY function_identity;

-- Q05: effective EXECUTE ACL of the two public staff functions.
SELECT
  p.oid::pg_catalog.regprocedure AS function_identity,
  CASE WHEN p.proacl IS NULL THEN 'default' ELSE 'explicit' END AS acl_source,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee_name,
  acl.privilege_type,
  acl.is_grantable
FROM pg_catalog.pg_proc AS p
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
WHERE p.oid IN (
  'public.set_staff_password(uuid,text)'::pg_catalog.regprocedure,
  'public.verify_staff_login(text,text)'::pg_catalog.regprocedure
)
ORDER BY function_identity, grantee_name, acl.privilege_type;

-- Q06: owner and effective table ACL for the PF-08 table boundary.
WITH pf08_tables(table_name) AS (
  VALUES
    ('users'),
    ('loyalty_memberships'),
    ('loyalty_transactions'),
    ('rewards_catalog'),
    ('reward_redemptions'),
    ('store_categories'),
    ('store_lines'),
    ('store_products'),
    ('store_product_colors'),
    ('store_product_sizes'),
    ('store_product_stock'),
    ('store_orders'),
    ('store_order_items')
)
SELECT
  c.relname AS table_name,
  owner_role.rolname AS owner_name,
  CASE WHEN c.relacl IS NULL THEN 'default' ELSE 'explicit' END AS acl_source,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee_name,
  acl.privilege_type,
  acl.is_grantable
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pf08_tables AS target ON target.table_name = c.relname
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY table_name, grantee_name, acl.privilege_type;

-- Q07: global and public-schema default privileges.
SELECT
  owner_role.rolname AS owner_name,
  COALESCE(n.nspname, '<global>') AS target_schema,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'table'
    WHEN 'S' THEN 'sequence'
    WHEN 'f' THEN 'function'
    WHEN 'T' THEN 'type'
    WHEN 'n' THEN 'schema'
  END AS object_kind,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee_name,
  acl.privilege_type,
  acl.is_grantable
FROM pg_catalog.pg_default_acl AS d
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = d.defaclrole
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS acl ON true
LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
WHERE d.defaclnamespace = 0
   OR n.nspname = 'public'
ORDER BY owner_name, target_schema, object_kind, grantee_name, acl.privilege_type;
