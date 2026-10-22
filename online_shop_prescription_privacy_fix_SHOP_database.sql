-- =====================================================================
-- SHOP DATABASE (depqlvzajukhhbiztnhj)  --  PRESCRIPTION PRIVACY FIX
-- ---------------------------------------------------------------------
-- Problems found on 18 Oct 2026:
--  1. public.prescriptions has a policy "Admins have full access" with
--     roles = public and USING (true). Despite the name, it lets ANYONE
--     (even a visitor who is not signed in) read, edit and delete ALL
--     prescription rows (names, file links, quotes).
--  2. storage policy "Public Access" lets anyone LIST every file in the
--     prescriptions bucket.
--  3. storage policy "Admin full access to prescriptions" applies to every
--     signed-in user (it only checks the bucket), so any member can read,
--     replace or delete anyone's prescription files.
--
-- This script fixes all three WITHOUT changing how the site works today
-- (prescription links keep opening because the bucket stays public; that is
-- step 2, done later together with a small code change).
--
-- Staff who can see ALL prescriptions: profiles.role in ('admin','staff').
-- Members only ever see their own.
--
-- RUN IT IN: Supabase dashboard of the SHOP project > SQL Editor.
-- AFTER RUNNING: test (a) a member uploads and sees their own quote,
--                (b) the admin page Prescriptions tab still lists them.
-- =====================================================================

begin;

-- Helper: is the signed-in user shop staff? (SECURITY DEFINER so the check
-- itself is not blocked by the profiles table's own rules.)
create or replace function public.is_shop_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role in ('admin', 'staff')
    )
$$;
revoke all on function public.is_shop_staff() from public;
grant execute on function public.is_shop_staff() to authenticated;

-- 1) Table rules ------------------------------------------------------
drop policy if exists "Admins have full access" on public.prescriptions;

create policy "Staff full access to prescriptions"
    on public.prescriptions
    for all
    to authenticated
    using (public.is_shop_staff())
    with check (public.is_shop_staff());

-- the two existing member rules stay as they are, but only for signed-in users
drop policy if exists "Users can insert own prescriptions" on public.prescriptions;
drop policy if exists "Users can view own prescriptions"   on public.prescriptions;

create policy "Users can insert own prescriptions"
    on public.prescriptions for insert to authenticated
    with check (auth.uid() = user_id);

create policy "Users can view own prescriptions"
    on public.prescriptions for select to authenticated
    using (auth.uid() = user_id);

-- 2) Storage rules (bucket: prescriptions) ----------------------------
drop policy if exists "Public Access"                          on storage.objects;
drop policy if exists "Admin full access to prescriptions"     on storage.objects;
drop policy if exists "Allow authenticated uploads"            on storage.objects;
drop policy if exists "Allow users to view own files"          on storage.objects;

-- members may upload only into their own folder (<their user id>/...)
create policy "prescriptions: members upload to own folder"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'prescriptions'
                and (storage.foldername(name))[1] = auth.uid()::text);

-- members may list/read only their own files
create policy "prescriptions: members read own files"
    on storage.objects for select to authenticated
    using (bucket_id = 'prescriptions'
           and (storage.foldername(name))[1] = auth.uid()::text);

-- staff may list/read/change/delete all prescription files
create policy "prescriptions: staff full access"
    on storage.objects for all to authenticated
    using (bucket_id = 'prescriptions' and public.is_shop_staff())
    with check (bucket_id = 'prescriptions' and public.is_shop_staff());

commit;

-- =====================================================================
-- STEP 2 (LATER, needs a small code change -- do not run yet):
--   update storage.buckets set public = false where id = 'prescriptions';
-- Then the shop and admin pages must open files with signed links
-- (createSignedUrl) instead of getPublicUrl, otherwise old links stop
-- working. Ask Claude to make that change first.
-- =====================================================================
