-- =====================================================================
-- SHOP DATABASE  (depqlvzajukhhbiztnhj)  --  ERP "Prescriptions" button
-- ---------------------------------------------------------------------
-- The ERP top bar shows how many online prescriptions are waiting for
-- review. The ERP is a different Supabase project, so it asks the shop
-- database through this ONE function.
--
-- It returns only a number and a timestamp:
--     {"pending": 3, "latest": "2026-10-18T17:20:11+00:00"}
-- No patient names, phone numbers, images or ids ever leave the shop
-- database through it. The prescriptions table itself keeps its own
-- access rules untouched.
--
-- Additive and safe to re-run (create or replace).
-- =====================================================================

create or replace function public.pending_prescription_count()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'pending', count(*) filter (where status = 'pending'),
        'latest',  max(created_at) filter (where status = 'pending')
    )
    from public.prescriptions
$$;

revoke all on function public.pending_prescription_count() from public;
grant execute on function public.pending_prescription_count() to anon, authenticated;
