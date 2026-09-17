-- PF-08B2C owner-run reward inventory. Read-only; not executed by this audit.
-- The JSON extraction returns NULL when fulfillment_type is not present yet.

SELECT
    r.id AS reward_id,
    r.name AS reward_name,
    r.description,
    r.is_active,
    r.reward_type,
    r.category,
    rc.is_active AS configured_category_is_active,
    r.points_cost,
    r.stock_qty,
    r.store_product_id,
    r.requires_store_variant,
    nullif(to_jsonb(r) ->> 'fulfillment_type', '') AS current_fulfillment_type,
    sp.name AS linked_store_product_name,
    sp.is_active AS linked_store_product_is_active,
    (
        SELECT count(*)
        FROM public.store_product_colors AS color
        WHERE color.product_id = sp.id
          AND color.is_active = true
    ) AS active_color_count,
    (
        SELECT count(*)
        FROM public.store_product_sizes AS size
        WHERE size.product_id = sp.id
          AND size.is_active = true
    ) AS active_size_count,
    (
        SELECT count(*)
        FROM public.store_product_stock AS stock
        WHERE stock.product_id = sp.id
          AND stock.is_active = true
    ) AS active_stock_identity_count
FROM public.rewards_catalog AS r
LEFT JOIN public.reward_categories AS rc
    ON rc.name = r.category
LEFT JOIN public.store_products AS sp
    ON sp.id = r.store_product_id
ORDER BY r.is_active DESC, r.name, r.id;
