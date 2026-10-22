-- =====================================================================
-- THIS WEEK'S OFFERS  -  run ONCE in the SHOP database
-- (Supabase project depqlvzajukhhbiztnhj -> SQL Editor).  Do NOT run it in the ERP.
-- Offer images are stored in a public storage bucket called "offer-images" (created below).
-- =====================================================================

create table if not exists public.weekly_offers (
    id                  uuid primary key default gen_random_uuid(),
    title               text not null,
    product_id          text not null,                 -- ERP product id (text so it never depends on the ERP)
    product_name        text,                          -- name copy, only for the admin list
    discount_percent    numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
    image_url           text,                          -- picture made for the offer (not the product picture)
    min_purchase        numeric(12,2) check (min_purchase is null or min_purchase > 0),
    first_purchase_only boolean not null default false,
    required_category   text,                          -- customer must also buy from this category
    max_qty_per_order   integer check (max_qty_per_order is null or max_qty_per_order > 0),
    starts_at           timestamptz not null,
    ends_at             timestamptz not null,
    is_active           boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    check (ends_at > starts_at)
);

create index if not exists weekly_offers_live_idx on public.weekly_offers (is_active, starts_at, ends_at);

alter table public.weekly_offers enable row level security;

drop policy if exists "weekly_offers public read live" on public.weekly_offers;
create policy "weekly_offers public read live" on public.weekly_offers
    for select to anon, authenticated
    using (is_active and now() between starts_at and ends_at);

drop policy if exists "weekly_offers admin read all" on public.weekly_offers;
create policy "weekly_offers admin read all" on public.weekly_offers
    for select to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "weekly_offers admin insert" on public.weekly_offers;
create policy "weekly_offers admin insert" on public.weekly_offers
    for insert to authenticated
    with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "weekly_offers admin update" on public.weekly_offers;
create policy "weekly_offers admin update" on public.weekly_offers
    for update to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
    with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "weekly_offers admin delete" on public.weekly_offers;
create policy "weekly_offers admin delete" on public.weekly_offers
    for delete to authenticated
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- Storage bucket for the offer pictures (public read, only admins can upload)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('offer-images', 'offer-images', true, 15728640, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 15728640,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'];

drop policy if exists "offer-images public read" on storage.objects;
create policy "offer-images public read" on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'offer-images');

drop policy if exists "offer-images admin insert" on storage.objects;
create policy "offer-images admin insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'offer-images' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "offer-images admin update" on storage.objects;
create policy "offer-images admin update" on storage.objects
    for update to authenticated
    using (bucket_id = 'offer-images' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "offer-images admin delete" on storage.objects;
create policy "offer-images admin delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'offer-images' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Make the API see the new table straight away
notify pgrst, 'reload schema';
