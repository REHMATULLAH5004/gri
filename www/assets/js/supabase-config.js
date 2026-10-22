import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* ==========================================================================
   1. SUPABASE CONFIGURATION
   ========================================================================== */
export const supabase = createClient(
    "https://depqlvzajukhhbiztnhj.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcHFsdnphanVraGhiaXp0bmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzQ2MTgsImV4cCI6MjA4MDExMDYxOH0.W4R4XFbc8-a6OrX3sNLF4QPaP8pJH0A10o-m2WwqSN8"
);

/* ==========================================================================
   2. ERP DATABASE (products & stock only)
   --------------------------------------------------------------------------
   Product name, category, price and stock come from the ERP database through
   the read-only view "online_products". Customer logins, orders, prescriptions
   etc. stay in the shop database above.
   The key below is the ERP project's public (anon) key - it can only read the
   online_products view. Shop admin staff sign in with their ERP staff login
   (separate session key) to edit the online details of a product.
   ========================================================================== */
export const erp = createClient(
    "https://ruhpncvhvlqqxpgpzifx.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1aHBuY3ZodmxxcXhwZ3B6aWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDU4OTUsImV4cCI6MjA5NjY4MTg5NX0.nBmHLnS3e_JIduLmqqgYEBmVVIrOeI9cmmgUP2BQ65Q",
    { auth: { storageKey: 'gogriffins-erp-staff', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);
