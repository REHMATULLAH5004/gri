-- =====================================================================
-- ONLINE SHOP  <->  ERP   (products & stock come from the ERP)
-- ---------------------------------------------------------------------
-- ALREADY APPLIED to the ERP database on 2026-10-12. Kept here as a record
-- (and so it can be re-run safely: everything is create-if-not-exists /
-- create-or-replace).
--
-- ADDITIVE ONLY: 2 new tables, 1 function, 2 views. Nothing existing was
-- modified, renamed or dropped.
--
--   online_shop_settings    one row: the "original price" markup (60%)
--   online_product_details  the shop-only fields for an ERP product
--                           (everything starts hidden: show_online = false)
--   online_markup_percent() the same exponential markup curve the Retail
--                           page uses for ONLINE sales (company_settings)
--   online_products         PUBLIC read-only view the shop reads (anon key).
--                           Only products with show_online = true. Never
--                           exposes cost price.
--   online_admin_products   STAFF view for the shop admin page.
--
-- Prescription rule: a product requires a prescription automatically when its
-- shop category is 'prescription' (the old tick box is no longer used).
-- Real ERP stock = SUM(batches.total_qty), expired batches ignored.
-- The shop sells in PACKS: available_packs = floor(units / conversion_rate)
-- (bundles: limited by their component stock). in_stock = available_packs > 0.
-- Prices: sale_price = pack cost x (1 + online markup %), cost = batch that
-- sells first (earliest expiry with stock; latest batch if none in stock).
-- original_price = pack cost x 1.60 and is only kept above the sale price
-- when the ERP online price is lower than that.
-- =====================================================================

create table if not exists public.online_shop_settings (
    id                       smallint primary key default 1 check (id = 1),
    original_markup_percent  numeric not null default 60,
    updated_at               timestamptz not null default now()
);
insert into public.online_shop_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.online_product_details (
    product_id            uuid primary key references public.products(id) on delete cascade,
    show_online           boolean not null default false,
    image_url             text,
    description           text,
    parent_type           text,
    tag                   text,
    bundle                text,
    is_promotion          boolean not null default false,
    is_trending           boolean not null default false,
    featured_home         boolean not null default false,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    shop_category         text,
    shop_sub_category     text,
    requires_prescription boolean not null default false
);

create or replace function public.online_markup_percent(pack_cost numeric)
returns numeric
language sql stable
as $$
    select case
        when s.retail_online_markup_max_percent is null
          or s.retail_online_markup_min_percent is null
          or s.retail_online_markup_max_percent <= 0
          or s.retail_online_markup_min_percent <= 0
          or not (s.markup_cost_max > s.markup_cost_min)
        then coalesce(s.retail_online_markup_max_percent, 0)
        else s.retail_online_markup_max_percent
             * power( s.retail_online_markup_min_percent / s.retail_online_markup_max_percent,
                      (least(greatest(pack_cost, s.markup_cost_min), s.markup_cost_max) - s.markup_cost_min)
                      / (s.markup_cost_max - s.markup_cost_min) )
    end
    from public.company_settings s
    where s.id = 1
$$;

alter table public.online_shop_settings   enable row level security;
alter table public.online_product_details enable row level security;

create policy online_settings_staff_select on public.online_shop_settings
    for select to authenticated
    using (public.get_current_user_role() = any (array['Admin','Manager','Pharmacist']));
create policy online_settings_admin_update on public.online_shop_settings
    for update to authenticated
    using (public.get_current_user_role() = any (array['Admin','Manager']))
    with check (public.get_current_user_role() = any (array['Admin','Manager']));
create policy online_details_staff_select on public.online_product_details
    for select to authenticated
    using (public.get_current_user_role() = any (array['Admin','Manager','Pharmacist']));
create policy online_details_staff_insert on public.online_product_details
    for insert to authenticated
    with check (public.get_current_user_role() = any (array['Admin','Manager','Pharmacist']));
create policy online_details_staff_update on public.online_product_details
    for update to authenticated
    using (public.get_current_user_role() = any (array['Admin','Manager','Pharmacist']))
    with check (public.get_current_user_role() = any (array['Admin','Manager','Pharmacist']));

-- PUBLIC view (runs with the owner's rights, so anon can read it even though
-- anon cannot read products/batches directly)
create or replace view public.online_products as
select p.id, p.product_name as name, b.name as brand, g.name as active_ingredient,
       coalesce(nullif(d.shop_category,''), c.name) as category,
       coalesce(nullif(d.shop_sub_category,''), sc.name) as sub_category,
       d.parent_type, d.tag, d.bundle, d.image_url, d.description,
       d.is_promotion, d.is_trending, d.featured_home,
       coalesce(p.conversion_rate, 1) as pack_size,
       coalesce(st.units, 0)::bigint as stock_qty,
       (coalesce(st.packs, 0) > 0) as in_stock,
       pr.sale_price,
       case when pr.original_price > pr.sale_price then pr.original_price else pr.sale_price end as original_price,
       case when pr.original_price > pr.sale_price
            then round((pr.original_price - pr.sale_price) / pr.original_price * 100) else 0 end as discount_pct,
       pr.sale_price as price,
       coalesce(st.units, 0)::integer as stock_quantity,
       true as active,
       d.created_at,
       (lower(coalesce(d.shop_category,'')) = 'prescription') as requires_prescription,
       coalesce(st.packs, 0)::integer as available_packs
from public.products p
join public.online_product_details d on d.product_id = p.id and d.show_online
left join public.brands        b  on b.id  = p.brand_id
left join public.generic_names g  on g.id  = p.generic_name_id
left join public.categories    c  on c.id  = p.category_id
left join public.sub_categories sc on sc.id = p.sub_category_id
left join lateral (
  select
    case when p.is_bundle then
      (select coalesce(min(floor(coalesce(cs.units,0) / nullif(bc.qty_per_bundle,0))),0)
         from public.bundle_components bc
         left join lateral (select sum(bt.total_qty) as units from public.batches bt
                             where bt.product_id = bc.component_product_id and bt.total_qty > 0
                               and (bt.expiry_date is null or bt.expiry_date >= current_date)) cs on true
        where bc.bundle_product_id = p.id)
    else (select coalesce(sum(bt.total_qty),0) from public.batches bt
           where bt.product_id = p.id and bt.total_qty > 0
             and (bt.expiry_date is null or bt.expiry_date >= current_date))
    end as units,
    case when p.is_bundle then
      (select coalesce(min(floor(coalesce(cs.units,0) / nullif(bc.qty_per_bundle,0))),0)
         from public.bundle_components bc
         left join lateral (select sum(bt.total_qty) as units from public.batches bt
                             where bt.product_id = bc.component_product_id and bt.total_qty > 0
                               and (bt.expiry_date is null or bt.expiry_date >= current_date)) cs on true
        where bc.bundle_product_id = p.id)
    else floor((select coalesce(sum(bt.total_qty),0) from public.batches bt
                 where bt.product_id = p.id and bt.total_qty > 0
                   and (bt.expiry_date is null or bt.expiry_date >= current_date))
               / greatest(coalesce(p.conversion_rate,1),1))
    end as packs
) st on true
left join lateral (
  select bt.cost_price from public.batches bt where bt.product_id = p.id
  order by (bt.total_qty > 0 and (bt.expiry_date is null or bt.expiry_date >= current_date)) desc,
           bt.expiry_date asc nulls last, bt.created_at desc
  limit 1
) cb on true
cross join lateral (
  select round(coalesce(cb.cost_price,0) * coalesce(p.conversion_rate,1)
               * (1 + public.online_markup_percent(coalesce(cb.cost_price,0) * coalesce(p.conversion_rate,1)) / 100.0), 2) as sale_price,
         round(coalesce(cb.cost_price,0) * coalesce(p.conversion_rate,1)
               * (1 + (select original_markup_percent from public.online_shop_settings where id = 1) / 100.0), 2) as original_price
) pr;

-- STAFF view for the shop admin page (caller's own ERP permissions apply)
create or replace view public.online_admin_products with (security_invoker = true) as
select p.id, p.sku, p.product_name as name, b.name as brand, g.name as active_ingredient,
       c.name as category, sc.name as sub_category,
       coalesce(d.show_online, false) as show_online,
       d.image_url, d.description, d.parent_type, d.tag, d.bundle,
       coalesce(d.is_promotion, false) as is_promotion,
       coalesce(d.is_trending, false) as is_trending,
       coalesce(d.featured_home, false) as featured_home,
       (d.product_id is null) as needs_online_details,
       coalesce(p.total_stock, 0) as erp_stock,
       d.shop_category, d.shop_sub_category,
       (lower(coalesce(d.shop_category,'')) = 'prescription') as requires_prescription,
       pr.sale_price,
       case when pr.original_price > pr.sale_price then pr.original_price else pr.sale_price end as original_price,
       coalesce(st.qty, 0) > 0 as in_stock
from public.products p
left join public.online_product_details d on d.product_id = p.id
left join public.brands        b  on b.id  = p.brand_id
left join public.generic_names g  on g.id  = p.generic_name_id
left join public.categories    c  on c.id  = p.category_id
left join public.sub_categories sc on sc.id = p.sub_category_id
left join lateral (select sum(bt.total_qty) as qty from public.batches bt
                    where bt.product_id = p.id and bt.total_qty > 0
                      and (bt.expiry_date is null or bt.expiry_date >= current_date)) st on true
left join lateral (select bt.cost_price from public.batches bt where bt.product_id = p.id
                    order by (bt.total_qty > 0 and (bt.expiry_date is null or bt.expiry_date >= current_date)) desc,
                             bt.expiry_date asc nulls last, bt.created_at desc limit 1) cb on true
cross join lateral (
  select round(coalesce(cb.cost_price,0) * coalesce(p.conversion_rate,1)
               * (1 + public.online_markup_percent(coalesce(cb.cost_price,0) * coalesce(p.conversion_rate,1)) / 100.0), 2) as sale_price,
         round(coalesce(cb.cost_price,0) * coalesce(p.conversion_rate,1)
               * (1 + (select original_markup_percent from public.online_shop_settings where id = 1) / 100.0), 2) as original_price
) pr;

-- PUBLIC menu view: every parent type / category / sub category that has at
-- least one live product (the shop's navigation reads this)
create or replace view public.online_categories as
select distinct parent_type, category, sub_category from public.online_products;

-- permissions: the public (anon) key can ONLY read the online_products view
revoke all on public.online_shop_settings   from anon;
revoke all on public.online_product_details from anon;
revoke all on public.online_admin_products  from anon;
revoke all on public.online_products        from anon, authenticated;
revoke all on public.online_admin_products  from authenticated;
grant select on public.online_products       to anon, authenticated;
grant select on public.online_admin_products to authenticated;
grant select on public.online_categories     to anon, authenticated;
