/* =========================================================================
   THIS WEEK'S OFFERS - shared logic (home, cart)
   Offers live in the SHOP database (table weekly_offers); products and prices
   stay in the ERP. Offer price = online price - discount %. 100% = free.
   ========================================================================= */
import { supabase, erp } from './supabase-config.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function offerLabel(offer) {
    const pct = Number(offer.discount_percent);
    return pct >= 100 ? 'FREE' : `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}% OFF`;
}

export function offerPrice(normalPrice, offer) {
    const pct = Number(offer.discount_percent);
    if (pct >= 100) return 0;
    return round2(Number(normalPrice) * (1 - pct / 100));
}

export function prettyCategory(cat) {
    return String(cat || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* "Spend ZMW 500 or more on Surgical Instruments" etc. */
export function describeConditions(offer) {
    const parts = [];
    const cat = offer.required_category ? prettyCategory(offer.required_category) : '';
    if (offer.min_purchase && cat) parts.push(`Spend ZMW ${Number(offer.min_purchase).toFixed(2)} or more on ${cat}`);
    else if (offer.min_purchase) parts.push(`Spend ZMW ${Number(offer.min_purchase).toFixed(2)} or more`);
    else if (cat) parts.push(`Buy any ${cat} item`);
    if (offer.first_purchase_only) parts.push('First order only');
    if (offer.max_qty_per_order) parts.push(`Limit ${offer.max_qty_per_order} per order`);
    return parts;
}

/* Offers that are switched on and inside their dates (RLS also enforces this). */
export async function fetchActiveOffers() {
    try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('weekly_offers')
            .select('*')
            .eq('is_active', true)
            .lte('starts_at', now)
            .gte('ends_at', now)
            .order('created_at', { ascending: false });
        if (error) { console.warn('Offers not available:', error.message); return []; }
        return data || [];
    } catch (e) {
        console.warn('Offers not available:', e);
        return [];
    }
}

/* Facts the conditions need: is this the customer's first order, and the category of each cart item. */
export async function getOfferContext(cartItems) {
    const ctx = { loggedIn: false, isFirstOrder: false, categoryById: new Map() };
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            ctx.loggedIn = true;
            const { count, error } = await supabase
                .from('orders').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
            ctx.isFirstOrder = !error && (count || 0) === 0;
        }
    } catch (e) { /* guest */ }
    try {
        const ids = [...new Set((cartItems || []).filter(i => !i.from_quote).map(i => String(i.id)))];
        if (ids.length) {
            const { data } = await erp.from('online_products').select('id, category').in('id', ids);
            (data || []).forEach(p => ctx.categoryById.set(String(p.id), String(p.category || '').toLowerCase()));
        }
    } catch (e) { /* categories are only needed for category offers */ }
    return ctx;
}

/* An offer with at least one condition is added to the bag BY ITSELF when the customer qualifies.
   An offer with no condition is just a normal discount the customer adds as any other product. */
export function offerHasConditions(o) {
    return !!(o.min_purchase || o.required_category || o.first_purchase_only);
}

/* '' when the conditions are met, otherwise the message to show. `others` = the other items in the bag. */
export function conditionHint(offer, others, ctx) {
    const cat = String(offer.required_category || '').toLowerCase();
    const qualifying = cat ? others.filter(i => ctx.categoryById.get(String(i.id)) === cat) : others;
    const qualSpend = qualifying.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
    if (offer.first_purchase_only && !ctx.isFirstOrder) {
        return ctx.loggedIn ? 'This offer is for first orders only.' : 'Sign in to use this first-order offer.';
    }
    if (cat && qualifying.length === 0) return `Add any ${prettyCategory(cat)} item to unlock "${offer.title}".`;
    if (offer.min_purchase && qualSpend < Number(offer.min_purchase)) {
        const need = Number(offer.min_purchase) - qualSpend;
        return `Spend ZMW ${need.toFixed(2)} more${cat ? ' on ' + prettyCategory(cat) : ''} to unlock "${offer.title}".`;
    }
    return '';
}

/* Offer products that should join the bag automatically.
   productInfo: Map(product id -> {id,name,price,in_stock,available_packs,image_url}) from the ERP
   dismissed:   Set of offer ids the customer removed from the bag on purpose */
export function computeAutoLines(cartItems, offers, ctx, productInfo, dismissed) {
    const real = (cartItems || []).filter(i => !i.from_quote);
    if (!real.length) return [];
    const out = [];
    for (const offer of (offers || [])) {
        if (!offerHasConditions(offer)) continue;
        if (dismissed && dismissed.has(String(offer.id))) continue;
        if (real.some(i => String(i.id) === String(offer.product_id))) continue;   // customer already has it
        const p = productInfo.get(String(offer.product_id));
        if (!p || !p.in_stock) continue;
        if (conditionHint(offer, real, ctx)) continue;
        const qty = Math.max(1, Math.min(Number(offer.max_qty_per_order) || 1, Number(p.available_packs) || 1));
        out.push({ id: p.id, name: p.name, price: Number(p.price), image: p.image_url || '', qty, auto_offer_id: offer.id });
    }
    return out;
}

/* Prices the whole cart with the offers.
   Returns:
     perItem[index] = { qty, offerQty, unitOffer, offer, hint }   (what to show in the cart)
     orderLines     = lines to save on the order (offer units and normal units are separate lines,
                      so price x qty always adds up to the subtotal)
     subtotal, savings, normalSubtotal                                                        */
export function priceCartWithOffers(cartItems, offers, ctx) {
    const items = cartItems || [];
    const perItem = items.map(() => ({ offerQty: 0, unitOffer: null, offer: null, hint: '' }));
    const normalSubtotal = items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);

    for (const offer of (offers || [])) {
        const idx = items.findIndex(i => !i.from_quote && String(i.id) === String(offer.product_id));
        if (idx === -1) continue;
        const line = items[idx];
        const others = items.filter((it, k) => k !== idx && !it.auto_offer_id);   // gifts never count towards a spend
        const hint = conditionHint(offer, others, ctx);

        if (hint) { perItem[idx].hint = hint; perItem[idx].offer = offer; continue; }

        const limit = offer.max_qty_per_order ? Number(offer.max_qty_per_order) : Infinity;
        perItem[idx].offerQty = Math.min(Number(line.qty), limit);
        perItem[idx].unitOffer = offerPrice(line.price, offer);
        perItem[idx].offer = offer;
    }

    const orderLines = [];
    let subtotal = 0;
    items.forEach((it, k) => {
        const p = perItem[k];
        const qty = Number(it.qty);
        const offerQty = p.offerQty || 0;
        if (offerQty > 0) {
            const suffix = Number(p.offer.discount_percent) >= 100 ? 'FREE offer' : `${Number(p.offer.discount_percent)}% offer`;
            orderLines.push({ ...it, name: `${it.name} (${suffix})`, price: p.unitOffer, qty: offerQty, offer_id: p.offer.id, offer_title: p.offer.title });
            subtotal += p.unitOffer * offerQty;
        }
        const rest = qty - offerQty;
        if (rest > 0) {
            orderLines.push({ ...it, qty: rest });
            subtotal += Number(it.price) * rest;
        }
    });
    subtotal = round2(subtotal);
    return { perItem, orderLines, subtotal, normalSubtotal: round2(normalSubtotal), savings: round2(normalSubtotal - subtotal) };
}
