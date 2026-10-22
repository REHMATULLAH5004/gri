import { supabase } from '../../assets/js/supabase-config.js';
import { syncCartCount, addToCart, openAuthModal, getFreshStock, notEnoughStockMessage } from '../home/index.js';
import { erp } from '../../assets/js/supabase-config.js';
import { formatMoney, packLabelHtml } from '../../assets/js/shop-format.js';
import { fetchActiveOffers, getOfferContext, priceCartWithOffers, computeAutoLines, offerLabel } from '../../assets/js/offers.js';

window.addToCart = addToCart;
window.openAuthModal = openAuthModal;

function safeShowToast(message, type = 'info', title = '', duration = 3000) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type, title, duration);
    } else {
        console.log(`[${type}] ${title || type}: ${message}`);
        alert(message);
    }
}

let currentUser = null;
let cartItems = [];
let pricing = null;   // cart priced with This Week's Offers
let allItems = [];    // stored cart items + offer items added automatically

const dismissKey = () => `offer_dismissed_${currentUser ? currentUser.id : 'guest'}`;
function getDismissed() { try { return new Set(JSON.parse(localStorage.getItem(dismissKey()) || '[]')); } catch (e) { return new Set(); } }
function saveDismissed(set) { try { localStorage.setItem(dismissKey(), JSON.stringify([...set])); } catch (e) { /* ignore */ } }
let deliveryDistance = 0;
let deliveryCoordinates = null;
let map = null;
let marker = null;

const STORE_COORDINATES = { lat: -15.4167, lng: 28.2833 };
const FREE_DELIVERY_THRESHOLD = 500;
const OUTSOURCED_DELIVERY_FEE = 100;

function calculateDeliveryCharge(distanceKm, subtotal) {
    if (distanceKm > 20) return OUTSOURCED_DELIVERY_FEE;
    if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
    if (distanceKm <= 5) return distanceKm * 6;
    if (distanceKm <= 10) return distanceKm * 5;
    return distanceKm * 4;
}

function isOutsourcedDelivery(distanceKm) {
    return distanceKm > 20;
}

async function updateOrderSummary() {
    const subtotal = pricing ? pricing.subtotal : cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const savingsRow = document.getElementById('offerSavingsRow');
    const savingsEl = document.getElementById('offerSavings');
    if (savingsRow && savingsEl) {
        const sv = pricing ? pricing.savings : 0;
        savingsRow.style.display = sv > 0 ? 'flex' : 'none';
        savingsEl.textContent = `- ZMW ${sv.toFixed(2)}`;
    }
    const subtotalEl = document.getElementById('subtotal');
    const deliveryChargeEl = document.getElementById('deliveryCharge');
    const totalAmountEl = document.getElementById('totalAmount');
    const displayKmEl = document.getElementById('displayKm');
    const deliveryNoteEl = document.getElementById('deliveryNote');
    const outsourcedNoteEl = document.getElementById('outsourcedNote');
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    const freeDeliveryNote = document.getElementById('freeDeliveryNote');
    
    if (subtotalEl) subtotalEl.textContent = `ZMW ${subtotal.toFixed(2)}`;
    
    let deliveryCharge = 0;
    let isOutsourced = false;
    
    if (deliveryDistance > 0) {
        if (displayKmEl) displayKmEl.textContent = deliveryDistance.toFixed(1);
        deliveryCharge = calculateDeliveryCharge(deliveryDistance, subtotal);
        isOutsourced = isOutsourcedDelivery(deliveryDistance);
        
        if (isOutsourced) {
            if (outsourcedNoteEl) outsourcedNoteEl.classList.remove('hidden');
            if (freeDeliveryNote) freeDeliveryNote.classList.add('hidden');
            if (deliveryChargeEl) deliveryChargeEl.textContent = `ZMW ${deliveryCharge.toFixed(2)}`;
            if (deliveryNoteEl) deliveryNoteEl.innerHTML = '🚚 Outsourced Delivery - Partner courier will contact you';
            if (placeOrderBtn) {
                placeOrderBtn.textContent = 'Confirm & Place Order';
                placeOrderBtn.disabled = false;
            }
        } else {
            if (outsourcedNoteEl) outsourcedNoteEl.classList.add('hidden');
            if (deliveryChargeEl) deliveryChargeEl.textContent = `ZMW ${deliveryCharge.toFixed(2)}`;
            
            if (subtotal >= FREE_DELIVERY_THRESHOLD) {
                deliveryNoteEl.innerHTML = '🎉 Free Delivery! Your order qualifies for free delivery.';
                if (freeDeliveryNote) freeDeliveryNote.classList.remove('hidden');
            } else {
                if (freeDeliveryNote) freeDeliveryNote.classList.add('hidden');
                if (deliveryDistance <= 5) {
                    deliveryNoteEl.innerHTML = `🚚 Delivery: K6 per km (${deliveryDistance.toFixed(1)}km × K6 = K${deliveryCharge.toFixed(2)})`;
                } else if (deliveryDistance <= 10) {
                    deliveryNoteEl.innerHTML = `🚚 Delivery: K5 per km (${deliveryDistance.toFixed(1)}km × K5 = K${deliveryCharge.toFixed(2)})`;
                } else {
                    deliveryNoteEl.innerHTML = `🚚 Delivery: K4 per km (${deliveryDistance.toFixed(1)}km × K4 = K${deliveryCharge.toFixed(2)})`;
                }
            }
            if (placeOrderBtn) {
                placeOrderBtn.textContent = 'Confirm & Place Order';
                placeOrderBtn.disabled = false;
            }
        }
    } else {
        if (outsourcedNoteEl) outsourcedNoteEl.classList.add('hidden');
        if (freeDeliveryNote) freeDeliveryNote.classList.add('hidden');
        if (deliveryChargeEl) deliveryChargeEl.textContent = `ZMW 0.00`;
        if (deliveryNoteEl) deliveryNoteEl.innerHTML = '📍 Please select your delivery location on the map';
        if (placeOrderBtn) placeOrderBtn.disabled = true;
    }
    
    const grandTotal = subtotal + deliveryCharge;
    if (totalAmountEl) totalAmountEl.textContent = `ZMW ${grandTotal.toFixed(2)}`;
}

function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    
    map = L.map('map').setView([STORE_COORDINATES.lat, STORE_COORDINATES.lng], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> & CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);
    
    L.marker([STORE_COORDINATES.lat, STORE_COORDINATES.lng])
        .addTo(map)
        .bindPopup('<b>Griffins Medicals</b><br>Our Pharmacy')
        .openPopup();
    
    L.circle([STORE_COORDINATES.lat, STORE_COORDINATES.lng], {
        radius: 20000,
        color: '#10b981',
        fillColor: '#d1fae5',
        fillOpacity: 0.1,
        weight: 2
    }).addTo(map);
    
    L.circle([STORE_COORDINATES.lat, STORE_COORDINATES.lng], {
        radius: 20000,
        color: '#f59e0b',
        fill: false,
        weight: 2,
        dashArray: '5, 10'
    }).addTo(map);
    
    map.on('click', handleMapClick);
    
    const searchBtn = document.getElementById('searchLocBtn');
    const searchInput = document.getElementById('mapSearchInput');
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => searchLocation(searchInput.value));
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchLocation(searchInput.value);
        });
    }
    
    const locateBtn = document.getElementById('locateBtn');
    if (locateBtn) locateBtn.addEventListener('click', getCurrentLocation);
}

async function searchLocation(query) {
    if (!query.trim()) return;
    
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Lusaka, Zambia&limit=5`);
        const data = await response.json();
        
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            map.setView([lat, lng], 15);
            updateDeliveryLocation(lat, lng);
        } else {
            safeShowToast('Location not found. Please try a different search term.', 'warning');
        }
    } catch (error) {
        console.error('Search error:', error);
        safeShowToast('Error searching location', 'error');
    }
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 15);
                updateDeliveryLocation(latitude, longitude);
            },
            (error) => {
                console.error('Geolocation error:', error);
                safeShowToast('Unable to get your location. Please allow location access or search manually.', 'warning');
            }
        );
    } else {
        safeShowToast('Geolocation is not supported by your browser', 'warning');
    }
}

function handleMapClick(e) {
    const { lat, lng } = e.latlng;
    updateDeliveryLocation(lat, lng);
}

function updateDeliveryLocation(lat, lng) {
    deliveryCoordinates = { lat, lng };
    
    if (marker) {
        marker.setLatLng([lat, lng]);
    } else {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            updateDeliveryLocation(pos.lat, pos.lng);
        });
    }
    
    marker.bindPopup('Your Delivery Location').openPopup();
    
    const distance = calculateDistance(STORE_COORDINATES.lat, STORE_COORDINATES.lng, lat, lng);
    deliveryDistance = distance;
    
    const addressField = document.getElementById('shipAddress');
    if (addressField) {
        reverseGeocode(lat, lng).then(areaName => {
            addressField.value = areaName || `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
        }).catch(() => {
            addressField.value = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
        });
    }
    
    updateOrderSummary();
}

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        if (data && data.display_name) {
            const parts = data.display_name.split(',');
            return parts.length >= 2 ? parts[0] + ', ' + parts[1] : parts[0];
        }
        return null;
    } catch (error) {
        console.error('Reverse geocode error:', error);
        return null;
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function loadCart() {
    const user = await getCurrentUser();
    const cartKey = user ? `cart_${user.id}` : 'guest_cart';
    const savedCart = localStorage.getItem(cartKey);
    
    cartItems = savedCart ? JSON.parse(savedCart) : [];
    await refreshPricing();
    renderCart();
    updateCartCount();
}

function getCurrentUser() {
    return new Promise(async (resolve) => {
        const { data: { user } } = await supabase.auth.getUser();
        resolve(user);
        currentUser = user;
    });
}

async function refreshPricing() {
    if (!cartItems.length) { pricing = null; allItems = []; return; }
    allItems = [...cartItems];
    try {
        const [offers, ctx] = await Promise.all([fetchActiveOffers(), getOfferContext(cartItems)]);
        // offer products that join the bag by themselves when the customer qualifies
        let autoLines = [];
        const wanted = offers.filter(o => !cartItems.some(i => String(i.id) === String(o.product_id)));
        if (wanted.length) {
            const { data } = await erp.from('online_products')
                .select('id, name, price, in_stock, available_packs, image_url')
                .in('id', [...new Set(wanted.map(o => String(o.product_id)))]);
            const info = new Map((data || []).map(p => [String(p.id), p]));
            autoLines = computeAutoLines(cartItems, offers, ctx, info, getDismissed());
        }
        allItems = [...cartItems, ...autoLines];
        pricing = priceCartWithOffers(allItems, offers, ctx);
    } catch (e) {
        console.warn('Offer pricing skipped:', e);
        allItems = [...cartItems];
        pricing = null;
    }
}

window.removeAutoOffer = async (offerId) => {
    await getCurrentUser();
    const set = getDismissed();
    set.add(String(offerId));
    saveDismissed(set);
    await refreshPricing();
    renderCart();
};

function renderCart() {
    const cartContainer = document.getElementById('cartList');
    if (!cartContainer) return;
    
    if (cartItems.length === 0) {
        cartContainer.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <p>Your cart is empty</p>
                <a href="../home/index.html" class="primary-btn">Continue Shopping</a>
            </div>
        `;
        updateOrderSummary();
        return;
    }
    
    const rows = allItems.length ? allItems : cartItems;
    cartContainer.innerHTML = rows.map((item, index) => {
        const isAuto = !!item.auto_offer_id;
        const productImage = (item.image && item.image.trim() !== '') ? item.image : 'https://placehold.co/400x400/f0f0f0/999999?text=No+Image';
        const po = pricing && pricing.perItem[index] ? pricing.perItem[index] : null;
        const offerQty = po ? po.offerQty : 0;
        const lineTotal = offerQty > 0
            ? po.unitOffer * offerQty + item.price * (item.qty - offerQty)
            : item.price * item.qty;
        const packHtml = item.pack_size ? `<p class="pack-size-row">${packLabelHtml(item)}</p>` : '';
        let priceHtml = `<p class="item-price">ZMW ${formatMoney(item.price)}</p>${packHtml}`;
        if (offerQty > 0) {
            priceHtml = `<p class="item-price"><s class="offer-old">ZMW ${formatMoney(item.price)}</s> <span class="offer-new">${po.unitOffer === 0 ? 'FREE' : 'ZMW ' + po.unitOffer.toFixed(2)}</span></p>
                <p class="offer-tag">🎁 ${isAuto ? 'Added for you - ' : ''}This Week's Offer: ${escapeHtml(offerLabel(po.offer))}${offerQty < item.qty ? ` (applies to ${offerQty} unit${offerQty > 1 ? 's' : ''}, the rest at normal price)` : ''}</p>`;
        } else if (po && po.hint) {
            priceHtml += `<p class="offer-hint">🎁 ${escapeHtml(po.hint)}</p>`;
        }
        
        if (offerQty > 0 && packHtml) priceHtml += packHtml;

        return `
            <div class="cart-item">
                <div class="cart-item-img">
                    <img src="${productImage}" alt="${escapeHtml(item.name)}" onerror="this.src='https://placehold.co/400x400/f0f0f0/999999?text=No+Image'">
                </div>
                <div class="cart-item-details">
                    <h4>${escapeHtml(item.name)}</h4>
                    ${priceHtml}
                </div>
                <div class="cart-item-actions">
                    ${isAuto ? `<div class="qty-controls"><span>${item.qty}</span></div>
                    <button class="remove-btn" onclick="removeAutoOffer('${item.auto_offer_id}')">
                        <i class="fas fa-trash"></i> Remove
                    </button>` : `<div class="qty-controls">
                        <button onclick="updateQuantity(${index}, -1)">-</button>
                        <span>${item.qty}</span>
                        <button onclick="updateQuantity(${index}, 1)">+</button>
                    </div>
                    <button class="remove-btn" onclick="removeItem(${index})">
                        <i class="fas fa-trash"></i> Remove
                    </button>`}
                </div>
                <div class="cart-item-total">${lineTotal === 0 ? 'FREE' : 'ZMW ' + lineTotal.toFixed(2)}</div>
            </div>
        `;
    }).join('');
    
    updateOrderSummary();
}

window.updateQuantity = async (index, delta) => {
    if (!cartItems[index]) return;
    
    const newQty = cartItems[index].qty + delta;

    // Adding more? make sure we really have that many (customers never see numbers)
    if (delta > 0 && !cartItems[index].from_quote) {
        const fresh = await getFreshStock(cartItems[index].id);
        if (!fresh || !fresh.in_stock) {
            safeShowToast(`"${cartItems[index].name}" is out of stock`, 'warning', 'Out of Stock');
            return;
        }
        if (newQty > (fresh.available_packs || 0)) {
            safeShowToast(notEnoughStockMessage(cartItems[index].name), 'warning', 'Not Enough Stock');
            return;
        }
    }

    if (newQty <= 0) {
        cartItems.splice(index, 1);
    } else {
        cartItems[index].qty = newQty;
    }
    
    const user = await getCurrentUser();
    const cartKey = user ? `cart_${user.id}` : 'guest_cart';
    localStorage.setItem(cartKey, JSON.stringify(cartItems));
    
    await refreshPricing();
    renderCart();
    updateCartCount();
};

window.removeItem = async (index) => {
    cartItems.splice(index, 1);
    const user = await getCurrentUser();
    const cartKey = user ? `cart_${user.id}` : 'guest_cart';
    localStorage.setItem(cartKey, JSON.stringify(cartItems));
    await refreshPricing();
    renderCart();
    updateCartCount();
};

async function updateCartCount() {
    if (typeof syncCartCount === 'function') {
        await syncCartCount();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// SIMPLIFIED ORDER CONFIRMATION - Just a toast notification
function showOrderSuccessToast(orderDetails) {
    const isOutsourced = orderDetails.isOutsourced;
    const total = orderDetails.total;
    
    if (isOutsourced) {
        safeShowToast(
            `✅ Order Placed!\n\nOrder #${orderDetails.orderNumber}\nTotal: ZMW ${total.toFixed(2)}\n\n🚚 Delivery will be handled by our partner courier. We will contact you within 24 hours.\n\nThank you for shopping with Griffins Medicals!`,
            'success', 
            'Order Confirmed', 
            6000
        );
    } else {
        safeShowToast(
            `✅ Order Placed Successfully!\n\nOrder #${orderDetails.orderNumber}\nTotal: ZMW ${total.toFixed(2)}\n\nThank you for shopping with Griffins Medicals! ❤️`,
            'success', 
            'Order Confirmed', 
            5000
        );
    }
}

// PLACE ORDER - Simplified
/* Re-checks the bag against the ERP right before the order is placed:
   - items must still be on sale and in stock, and not exceed what we have
   - prices are refreshed from the ERP online price
   Quoted items (from_quote) keep the pharmacist's quoted price and are not re-checked. */
async function validateCartAgainstErp() {
    const problems = [];
    const ids = [...new Set(cartItems.filter(i => !i.from_quote).map(i => String(i.id)))];
    if (ids.length === 0) return problems;

    const { data, error } = await erp
        .from('online_products')
        .select('id, name, price, in_stock, available_packs')
        .in('id', ids);
    if (error) {
        problems.push('We could not check availability right now. Please try again in a moment.');
        return problems;
    }
    const byId = new Map((data || []).map(p => [String(p.id), p]));

    for (const item of cartItems) {
        if (item.from_quote) continue;
        const p = byId.get(String(item.id));
        if (!p || !p.in_stock) {
            problems.push(`"${item.name}" is out of stock or no longer available. Please remove it from your bag.`);
            continue;
        }
        if ((item.qty || 0) > (p.available_packs || 0)) {
            problems.push(notEnoughStockMessage(item.name));
            continue;
        }
        item.price = Number(p.price);   // always the current ERP online price
    }
    return problems;
}

async function placeOrder() {
    const name = document.getElementById('shipName')?.value.trim();
    const phone = document.getElementById('shipPhone')?.value.trim();
    const address = document.getElementById('shipAddress')?.value.trim();
    const paymentMethod = document.getElementById('paymentMethod')?.value;
    
    if (cartItems.length === 0) {
        safeShowToast('Your cart is empty', 'warning', 'Empty Cart');
        return;
    }
    
    if (!name) {
        safeShowToast('Please enter your full name', 'warning', 'Missing Information');
        return;
    }
    
    if (!phone) {
        safeShowToast('Please enter your WhatsApp number', 'warning', 'Missing Information');
        return;
    }
    
    if (!deliveryCoordinates) {
        safeShowToast('Please select your delivery location on the map', 'warning', 'Location Required');
        return;
    }
    
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    const originalBtnText = placeOrderBtn?.innerHTML;
    if (placeOrderBtn) {
        placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        placeOrderBtn.disabled = true;
    }
    
    const stockProblems = await validateCartAgainstErp();
    if (stockProblems.length > 0) {
        safeShowToast(stockProblems.join('\n'), 'warning', 'Please Review Your Bag', 6000);
        if (placeOrderBtn) {
            placeOrderBtn.innerHTML = originalBtnText;
            placeOrderBtn.disabled = false;
        }
        await refreshPricing();
        renderCart();
        return;
    }

    // Re-check This Week's Offers with fresh data right before the order is saved
    await refreshPricing();
    const orderLines = pricing ? pricing.orderLines : cartItems;
    const subtotal = pricing ? pricing.subtotal : cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const deliveryCharge = calculateDeliveryCharge(deliveryDistance, subtotal);
    const isOutsourced = isOutsourcedDelivery(deliveryDistance);
    const user = await getCurrentUser();
    
    const orderData = {
        user_id: user?.id || null,
        customer_name: name,
        customer_phone: phone,
        delivery_address: address,
        delivery_lat: deliveryCoordinates.lat,
        delivery_lng: deliveryCoordinates.lng,
        delivery_distance_km: deliveryDistance,
        delivery_charge: deliveryCharge,
        is_outsourced_delivery: isOutsourced,
        subtotal: subtotal,
        total: subtotal + deliveryCharge,
        payment_method: paymentMethod,
        payment_status: 'pending',
        order_status: isOutsourced ? 'awaiting_delivery_confirmation' : 'pending',
        items: orderLines.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            qty: item.qty,
            image: item.image,
            ...(item.offer_id ? { offer_id: item.offer_id, offer_title: item.offer_title } : {})
        })),
        created_at: new Date().toISOString()
    };
    
    try {
        const { data, error } = await supabase.from('orders').insert(orderData).select();
        if (error) throw error;
        
        const newOrderId = data?.[0]?.id;
        const orderNumber = newOrderId ? newOrderId.slice(0, 8).toUpperCase() : 'Your order';
        
        // Clear cart
        const cartKey = user ? `cart_${user.id}` : 'guest_cart';
        localStorage.removeItem(cartKey);
        cartItems = [];
        allItems = [];
        pricing = null;
        saveDismissed(new Set());
        
        if (typeof syncCartCount === 'function') {
            await syncCartCount();
        }
        
        renderCart();
        
        if (placeOrderBtn) {
            placeOrderBtn.innerHTML = originalBtnText;
            placeOrderBtn.disabled = false;
        }
        
        // Show success toast
        showOrderSuccessToast({
            orderNumber,
            total: subtotal + deliveryCharge,
            isOutsourced,
            deliveryDistance
        });
        
        // Smooth redirect to home after 3 seconds
        setTimeout(() => {
            window.location.href = '../home/index.html';
        }, 3500);
        
    } catch (error) {
        console.error('Order error:', error);
        safeShowToast('Error placing order. Please try again.', 'error', 'Order Failed');
        
        if (placeOrderBtn) {
            placeOrderBtn.innerHTML = originalBtnText;
            placeOrderBtn.disabled = false;
        }
    }
}

// INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {
    await loadCart();
    initMap();
    
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', placeOrder);
    
    const authLink = document.getElementById('authLink');
    const authModal = document.getElementById('authModal');
    const closeAuthModal = document.getElementById('closeAuthModal');
    
    if (authLink && authModal) {
        authLink.addEventListener('click', () => {
            if (typeof openAuthModal === 'function') {
                openAuthModal();
            } else if (authModal) {
                authModal.style.display = 'flex';
            }
        });
    }
    
    if (closeAuthModal && authModal) {
        closeAuthModal.addEventListener('click', () => {
            authModal.style.display = 'none';
        });
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) authModal.style.display = 'none';
        });
    }
});

// Global exports
window.updateQuantity = updateQuantity;
window.removeItem = removeItem;