-- MOVIPadel production public-schema baseline.
-- Source: reviewed schema-only production dump (PostgreSQL 17.6).
-- Source SHA-256: E98D8B8AE744DD50E8FA3A2CE4B3ADE3E16675F3D6B68D2C778DF8D300F7C092.
-- Local prerequisites: PostgreSQL 17, standard Supabase auth schema,
-- pgcrypto routines in extensions, postgres/anon/authenticated/service_role roles.
-- This baseline intentionally contains no production row data and no PF-08 future changes.
-- Supabase-managed schemas and extensions are not recreated here.

CREATE TABLE public.admin_push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    home_title text DEFAULT 'Tornei'::text NOT NULL,
    home_subtitle text DEFAULT 'Iscriviti ai tornei Movi e gestisci le tue iscrizioni'::text NOT NULL,
    home_logo_url text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.circuit_points_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    min_admissions integer NOT NULL,
    max_admissions integer NOT NULL,
    placement integer,
    points integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rule_type text DEFAULT 'placement'::text NOT NULL,
    stage text,
    circuit_id uuid NOT NULL,
    CONSTRAINT circuit_points_rules_placement_check CHECK ((placement > 0)),
    CONSTRAINT circuit_points_rules_points_check CHECK ((points >= 0)),
    CONSTRAINT circuit_points_rules_range_check CHECK (((min_admissions > 0) AND (max_admissions >= min_admissions))),
    CONSTRAINT circuit_points_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['placement'::text, 'stage'::text]))),
    CONSTRAINT circuit_points_rules_stage_check CHECK ((stage = ANY (ARRAY['winner'::text, 'finalist'::text, 'semifinalist'::text, 'quarterfinalist'::text, 'others'::text])))
);

CREATE TABLE public.circuit_ranking_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    circuit_id uuid NOT NULL,
    category text NOT NULL,
    level text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT circuit_ranking_groups_category_check CHECK ((category = ANY (ARRAY['Maschile'::text, 'Femminile'::text, 'Misto'::text, 'Libero'::text]))),
    CONSTRAINT circuit_ranking_groups_level_check CHECK ((level = ANY (ARRAY['principiante'::text, 'intermedio'::text, 'avanzato'::text])))
);

CREATE TABLE public.circuit_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    circuit_id uuid NOT NULL,
    ranking_group_id uuid NOT NULL,
    source_tournament_id uuid,
    tournament_name text NOT NULL,
    tournament_type text NOT NULL,
    tournament_date date,
    player_key text NOT NULL,
    player_name text NOT NULL,
    player_phone text,
    placement integer,
    points integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT circuit_results_points_check CHECK ((points >= 0))
);

CREATE TABLE public.circuits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    tournament_type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hero_logo_url text,
    hero_logo_2_url text,
    hero_logo_3_url text,
    hero_subtitle text,
    theme_key text,
    rules_url text,
    CONSTRAINT circuits_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text]))),
    CONSTRAINT circuits_tournament_type_check CHECK ((tournament_type = ANY (ARRAY['Baraonda'::text, 'Coppie fisse'::text])))
);

CREATE TABLE public.communication_user_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    communication_id uuid NOT NULL,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.communications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target text DEFAULT 'all'::text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    image_path text,
    cta_label text,
    cta_url text,
    is_active boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    tournament_id uuid,
    CONSTRAINT communications_target_check CHECK ((target = ANY (ARRAY['all'::text, 'moviback'::text, 'moviback_approved'::text, 'moviback_pending'::text, 'moviback_suspended'::text, 'staff'::text, 'tournament'::text])))
);

CREATE TABLE public.loyalty_global_promos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    multiplier numeric DEFAULT 1 NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    schedule_type text DEFAULT 'always'::text NOT NULL,
    days_of_week integer[],
    start_time time without time zone,
    end_time time without time zone,
    target_type text DEFAULT 'all'::text NOT NULL,
    target_gender text,
    min_age integer,
    max_age integer,
    new_member_days integer,
    CONSTRAINT loyalty_global_promos_schedule_type_check CHECK ((schedule_type = ANY (ARRAY['always'::text, 'time_window'::text, 'weekdays'::text, 'weekend'::text]))),
    CONSTRAINT loyalty_global_promos_target_gender_check CHECK (((target_gender IS NULL) OR (target_gender = ANY (ARRAY['M'::text, 'F'::text])))),
    CONSTRAINT loyalty_global_promos_target_type_check CHECK ((target_type = ANY (ARRAY['all'::text, 'birthday'::text, 'gender'::text, 'age_range'::text, 'new_members'::text])))
);

CREATE TABLE public.loyalty_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    membership_code text NOT NULL,
    tax_code text NOT NULL,
    approved_at timestamp with time zone,
    approved_by uuid,
    suspended_at timestamp with time zone,
    suspension_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    membership_type text,
    fee_points integer DEFAULT 0 NOT NULL,
    fee_paid boolean DEFAULT false NOT NULL,
    has_existing_membership boolean DEFAULT false NOT NULL,
    existing_membership_type text,
    existing_membership_number text,
    health_data_consent_at timestamp with time zone,
    rejection_reason text,
    rejected_at timestamp with time zone,
    CONSTRAINT existing_membership_type_check CHECK (((existing_membership_type IS NULL) OR (existing_membership_type = ANY (ARRAY['ASC'::text, 'FITP'::text])))),
    CONSTRAINT loyalty_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text, 'suspended'::text]))),
    CONSTRAINT membership_type_check CHECK (((membership_type IS NULL) OR (membership_type = ANY (ARRAY['ASC'::text, 'FITP'::text]))))
);

CREATE TABLE public.loyalty_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    type text NOT NULL,
    source text NOT NULL,
    euro_amount numeric,
    points_delta integer NOT NULL,
    created_by uuid,
    notes text,
    related_redemption_id uuid,
    related_partner_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club text,
    CONSTRAINT loyalty_source_check CHECK ((source = ANY (ARRAY['club_payment'::text, 'reward_redemption'::text, 'manual_adjustment'::text, 'correction'::text, 'membership_fee'::text]))),
    CONSTRAINT loyalty_type_check CHECK ((type = ANY (ARRAY['earn'::text, 'redeem'::text, 'adjustment'::text, 'refund'::text, 'cancel'::text])))
);

CREATE TABLE public.loyalty_user_promos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    multiplier numeric DEFAULT 1 NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.medical_certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_path text NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    expiry_date date,
    notes text,
    CONSTRAINT medical_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text, 'expired'::text])))
);

CREATE TABLE public.reward_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.reward_point_ranges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    min_points integer,
    max_points integer,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT reward_point_ranges_valid CHECK (((min_points IS NULL) OR (max_points IS NULL) OR (min_points <= max_points)))
);

CREATE TABLE public.reward_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    reward_id uuid NOT NULL,
    points_cost integer NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    handled_by uuid,
    notes text,
    qr_token text,
    CONSTRAINT redemption_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'delivered'::text, 'cancelled'::text, 'rejected'::text])))
);

CREATE TABLE public.rewards_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    points_cost integer NOT NULL,
    image_path text,
    is_active boolean DEFAULT true NOT NULL,
    stock_qty integer,
    reward_type text DEFAULT 'club'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    store_product_id uuid,
    requires_store_variant boolean DEFAULT false NOT NULL,
    CONSTRAINT reward_type_check CHECK ((reward_type = ANY (ARRAY['club'::text, 'partner'::text])))
);

CREATE TABLE public.staff_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    password_hash text,
    role text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'staff'::text])))
);

CREATE TABLE public.store_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.store_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.store_order_economics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    supplier_paid_by text,
    supplier_paid_by_name text,
    is_supplier_paid boolean DEFAULT false NOT NULL,
    supplier_paid_at timestamp with time zone,
    notes text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_order_economics_supplier_paid_by_check CHECK ((supplier_paid_by = ANY (ARRAY['club'::text, 'privato'::text])))
);

CREATE TABLE public.store_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    color_id uuid,
    size_id uuid,
    product_name text NOT NULL,
    color_name text,
    size_label text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_euro numeric(10,2) DEFAULT 0 NOT NULL,
    unit_price_points integer DEFAULT 0 NOT NULL,
    total_euro numeric(10,2) DEFAULT 0 NOT NULL,
    total_points integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_product_name text,
    custom_variant text,
    supplier_notes text,
    CONSTRAINT store_order_items_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE public.store_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    pickup_club text NOT NULL,
    payment_mode text NOT NULL,
    total_euro numeric(10,2) DEFAULT 0 NOT NULL,
    total_points integer DEFAULT 0 NOT NULL,
    customer_name text,
    customer_phone text,
    customer_email text,
    notes text,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    ordered_to_supplier_at timestamp with time zone,
    ready_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    is_paid boolean DEFAULT false,
    paid_at timestamp with time zone,
    supplier_paid boolean DEFAULT false NOT NULL,
    supplier_paid_at timestamp with time zone,
    supplier_paid_by_type text,
    supplier_paid_by_name text,
    supplier_paid_by_club text,
    supplier_payment_notes text,
    order_type text DEFAULT 'catalog'::text NOT NULL,
    related_redemption_id uuid,
    special_title text,
    special_notes text,
    CONSTRAINT store_orders_order_type_check CHECK ((order_type = ANY (ARRAY['catalog'::text, 'special'::text, 'reward_redemption'::text]))),
    CONSTRAINT store_orders_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['euro'::text, 'points'::text, 'mixed'::text]))),
    CONSTRAINT store_orders_pickup_club_check CHECK ((pickup_club = ANY (ARRAY['CENTALLO'::text, 'COSTIGLIOLE'::text, 'MANTA'::text, 'SALUZZO'::text, 'REVELLO'::text]))),
    CONSTRAINT store_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'ordered_to_supplier'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text]))),
    CONSTRAINT store_orders_supplier_paid_by_type_check CHECK (((supplier_paid_by_type IS NULL) OR (supplier_paid_by_type = ANY (ARRAY['club'::text, 'person'::text]))))
);

CREATE TABLE public.store_product_colors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    color_name text NOT NULL,
    color_hex text,
    image_path text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.store_product_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    purchase_cost_euro numeric(10,2) DEFAULT 0 NOT NULL,
    supplier_name text,
    notes text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.store_product_sizes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    size_label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.store_product_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    color_id uuid NOT NULL,
    size_id uuid,
    stock_qty integer,
    sku text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.store_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    line_id uuid,
    name text NOT NULL,
    description text,
    base_price_euro numeric(10,2) DEFAULT 0 NOT NULL,
    base_price_points integer,
    allow_euro boolean DEFAULT true NOT NULL,
    allow_points boolean DEFAULT false NOT NULL,
    allow_mixed boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.store_promos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    discount_percent integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_promos_discount_percent_check CHECK (((discount_percent >= 0) AND (discount_percent <= 100)))
);

CREATE TABLE public.store_special_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_name text NOT NULL,
    customer_contact text,
    item_description text NOT NULL,
    sale_price_euro numeric(10,2) DEFAULT 0 NOT NULL,
    purchase_cost_euro numeric(10,2) DEFAULT 0 NOT NULL,
    pickup_club text,
    is_customer_paid boolean DEFAULT false NOT NULL,
    customer_paid_at timestamp with time zone,
    supplier_paid_by text,
    supplier_paid_by_name text,
    is_supplier_paid boolean DEFAULT false NOT NULL,
    supplier_paid_at timestamp with time zone,
    notes text,
    order_month date DEFAULT (date_trunc('month'::text, now()))::date NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_special_orders_supplier_paid_by_check CHECK ((supplier_paid_by = ANY (ARRAY['club'::text, 'privato'::text])))
);

CREATE TABLE public.store_supplier_batch_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    order_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.store_supplier_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_number text,
    status text DEFAULT 'draft'::text NOT NULL,
    title text,
    notes text,
    total_orders integer DEFAULT 0 NOT NULL,
    total_items integer DEFAULT 0 NOT NULL,
    total_euro numeric(10,2) DEFAULT 0 NOT NULL,
    total_points integer DEFAULT 0 NOT NULL,
    pdf_path text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    generated_at timestamp with time zone,
    sent_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT store_supplier_batches_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'generated'::text, 'sent'::text, 'cancelled'::text])))
);

CREATE TABLE public.tournament_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tournament_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_reserve boolean DEFAULT false NOT NULL,
    p1_name text NOT NULL,
    p1_phone text NOT NULL,
    p1_gender text,
    p2_name text,
    p2_phone text,
    p2_gender text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    CONSTRAINT tournament_registrations_p1_gender_check CHECK ((p1_gender = ANY (ARRAY['M'::text, 'F'::text]))),
    CONSTRAINT tournament_registrations_p2_gender_check CHECK ((p2_gender = ANY (ARRAY['M'::text, 'F'::text])))
);

CREATE TABLE public.tournament_run_bracket_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    "position" integer NOT NULL,
    pair_id uuid,
    is_bye boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_bye_pair_exclusive CHECK ((((is_bye = true) AND (pair_id IS NULL)) OR (is_bye = false)))
);

CREATE TABLE public.tournament_run_group_pairs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    pair_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tournament_run_matches_fp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    stage text NOT NULL,
    group_id uuid,
    round_label text,
    home_pair_id uuid,
    away_pair_id uuid,
    court integer,
    starts_at time without time zone,
    home_games integer,
    away_games integer,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    set1_home_games integer,
    set1_away_games integer,
    set2_home_games integer,
    set2_away_games integer,
    set3_home_games integer,
    set3_away_games integer,
    home_sets integer,
    away_sets integer,
    CONSTRAINT chk_fp_away_sets_range CHECK (((away_sets IS NULL) OR ((away_sets >= 0) AND (away_sets <= 2)))),
    CONSTRAINT chk_fp_home_sets_range CHECK (((home_sets IS NULL) OR ((home_sets >= 0) AND (home_sets <= 2)))),
    CONSTRAINT chk_fp_not_same_team CHECK ((home_pair_id <> away_pair_id)),
    CONSTRAINT chk_fp_set1_away_ge0 CHECK (((set1_away_games IS NULL) OR (set1_away_games >= 0))),
    CONSTRAINT chk_fp_set1_home_ge0 CHECK (((set1_home_games IS NULL) OR (set1_home_games >= 0))),
    CONSTRAINT chk_fp_set2_away_ge0 CHECK (((set2_away_games IS NULL) OR (set2_away_games >= 0))),
    CONSTRAINT chk_fp_set2_home_ge0 CHECK (((set2_home_games IS NULL) OR (set2_home_games >= 0))),
    CONSTRAINT chk_fp_set3_away_ge0 CHECK (((set3_away_games IS NULL) OR (set3_away_games >= 0))),
    CONSTRAINT chk_fp_set3_home_ge0 CHECK (((set3_home_games IS NULL) OR (set3_home_games >= 0))),
    CONSTRAINT chk_group_pairs_not_null CHECK (((stage <> 'group'::text) OR ((home_pair_id IS NOT NULL) AND (away_pair_id IS NOT NULL)))),
    CONSTRAINT tournament_run_matches_fp_away_games_check CHECK (((away_games IS NULL) OR (away_games >= 0))),
    CONSTRAINT tournament_run_matches_fp_home_games_check CHECK (((home_games IS NULL) OR (home_games >= 0))),
    CONSTRAINT tournament_run_matches_fp_stage_check CHECK ((stage = ANY (ARRAY['group'::text, 'bracket'::text])))
);

CREATE VIEW public.tournament_run_group_standings AS
 WITH completed AS (
         SELECT m.run_id,
            m.group_id,
            m.home_pair_id,
            m.away_pair_id,
            m.home_games,
            m.away_games
           FROM public.tournament_run_matches_fp m
          WHERE ((m.stage = 'group'::text) AND (m.group_id IS NOT NULL) AND (m.completed_at IS NOT NULL) AND (m.home_games IS NOT NULL) AND (m.away_games IS NOT NULL))
        ), rows AS (
         SELECT completed.run_id,
            completed.group_id,
            completed.home_pair_id AS pair_id,
                CASE
                    WHEN (completed.home_games > completed.away_games) THEN 1
                    ELSE 0
                END AS points,
            completed.home_games AS gw,
            completed.away_games AS gl
           FROM completed
        UNION ALL
         SELECT completed.run_id,
            completed.group_id,
            completed.away_pair_id AS pair_id,
                CASE
                    WHEN (completed.away_games > completed.home_games) THEN 1
                    ELSE 0
                END AS points,
            completed.away_games AS gw,
            completed.home_games AS gl
           FROM completed
        )
 SELECT run_id,
    group_id,
    pair_id,
    (sum(points))::integer AS points,
    (sum(gw))::integer AS gw,
    (sum(gl))::integer AS gl,
    ((sum(gw) - sum(gl)))::integer AS dg,
    (count(*))::integer AS played
   FROM rows
  GROUP BY run_id, group_id, pair_id;

CREATE TABLE public.tournament_run_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tournament_run_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    turn_id uuid NOT NULL,
    match_number integer NOT NULL,
    p1_id uuid NOT NULL,
    p2_id uuid NOT NULL,
    p3_id uuid NOT NULL,
    p4_id uuid NOT NULL,
    team1_games integer,
    team2_games integer,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tournament_run_pairs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    registration_id uuid,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE VIEW public.tournament_run_matches_fp_view AS
 SELECT m.id,
    m.run_id,
    m.stage,
    m.group_id,
    m.round_label,
    m.home_pair_id,
    m.away_pair_id,
    m.court,
    m.starts_at,
    m.home_games,
    m.away_games,
    m.completed_at,
    m.created_at,
    hp.name AS home_pair_name,
    ap.name AS away_pair_name,
    g.name AS group_name
   FROM (((public.tournament_run_matches_fp m
     JOIN public.tournament_run_pairs hp ON ((hp.id = m.home_pair_id)))
     JOIN public.tournament_run_pairs ap ON ((ap.id = m.away_pair_id)))
     LEFT JOIN public.tournament_run_groups g ON ((g.id = m.group_id)));

CREATE TABLE public.tournament_run_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    user_id uuid,
    name text NOT NULL,
    phone text,
    sex text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT tournament_run_participants_sex_check CHECK ((sex = ANY (ARRAY['m'::text, 'f'::text])))
);

CREATE VIEW public.tournament_run_standings AS
 SELECT p.run_id,
    p.id AS participant_id,
    p.name,
    sum(
        CASE
            WHEN (m.team1_games IS NULL) THEN 0
            WHEN ((p.id = m.p1_id) OR (p.id = m.p2_id)) THEN m.team1_games
            ELSE m.team2_games
        END) AS games_won,
    sum(
        CASE
            WHEN (m.team1_games IS NULL) THEN 0
            WHEN ((p.id = m.p1_id) OR (p.id = m.p2_id)) THEN m.team2_games
            ELSE m.team1_games
        END) AS games_lost,
    sum(
        CASE
            WHEN (m.team1_games IS NULL) THEN (0)::numeric
            WHEN (m.team1_games = m.team2_games) THEN 0.5
            WHEN (((p.id = m.p1_id) OR (p.id = m.p2_id)) AND (m.team1_games > m.team2_games)) THEN (1)::numeric
            WHEN (((p.id = m.p3_id) OR (p.id = m.p4_id)) AND (m.team2_games > m.team1_games)) THEN (1)::numeric
            ELSE (0)::numeric
        END) AS matches_won
   FROM (public.tournament_run_participants p
     LEFT JOIN public.tournament_run_matches m ON (((((p.id = m.p1_id) OR (p.id = m.p2_id)) OR (p.id = m.p3_id)) OR (p.id = m.p4_id))))
  GROUP BY p.run_id, p.id, p.name;

CREATE TABLE public.tournament_run_turns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    turn_number integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT tournament_run_turns_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'partial'::text, 'completed'::text])))
);

CREATE TABLE public.tournament_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tournament_id uuid NOT NULL,
    mode text NOT NULL,
    category text NOT NULL,
    status text NOT NULL,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    locked_at timestamp without time zone,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    type text,
    settings jsonb,
    CONSTRAINT tournament_runs_category_check CHECK ((category = ANY (ARRAY['maschile'::text, 'femminile'::text, 'libero'::text, 'misto'::text]))),
    CONSTRAINT tournament_runs_mode_check CHECK ((mode = ANY (ARRAY['baraonda'::text, 'fixed_pairs'::text]))),
    CONSTRAINT tournament_runs_status_check CHECK ((status = ANY (ARRAY['locked'::text, 'running'::text, 'completed'::text])))
);

CREATE TABLE public.tournaments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    category text NOT NULL,
    date date NOT NULL,
    "time" text NOT NULL,
    location text NOT NULL,
    max_participants integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    start_at timestamp with time zone,
    max_teams integer,
    notes text,
    updated_at timestamp with time zone DEFAULT now(),
    image_url text,
    level text,
    show_participants boolean DEFAULT false NOT NULL,
    registrations_open boolean DEFAULT true NOT NULL,
    circuit_id uuid,
    circuit_snapshot_created boolean DEFAULT false NOT NULL,
    closed_at timestamp with time zone,
    CONSTRAINT tournaments_category_check CHECK ((category = ANY (ARRAY['Maschile'::text, 'Femminile'::text, 'Misto'::text, 'Libero'::text]))),
    CONSTRAINT tournaments_max_participants_check CHECK ((max_participants > 0)),
    CONSTRAINT tournaments_type_check CHECK ((type = ANY (ARRAY['Coppie fisse'::text, 'Baraonda'::text])))
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    email text,
    gender text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    privacy_accepted_at timestamp with time zone,
    terms_accepted_at timestamp with time zone,
    marketing_accepted boolean DEFAULT false,
    marketing_accepted_at timestamp with time zone,
    age_confirmed_at timestamp with time zone,
    CONSTRAINT users_gender_check CHECK ((gender = ANY (ARRAY['M'::text, 'F'::text])))
);

ALTER TABLE ONLY public.admin_push_subscriptions
    ADD CONSTRAINT admin_push_subscriptions_endpoint_key UNIQUE (endpoint);

ALTER TABLE ONLY public.admin_push_subscriptions
    ADD CONSTRAINT admin_push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.circuit_points_rules
    ADD CONSTRAINT circuit_points_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.circuit_ranking_groups
    ADD CONSTRAINT circuit_ranking_groups_circuit_id_category_level_key UNIQUE (circuit_id, category, level);

ALTER TABLE ONLY public.circuit_ranking_groups
    ADD CONSTRAINT circuit_ranking_groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.circuit_results
    ADD CONSTRAINT circuit_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.circuit_results
    ADD CONSTRAINT circuit_results_ranking_group_id_source_tournament_id_playe_key UNIQUE (ranking_group_id, source_tournament_id, player_key);

ALTER TABLE ONLY public.circuits
    ADD CONSTRAINT circuits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.circuits
    ADD CONSTRAINT circuits_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.communication_user_states
    ADD CONSTRAINT communication_user_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.communication_user_states
    ADD CONSTRAINT communication_user_states_user_id_communication_id_key UNIQUE (user_id, communication_id);

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loyalty_global_promos
    ADD CONSTRAINT loyalty_global_promos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loyalty_memberships
    ADD CONSTRAINT loyalty_memberships_membership_code_key UNIQUE (membership_code);

ALTER TABLE ONLY public.loyalty_memberships
    ADD CONSTRAINT loyalty_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loyalty_user_promos
    ADD CONSTRAINT loyalty_user_promos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.medical_certificates
    ADD CONSTRAINT medical_certificates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reward_categories
    ADD CONSTRAINT reward_categories_name_key UNIQUE (name);

ALTER TABLE ONLY public.reward_categories
    ADD CONSTRAINT reward_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reward_point_ranges
    ADD CONSTRAINT reward_point_ranges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rewards_catalog
    ADD CONSTRAINT rewards_catalog_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_users
    ADD CONSTRAINT staff_users_email_key UNIQUE (email);

ALTER TABLE ONLY public.staff_users
    ADD CONSTRAINT staff_users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_categories
    ADD CONSTRAINT store_categories_name_key UNIQUE (name);

ALTER TABLE ONLY public.store_categories
    ADD CONSTRAINT store_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_categories
    ADD CONSTRAINT store_categories_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.store_lines
    ADD CONSTRAINT store_lines_name_key UNIQUE (name);

ALTER TABLE ONLY public.store_lines
    ADD CONSTRAINT store_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_lines
    ADD CONSTRAINT store_lines_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.store_order_economics
    ADD CONSTRAINT store_order_economics_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY public.store_order_economics
    ADD CONSTRAINT store_order_economics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT store_order_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT store_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_product_colors
    ADD CONSTRAINT store_product_colors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_product_costs
    ADD CONSTRAINT store_product_costs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_product_costs
    ADD CONSTRAINT store_product_costs_product_id_key UNIQUE (product_id);

ALTER TABLE ONLY public.store_product_sizes
    ADD CONSTRAINT store_product_sizes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_product_sizes
    ADD CONSTRAINT store_product_sizes_product_id_size_label_key UNIQUE (product_id, size_label);

ALTER TABLE ONLY public.store_product_stock
    ADD CONSTRAINT store_product_stock_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_product_stock
    ADD CONSTRAINT store_product_stock_product_id_color_id_size_id_key UNIQUE (product_id, color_id, size_id);

ALTER TABLE ONLY public.store_products
    ADD CONSTRAINT store_products_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_promos
    ADD CONSTRAINT store_promos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_special_orders
    ADD CONSTRAINT store_special_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_supplier_batch_orders
    ADD CONSTRAINT store_supplier_batch_orders_batch_id_order_id_key UNIQUE (batch_id, order_id);

ALTER TABLE ONLY public.store_supplier_batch_orders
    ADD CONSTRAINT store_supplier_batch_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_supplier_batches
    ADD CONSTRAINT store_supplier_batches_batch_number_key UNIQUE (batch_number);

ALTER TABLE ONLY public.store_supplier_batches
    ADD CONSTRAINT store_supplier_batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_registrations
    ADD CONSTRAINT tournament_registrations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_bracket_slots
    ADD CONSTRAINT tournament_run_bracket_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_bracket_slots
    ADD CONSTRAINT tournament_run_bracket_slots_run_id_position_key UNIQUE (run_id, "position");

ALTER TABLE ONLY public.tournament_run_group_pairs
    ADD CONSTRAINT tournament_run_group_pairs_group_id_pair_id_key UNIQUE (group_id, pair_id);

ALTER TABLE ONLY public.tournament_run_group_pairs
    ADD CONSTRAINT tournament_run_group_pairs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_groups
    ADD CONSTRAINT tournament_run_groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_groups
    ADD CONSTRAINT tournament_run_groups_run_id_name_key UNIQUE (run_id, name);

ALTER TABLE ONLY public.tournament_run_groups
    ADD CONSTRAINT tournament_run_groups_run_id_position_key UNIQUE (run_id, "position");

ALTER TABLE ONLY public.tournament_run_matches_fp
    ADD CONSTRAINT tournament_run_matches_fp_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_matches
    ADD CONSTRAINT tournament_run_matches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_matches
    ADD CONSTRAINT tournament_run_matches_turn_id_match_number_key UNIQUE (turn_id, match_number);

ALTER TABLE ONLY public.tournament_run_pairs
    ADD CONSTRAINT tournament_run_pairs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_participants
    ADD CONSTRAINT tournament_run_participants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_turns
    ADD CONSTRAINT tournament_run_turns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournament_run_turns
    ADD CONSTRAINT tournament_run_turns_run_id_turn_number_key UNIQUE (run_id, turn_number);

ALTER TABLE ONLY public.tournament_runs
    ADD CONSTRAINT tournament_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE INDEX circuit_points_rules_circuit_id_idx ON public.circuit_points_rules USING btree (circuit_id);

CREATE UNIQUE INDEX circuit_points_rules_unique_placement_idx ON public.circuit_points_rules USING btree (circuit_id, min_admissions, max_admissions, placement) WHERE (rule_type = 'placement'::text);

CREATE UNIQUE INDEX circuit_points_rules_unique_stage_idx ON public.circuit_points_rules USING btree (circuit_id, min_admissions, max_admissions, stage) WHERE (rule_type = 'stage'::text);

CREATE INDEX circuit_ranking_groups_circuit_id_idx ON public.circuit_ranking_groups USING btree (circuit_id);

CREATE INDEX circuit_results_circuit_id_idx ON public.circuit_results USING btree (circuit_id);

CREATE INDEX circuit_results_player_key_idx ON public.circuit_results USING btree (player_key);

CREATE INDEX circuit_results_ranking_group_id_idx ON public.circuit_results USING btree (ranking_group_id);

CREATE INDEX circuits_status_idx ON public.circuits USING btree (status);

CREATE INDEX communication_user_states_comm_idx ON public.communication_user_states USING btree (communication_id);

CREATE INDEX communication_user_states_user_idx ON public.communication_user_states USING btree (user_id);

CREATE INDEX communications_active_dates_idx ON public.communications USING btree (is_active, starts_at, ends_at);

CREATE INDEX communications_target_idx ON public.communications USING btree (target);

CREATE INDEX communications_tournament_id_idx ON public.communications USING btree (tournament_id);

CREATE INDEX idx_trbs_run_id ON public.tournament_run_bracket_slots USING btree (run_id);

CREATE INDEX idx_trg_run_id ON public.tournament_run_groups USING btree (run_id);

CREATE INDEX idx_trgp_group_id ON public.tournament_run_group_pairs USING btree (group_id);

CREATE INDEX idx_trgp_pair_id ON public.tournament_run_group_pairs USING btree (pair_id);

CREATE INDEX idx_trmfp_completed ON public.tournament_run_matches_fp USING btree (completed_at);

CREATE INDEX idx_trmfp_group_id ON public.tournament_run_matches_fp USING btree (group_id);

CREATE INDEX idx_trmfp_run_id ON public.tournament_run_matches_fp USING btree (run_id);

CREATE INDEX idx_trmfp_stage ON public.tournament_run_matches_fp USING btree (stage);

CREATE INDEX idx_trmfp_starts_at ON public.tournament_run_matches_fp USING btree (starts_at);

CREATE INDEX idx_trp_run_id ON public.tournament_run_pairs USING btree (run_id);

CREATE INDEX loyalty_global_promos_active_idx ON public.loyalty_global_promos USING btree (is_active, starts_at, ends_at);

CREATE INDEX loyalty_user_promos_active_idx ON public.loyalty_user_promos USING btree (is_active, starts_at, ends_at);

CREATE INDEX loyalty_user_promos_membership_id_idx ON public.loyalty_user_promos USING btree (membership_id);

CREATE UNIQUE INDEX reward_redemptions_qr_token_unique ON public.reward_redemptions USING btree (qr_token) WHERE (qr_token IS NOT NULL);

CREATE INDEX reward_redemptions_status_idx ON public.reward_redemptions USING btree (status);

CREATE INDEX rewards_catalog_store_product_idx ON public.rewards_catalog USING btree (store_product_id);

CREATE INDEX store_order_items_order_idx ON public.store_order_items USING btree (order_id);

CREATE INDEX store_orders_created_at_idx ON public.store_orders USING btree (created_at DESC);

CREATE INDEX store_orders_order_type_idx ON public.store_orders USING btree (order_type);

CREATE INDEX store_orders_related_redemption_idx ON public.store_orders USING btree (related_redemption_id);

CREATE INDEX store_orders_status_idx ON public.store_orders USING btree (status);

CREATE INDEX store_orders_supplier_paid_idx ON public.store_orders USING btree (supplier_paid, supplier_paid_at);

CREATE INDEX store_orders_user_idx ON public.store_orders USING btree (user_id);

CREATE INDEX store_product_colors_product_idx ON public.store_product_colors USING btree (product_id);

CREATE INDEX store_product_sizes_product_idx ON public.store_product_sizes USING btree (product_id);

CREATE INDEX store_product_stock_product_idx ON public.store_product_stock USING btree (product_id);

CREATE INDEX store_products_active_idx ON public.store_products USING btree (is_active);

CREATE INDEX store_products_category_idx ON public.store_products USING btree (category_id);

CREATE INDEX store_products_category_sort_idx ON public.store_products USING btree (category_id, sort_order, created_at);

CREATE INDEX store_products_line_idx ON public.store_products USING btree (line_id);

CREATE INDEX store_promos_active_dates_idx ON public.store_promos USING btree (is_active, starts_at, ends_at);

CREATE INDEX store_supplier_batch_orders_batch_idx ON public.store_supplier_batch_orders USING btree (batch_id);

CREATE INDEX store_supplier_batch_orders_order_idx ON public.store_supplier_batch_orders USING btree (order_id);

CREATE INDEX tournament_run_matches_turn_id_idx ON public.tournament_run_matches USING btree (turn_id);

CREATE INDEX tournament_run_participants_run_id_idx ON public.tournament_run_participants USING btree (run_id);

CREATE INDEX tournament_run_turns_run_id_idx ON public.tournament_run_turns USING btree (run_id);

CREATE INDEX tournament_runs_tournament_id_idx ON public.tournament_runs USING btree (tournament_id);

CREATE INDEX tournaments_circuit_id_idx ON public.tournaments USING btree (circuit_id);

CREATE INDEX tournaments_start_at_idx ON public.tournaments USING btree (start_at);

CREATE INDEX tr_tournament_idx ON public.tournament_registrations USING btree (tournament_id);

CREATE INDEX tr_tournament_reserve_idx ON public.tournament_registrations USING btree (tournament_id, is_reserve, "position");

CREATE INDEX tr_user_idx ON public.tournament_registrations USING btree (user_id);

CREATE INDEX users_phone_idx ON public.users USING btree (phone);

ALTER TABLE ONLY public.circuit_points_rules
    ADD CONSTRAINT circuit_points_rules_circuit_id_fkey FOREIGN KEY (circuit_id) REFERENCES public.circuits(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.circuit_ranking_groups
    ADD CONSTRAINT circuit_ranking_groups_circuit_id_fkey FOREIGN KEY (circuit_id) REFERENCES public.circuits(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.circuit_results
    ADD CONSTRAINT circuit_results_circuit_id_fkey FOREIGN KEY (circuit_id) REFERENCES public.circuits(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.circuit_results
    ADD CONSTRAINT circuit_results_ranking_group_id_fkey FOREIGN KEY (ranking_group_id) REFERENCES public.circuit_ranking_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.communication_user_states
    ADD CONSTRAINT communication_user_states_communication_id_fkey FOREIGN KEY (communication_id) REFERENCES public.communications(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.communication_user_states
    ADD CONSTRAINT communication_user_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.loyalty_memberships
    ADD CONSTRAINT loyalty_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.loyalty_memberships(id);

ALTER TABLE ONLY public.loyalty_user_promos
    ADD CONSTRAINT loyalty_user_promos_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.loyalty_memberships(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.medical_certificates
    ADD CONSTRAINT medical_certificates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.loyalty_memberships(id);

ALTER TABLE ONLY public.reward_redemptions
    ADD CONSTRAINT reward_redemptions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.rewards_catalog(id);

ALTER TABLE ONLY public.rewards_catalog
    ADD CONSTRAINT rewards_catalog_store_product_id_fkey FOREIGN KEY (store_product_id) REFERENCES public.store_products(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.store_order_economics
    ADD CONSTRAINT store_order_economics_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT store_order_items_color_id_fkey FOREIGN KEY (color_id) REFERENCES public.store_product_colors(id);

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT store_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT store_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id);

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT store_order_items_size_id_fkey FOREIGN KEY (size_id) REFERENCES public.store_product_sizes(id);

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT store_orders_related_redemption_fkey FOREIGN KEY (related_redemption_id) REFERENCES public.reward_redemptions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT store_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.store_product_colors
    ADD CONSTRAINT store_product_colors_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_product_costs
    ADD CONSTRAINT store_product_costs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_product_sizes
    ADD CONSTRAINT store_product_sizes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_product_stock
    ADD CONSTRAINT store_product_stock_color_id_fkey FOREIGN KEY (color_id) REFERENCES public.store_product_colors(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_product_stock
    ADD CONSTRAINT store_product_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_product_stock
    ADD CONSTRAINT store_product_stock_size_id_fkey FOREIGN KEY (size_id) REFERENCES public.store_product_sizes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_products
    ADD CONSTRAINT store_products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.store_categories(id);

ALTER TABLE ONLY public.store_products
    ADD CONSTRAINT store_products_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.store_lines(id);

ALTER TABLE ONLY public.store_supplier_batch_orders
    ADD CONSTRAINT store_supplier_batch_orders_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.store_supplier_batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_supplier_batch_orders
    ADD CONSTRAINT store_supplier_batch_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.store_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_registrations
    ADD CONSTRAINT tournament_registrations_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_registrations
    ADD CONSTRAINT tournament_registrations_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tournament_run_bracket_slots
    ADD CONSTRAINT tournament_run_bracket_slots_pair_id_fkey FOREIGN KEY (pair_id) REFERENCES public.tournament_run_pairs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tournament_run_bracket_slots
    ADD CONSTRAINT tournament_run_bracket_slots_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.tournament_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_group_pairs
    ADD CONSTRAINT tournament_run_group_pairs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.tournament_run_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_group_pairs
    ADD CONSTRAINT tournament_run_group_pairs_pair_id_fkey FOREIGN KEY (pair_id) REFERENCES public.tournament_run_pairs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_groups
    ADD CONSTRAINT tournament_run_groups_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.tournament_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_matches_fp
    ADD CONSTRAINT tournament_run_matches_fp_away_pair_id_fkey FOREIGN KEY (away_pair_id) REFERENCES public.tournament_run_pairs(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.tournament_run_matches_fp
    ADD CONSTRAINT tournament_run_matches_fp_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.tournament_run_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_matches_fp
    ADD CONSTRAINT tournament_run_matches_fp_home_pair_id_fkey FOREIGN KEY (home_pair_id) REFERENCES public.tournament_run_pairs(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.tournament_run_matches_fp
    ADD CONSTRAINT tournament_run_matches_fp_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.tournament_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_matches
    ADD CONSTRAINT tournament_run_matches_p1_id_fkey FOREIGN KEY (p1_id) REFERENCES public.tournament_run_participants(id);

ALTER TABLE ONLY public.tournament_run_matches
    ADD CONSTRAINT tournament_run_matches_p2_id_fkey FOREIGN KEY (p2_id) REFERENCES public.tournament_run_participants(id);

ALTER TABLE ONLY public.tournament_run_matches
    ADD CONSTRAINT tournament_run_matches_p3_id_fkey FOREIGN KEY (p3_id) REFERENCES public.tournament_run_participants(id);

ALTER TABLE ONLY public.tournament_run_matches
    ADD CONSTRAINT tournament_run_matches_p4_id_fkey FOREIGN KEY (p4_id) REFERENCES public.tournament_run_participants(id);

ALTER TABLE ONLY public.tournament_run_matches
    ADD CONSTRAINT tournament_run_matches_turn_id_fkey FOREIGN KEY (turn_id) REFERENCES public.tournament_run_turns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_pairs
    ADD CONSTRAINT tournament_run_pairs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.tournament_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_participants
    ADD CONSTRAINT tournament_run_participants_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.tournament_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_run_turns
    ADD CONSTRAINT tournament_run_turns_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.tournament_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournament_runs
    ADD CONSTRAINT tournament_runs_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_circuit_id_fkey FOREIGN KEY (circuit_id) REFERENCES public.circuits(id) ON DELETE SET NULL;

CREATE FUNCTION public.set_staff_password(p_staff_id uuid, p_password text) RETURNS void
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $function$
begin
  update public.staff_users
  set
    password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
    updated_at = now()
  where id = p_staff_id;
end;
$function$;

ALTER FUNCTION public.set_staff_password(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_staff_password(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_staff_password(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.set_staff_password(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_password(uuid, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_staff_password(uuid, text) TO service_role;

CREATE FUNCTION public.verify_staff_login(p_email text, p_password text) RETURNS TABLE(id uuid, full_name text, email text, role text, is_active boolean)
    LANGUAGE sql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $function$
  select
    su.id,
    su.full_name,
    su.email,
    su.role,
    su.is_active
  from public.staff_users su
  where lower(su.email) = lower(trim(p_email))
    and su.is_active = true
    and su.password_hash = extensions.crypt(p_password, su.password_hash)
  limit 1;
$function$;

ALTER FUNCTION public.verify_staff_login(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_staff_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_staff_login(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.verify_staff_login(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_login(text, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.verify_staff_login(text, text) TO service_role;

CREATE POLICY "Public read tournament registrations" ON public.tournament_registrations FOR SELECT TO authenticated, anon USING (true);

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.circuit_points_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.circuit_ranking_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.circuit_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.circuits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communication_user_states ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_global_promos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_user_promos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.medical_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_can_view_rewards ON public.rewards_catalog FOR SELECT USING (true);

ALTER TABLE public.reward_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reward_point_ranges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rewards_catalog ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_order_economics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_product_colors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_product_costs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_product_sizes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_product_stock ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_promos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_special_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_supplier_batch_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_supplier_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_run_bracket_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_run_group_pairs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_run_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_run_matches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_run_matches_fp ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_run_pairs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_run_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_run_turns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournament_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_can_view_own_certificate ON public.medical_certificates FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY user_can_view_own_membership ON public.loyalty_memberships FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY user_can_view_own_redemptions ON public.reward_redemptions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.loyalty_memberships m
  WHERE ((m.id = reward_redemptions.membership_id) AND (m.user_id = auth.uid())))));

CREATE POLICY user_can_view_own_transactions ON public.loyalty_transactions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.loyalty_memberships m
  WHERE ((m.id = loyalty_transactions.membership_id) AND (m.user_id = auth.uid())))));

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

