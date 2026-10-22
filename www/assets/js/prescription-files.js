/* ==========================================================================
   PRESCRIPTION FILE ACCESS
   --------------------------------------------------------------------------
   Prescription images are medical records, so the "prescriptions" storage
   bucket is PRIVATE. A saved link (prescriptions.file_url) can no longer be
   opened directly; this helper swaps it for a temporary signed link that works
   for one hour and only for a signed-in staff member (or the owner).

   It accepts both kinds of saved value:
     - old style  https://.../storage/v1/object/public/prescriptions/<path>
     - plain path <user id>/<file name>
   ========================================================================== */
import { supabase } from './supabase-config.js';

const BUCKET = 'prescriptions';

export function prescriptionPathFromUrl(fileUrl) {
    if (!fileUrl) return null;
    const marker = `/${BUCKET}/`;
    const i = fileUrl.indexOf(marker);
    const raw = i >= 0 ? fileUrl.slice(i + marker.length) : fileUrl;
    try { return decodeURIComponent(raw.split('?')[0]); } catch { return raw.split('?')[0]; }
}

/** Returns a temporary link for the saved prescription file, or null. */
export async function getPrescriptionFileUrl(fileUrl, seconds = 3600) {
    const path = prescriptionPathFromUrl(fileUrl);
    if (!path) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
    if (error) {
        console.warn('Could not open prescription file:', error.message);
        return null;
    }
    return data?.signedUrl || null;
}
