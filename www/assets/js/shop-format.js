/* ==========================================================================
   SHOP DISPLAY HELPERS  (shared by home, products, product-detail and cart)
   --------------------------------------------------------------------------
   - formatMoney(): whole kwacha when the price has no ngwee (shop prices are
     rounded to the nearest kwacha in the ERP's online_products view), and 2
     decimals only if a price really has ngwee.
   - packLabel(): "Pack of 30" / "Each", from the view's pack_size.
   - searchWords() / rankSearchResults(): shared product search rules.
   ========================================================================== */

export function formatMoney(value) {
    const v = Number(value) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** "Pack of 30" when a pack holds more than one unit, otherwise "Each". */
export function packLabel(product) {
    const n = Math.round(Number(product && product.pack_size) || 0);
    return n > 1 ? `Pack of ${n}` : 'Each';
}

export function packLabelHtml(product) {
    return `<span class="pack-size-label">${packLabel(product)}</span>`;
}

/** Split what the customer typed into safe search words (max 4). */
export function searchWords(raw) {
    return String(raw || '')
        .replace(/[%*,()\\"'`;:]/g, ' ')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(Boolean)
        .slice(0, 4);
}

/** Add one ilike filter per word (a product must match every word somewhere). */
export function applySearchFilter(query, raw) {
    searchWords(raw).forEach(w => {
        query = query.or(`name.ilike.%${w}%,brand.ilike.%${w}%,active_ingredient.ilike.%${w}%`);
    });
    return query;
}

/** Best matches first: name starts with the text, then a word in the name starts with it,
    then name contains it, then brand, then active ingredient. In-stock before sold out. */
export function rankSearchResults(rows, raw) {
    const q = String(raw || '').trim().toLowerCase();
    const score = p => {
        const name = String(p.name || '').toLowerCase();
        if (name.startsWith(q)) return 0;
        if (name.split(/[\s\-\/(]+/).some(w => w.startsWith(q))) return 1;
        if (name.includes(q)) return 2;
        if (String(p.brand || '').toLowerCase().includes(q)) return 3;
        return 4;
    };
    return [...(rows || [])].sort((a, b) =>
        score(a) - score(b) ||
        (b.in_stock === true) - (a.in_stock === true) ||
        String(a.name || '').localeCompare(String(b.name || '')));
}

/* small shared style for the pack label */
(function injectShopFormatStyle() {
    if (typeof document === 'undefined' || document.getElementById('shopFormatStyle')) return;
    const style = document.createElement('style');
    style.id = 'shopFormatStyle';
    style.textContent = `
        .pack-size-label { display:inline-block; margin-top:2px; padding:1px 8px; border-radius:10px;
            background:#f3e8e6; color:#7a2b25; font-size:0.72rem; font-weight:600; line-height:1.5; }
    `;
    document.head.appendChild(style);
})();
