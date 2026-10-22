import { supabase, erp } from '../../assets/js/supabase-config.js';
import { formatMoney, packLabelHtml, applySearchFilter, rankSearchResults, searchWords } from '../../assets/js/shop-format.js';
import { fetchActiveOffers, offerLabel, offerPrice, describeConditions, offerHasConditions } from '../../assets/js/offers.js';
/* ==========================================================================
   1. GLOBAL VARIABILITIES & UTILITIES
   ========================================================================== */
let currentUser = null;
let currentQuoteItems = [];
let currentQuoteId = null;
let allMedicines = [];

const DEFAULT_PRODUCT_IMAGE = 'https://placehold.co/400x400/f0f0f0/999999?text=No+Image';

function getProductImage(imageUrl) {
    return (imageUrl && imageUrl.trim() !== '') ? imageUrl : DEFAULT_PRODUCT_IMAGE;
}

// Fixed to handle single and double quotes to protect data attributes
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, function(m) {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return m;
        }
    });
}

// Optimized to seamlessly manage our global currentUser memory state
async function safeGetUser() {
    try {
        // If we already cached the user session locally, use it instantly
        if (currentUser) return currentUser;

        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (!sessionErr && session?.user) {
            currentUser = session.user;
            return currentUser;
        }

        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
            currentUser = null;
            return null;
        }
        currentUser = user;
        return user;
    } catch {
        currentUser = null;
        return null;
    }
}

// Dynamic UI Loaders (Matches your hidden engine classes perfectly)
function showLoading(message = 'Loading...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay hidden';
        overlay.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    const spinnerText = overlay.querySelector('p');
    if (spinnerText) spinnerText.textContent = message;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

/* ==========================================================================
   1.5 EXTERNAL APP OPENING FUNCTIONS (WhatsApp, Maps, Navigation)
   ========================================================================== */

// --- OPEN WHATSAPP - Using Capacitor.Plugins directly ---
window.openWhatsApp = function(phoneNumber) {
    console.log('Opening WhatsApp for:', phoneNumber);
    
    const isCapacitor = window.Capacitor && Capacitor.isNativePlatform();
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${cleanNumber}`;
    
    if (isCapacitor) {
        try {
            const Browser = Capacitor.Plugins.Browser;
            Browser.open({
                url: whatsappUrl,
                windowName: '_system'
            }).then(function() {
                window.showToast('Opening WhatsApp...', 'success', 'WhatsApp');
            }).catch(function(err) {
                console.error('Browser plugin error:', err);
                window.open(whatsappUrl, '_system');
            });
        } catch (err) {
            console.error('Error:', err);
            window.open(whatsappUrl, '_system');
        }
    } else {
        window.open(whatsappUrl, isMobile ? '_system' : '_blank');
        window.showToast('Opening WhatsApp...', 'success', 'WhatsApp');
    }
};

// --- OPEN NAVIGATION - Using Capacitor.Plugins directly ---
window.openNavigation = function(destLat, destLng, destAddress) {
    console.log('Opening navigation to:', destLat, destLng);
    
    const isCapacitor = window.Capacitor && Capacitor.isNativePlatform();
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`;
    
    if (isCapacitor) {
        try {
            const Browser = Capacitor.Plugins.Browser;
            
            // Try to get location for directions
            try {
                const Geolocation = Capacitor.Plugins.Geolocation;
                Geolocation.requestPermissions().then(function(permStatus) {
                    if (permStatus.location === 'granted') {
                        Geolocation.getCurrentPosition({
                            enableHighAccuracy: true,
                            timeout: 10000
                        }).then(function(position) {
                            const { latitude, longitude } = position.coords;
                            const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destLat},${destLng}&travelmode=driving`;
                            Browser.open({
                                url: directionsUrl,
                                windowName: '_system'
                            }).then(function() {
                                window.showToast('Opening Google Maps with directions...', 'success', 'Navigation');
                            }).catch(function(err) {
                                console.error('Browser error:', err);
                                window.open(googleMapsUrl, '_system');
                            });
                        }).catch(function(err) {
                            console.log('Location error:', err);
                            Browser.open({
                                url: googleMapsUrl,
                                windowName: '_system'
                            }).then(function() {
                                window.showToast('Opening Google Maps...', 'success', 'Navigation');
                            }).catch(function(err2) {
                                window.open(googleMapsUrl, '_system');
                            });
                        });
                    } else {
                        Browser.open({
                            url: googleMapsUrl,
                            windowName: '_system'
                        }).then(function() {
                            window.showToast('Opening Google Maps...', 'success', 'Navigation');
                        }).catch(function(err) {
                            window.open(googleMapsUrl, '_system');
                        });
                    }
                }).catch(function(err) {
                    console.log('Permission error:', err);
                    Browser.open({
                        url: googleMapsUrl,
                        windowName: '_system'
                    }).then(function() {
                        window.showToast('Opening Google Maps...', 'success', 'Navigation');
                    }).catch(function(err2) {
                        window.open(googleMapsUrl, '_system');
                    });
                });
            } catch (err) {
                console.log('Geolocation not available:', err);
                Browser.open({
                    url: googleMapsUrl,
                    windowName: '_system'
                }).then(function() {
                    window.showToast('Opening Google Maps...', 'success', 'Navigation');
                }).catch(function(err2) {
                    window.open(googleMapsUrl, '_system');
                });
            }
        } catch (err) {
            console.error('Error:', err);
            window.open(googleMapsUrl, '_system');
        }
    } else {
        // Web fallback
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const { latitude, longitude } = position.coords;
                    const fullUrl = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destLat},${destLng}&travelmode=driving`;
                    window.open(fullUrl, isMobile ? '_system' : '_blank');
                    window.showToast('Opening Google Maps with directions...', 'success', 'Navigation');
                },
                function(error) {
                    console.error('Geolocation error:', error);
                    window.open(googleMapsUrl, isMobile ? '_system' : '_blank');
                    window.showToast('Opening Google Maps...', 'info', 'Navigation');
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            window.open(googleMapsUrl, isMobile ? '_system' : '_blank');
            window.showToast('Opening Google Maps...', 'info', 'Navigation');
        }
    }
};

// --- OPEN EXTERNAL MAPS - Using Capacitor.Plugins directly ---
window.openExternalMaps = function(destLat, destLng, destAddress) {
    console.log('Opening maps for:', destLat, destLng);
    
    const isCapacitor = window.Capacitor && Capacitor.isNativePlatform();
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`;
    
    if (isCapacitor) {
        try {
            const Browser = Capacitor.Plugins.Browser;
            Browser.open({
                url: googleMapsUrl,
                windowName: '_system'
            }).then(function() {
                window.showToast('Opening Google Maps...', 'success', 'Navigation');
            }).catch(function(err) {
                console.error('Browser plugin error:', err);
                window.open(googleMapsUrl, '_system');
            });
        } catch (err) {
            console.error('Error:', err);
            window.open(googleMapsUrl, '_system');
        }
    } else {
        window.open(googleMapsUrl, isMobile ? '_system' : '_blank');
        window.showToast('Opening Google Maps...', 'success', 'Navigation');
    }
};


/* ==========================================================================
   2. LOAD ALL MEDICINES FOR SUBSTITUTION
   ========================================================================== */
async function loadAllMedicines() {
    try {
        // 1. Filter to only pull valid substitute items (must have an active ingredient)
        // 2. Added a safety limit to prevent memory crashes on mobile devices
        const { data, error } = await erp
            .from('online_products')
            .select('id, name, brand, active_ingredient, price, image_url')
            .not('active_ingredient', 'is', null)
            .limit(1000); 
        
        if (error) throw error;
        
        allMedicines = data || [];
        console.log('Medicines loaded for substitution engine:', allMedicines.length);
    } catch (err) {
        console.error('Error loading medicines:', err);
        allMedicines = [];
        
        if (typeof window.showToast === 'function') {
            window.showToast('Failed to sync substitute medicine database. Retrying...', 'warning');
        }
    }
}

/* ==========================================================================
   3. TOAST NOTIFICATION SYSTEM
   ========================================================================== */
   window.showToast = (message, type = 'info', title = '', duration = 3000) => {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: '<i class="fas fa-check-circle"></i>',
        error: '<i class="fas fa-exclamation-circle"></i>',
        warning: '<i class="fas fa-exclamation-triangle"></i>',
        info: '<i class="fas fa-info-circle"></i>'
    };
    
    const titles = {
        success: 'Success!',
        error: 'Error!',
        warning: 'Warning!',
        info: 'Info'
    };
    
    // Safely parse values using your escapeHtml block to avoid rendering bugs
    const safeTitle = escapeHtml(title || titles[type] || 'Info');
    const safeMessage = escapeHtml(message);
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${safeTitle}</div>
            <div class="toast-message">${safeMessage}</div>
        </div>
        <button class="toast-close">&times;</button>
        <div class="toast-progress"></div>
    `;
    
    // Bind the close click cleanly via event listener to survive JS Module scoping
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toast.remove();
        });
    }
    
    container.appendChild(toast);
    
    // Smooth dismiss workflow matching your slide-out animations
    setTimeout(() => {
        if (toast && toast.parentNode) {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
};

/* ============================================
   CUSTOM NOTIFICATION SYSTEM - Replaces browser alerts
   ============================================ */

// Custom Alert - Replaces window.alert()
window.customAlert = function(message, title = 'Notification', type = 'info') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'notification-overlay active';
        overlay.id = 'customNotificationOverlay';
        
        const iconMap = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle',
            question: 'fa-question-circle'
        };
        
        overlay.innerHTML = `
            <div class="notification-card">
                <div class="notification-header">
                    <div class="notification-icon ${type}">
                        <i class="fas ${iconMap[type] || iconMap.info}"></i>
                    </div>
                    <h3 class="notification-title">${escapeHtml(title)}</h3>
                </div>
                <div class="notification-body">
                    <p class="notification-message">${escapeHtml(message)}</p>
                </div>
                <div class="notification-actions">
                    <button class="notification-btn-primary" onclick="window.closeCustomNotification()">OK</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        window._notificationResolve = resolve;
    });
};

// Custom Confirm - Replaces window.confirm()
window.customConfirm = function(message, title = 'Confirm', confirmText = 'Yes', cancelText = 'No') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'notification-overlay active';
        overlay.id = 'customNotificationOverlay';
        
        overlay.innerHTML = `
            <div class="notification-card">
                <div class="notification-header">
                    <div class="notification-icon question">
                        <i class="fas fa-question-circle"></i>
                    </div>
                    <h3 class="notification-title">${escapeHtml(title)}</h3>
                </div>
                <div class="notification-body">
                    <p class="notification-message">${escapeHtml(message)}</p>
                </div>
                <div class="notification-actions">
                    <button class="notification-btn-secondary" onclick="window.resolveCustomConfirm(false)">${escapeHtml(cancelText)}</button>
                    <button class="notification-btn-primary" onclick="window.resolveCustomConfirm(true)">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        window._confirmResolve = resolve;
    });
};

// Resolve confirm
window.resolveCustomConfirm = function(value) {
    if (window._confirmResolve) {
        window._confirmResolve(value);
        window._confirmResolve = null;
    }
    window.closeCustomNotification();
};

// Close notification
window.closeCustomNotification = function() {
    const overlay = document.getElementById('customNotificationOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
    
    if (window._notificationResolve) {
        window._notificationResolve();
        window._notificationResolve = null;
    }
    if (window._confirmResolve) {
        window._confirmResolve(false);
        window._confirmResolve = null;
    }
};
/* ==========================================================================
   4. DYNAMIC CATEGORY NAVIGATION & ROUTING ENGINE
   ========================================================================== */
   async function loadDynamicCategories() {
    try {
        const { data: products, error } = await erp
            .from('online_categories')
            .select('parent_type, category, sub_category')
            .limit(5000);
        
        if (error) throw error;
        if (!products?.length) return { parentTypes: [], categoryMap: {}, standaloneCategories: [] };
        
        const normalizedProducts = products.map(p => ({
            ...p,
            parent_type: p.parent_type?.trim().toLowerCase() || null,
            category: p.category?.trim().toLowerCase() || null
        }));
        
        const parentTypes = [...new Set(normalizedProducts.filter(p => p.parent_type).map(p => p.parent_type))];
        const PARENT_ORDER = ['medicine', 'surgical_instruments_equipment', 'orthopaedic_rehab_supports', 'diagnostics_devices', 'consumables_hygiene', 'cosmetics', 'surgicals', 'diagnostics'];
        parentTypes.sort((a, b) => {
            const ia = PARENT_ORDER.indexOf(a), ib = PARENT_ORDER.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
        });
        const categoryMap = {};
        
        parentTypes.forEach(parentType => {
            categoryMap[parentType] = [...new Set(
                normalizedProducts.filter(p => p.parent_type === parentType && p.category).map(p => p.category)
            )];
        });
        
        const standaloneCategories = [...new Set(
            normalizedProducts.filter(p => !p.parent_type && p.category).map(p => p.category)
        )];
        
        return { parentTypes, categoryMap, standaloneCategories };
    } catch (err) {
        console.error("Error loading categories:", err);
        return { parentTypes: [], categoryMap: {}, standaloneCategories: [] };
    }
}

function formatDisplayName(str) {
    if (!str) return '';
    return str.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Fixed Router Interceptor: Saves state information and executes physical page loading
function navigateToProductView(queryString) {
    const targetUrl = `../products/index.html?${queryString}`;
    
    // Push state data so the browser history track saves what view we went to
    history.pushState({ view: 'products', search: queryString }, '', targetUrl);
    
    // Execute physical redirect so your product page opens instantly
    window.location.assign(targetUrl);
}

async function buildDynamicNavigation() {
    const navContainer = document.querySelector('.main-nav');
    if (!navContainer) return;

    // FORCE HORIZONTAL GRID-STYLE BEHAVIOR
navContainer.style.display = 'flex';
navContainer.style.flexWrap = 'nowrap';
navContainer.style.overflowX = 'auto';
navContainer.style.overflowY = 'hidden';
navContainer.style.whiteSpace = 'nowrap';
navContainer.style.webkitOverflowScrolling = 'touch';
navContainer.style.scrollbarWidth = 'none';
navContainer.style.width = '100%';
navContainer.style.maxWidth = '100vw';
navContainer.style.boxSizing = 'border-box';

// --- CRITICAL FIXES FOR GLITCHES ---
navContainer.style.paddingRight = '40px'; // Fixes the "half-cut" last item
navContainer.style.flexShrink = '0';      // Prevents the container from shrinking
navContainer.style.position = 'relative'; // Ensures it doesn't break header layering

    const style = document.createElement('style');
    style.textContent = `.main-nav::-webkit-scrollbar { display: none; }`;
    document.head.appendChild(style);

    // Clear the loading state
    navContainer.innerHTML = '';
    
    const categories = await loadDynamicCategories();
    if (!categories.parentTypes.length) {
        navContainer.innerHTML = '<div class="nav-item"><span>No categories available</span></div>';
        return;
    }
    
    navContainer.innerHTML = '';
    
    // Create the global portal for mobile app view rendering
    let globalPortal = document.getElementById('nav-dropdown-portal');
    if (!globalPortal) {
        globalPortal = document.createElement('div');
        globalPortal.id = 'nav-dropdown-portal';
        document.body.appendChild(globalPortal);
    }
    
    for (const parentType of categories.parentTypes) {
        const navItem = document.createElement('div');
        navItem.className = 'nav-item has-dropdown';
        const PARENT_LABELS = {
            surgical_instruments_equipment: 'Surgical Instruments & Equipment',
            orthopaedic_rehab_supports: 'Orthopaedic & Rehab Supports',
            diagnostics_devices: 'Diagnostics & Devices',
            consumables_hygiene: 'Consumables & Hygiene'
        };
        navItem.innerHTML = `<span>${escapeHtml(PARENT_LABELS[parentType] || formatDisplayName(parentType))}</span>`;

        const categoryList = categories.categoryMap[parentType] || [];
        
        if (categoryList.length === 0) {
            navItem.className = 'nav-item';
            navItem.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToProductView(`parent_type=${encodeURIComponent(parentType)}`);
            });
        } else {
            // Desktop hover menu structure
            const desktopDropdown = document.createElement('div');
            desktopDropdown.className = 'desktop-dropdown-menu';
            
            // Mobile app portal structure
            const mobileDropdown = document.createElement('div');
            mobileDropdown.className = 'dropdown-portal-menu';
            
            categoryList.forEach(category => {
                // Attach Desktop Links
                const dLink = document.createElement('a');
                dLink.href = 'javascript:void(0)';
                dLink.textContent = formatDisplayName(category);
                dLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigateToProductView(`parent_type=${encodeURIComponent(parentType)}&category=${encodeURIComponent(category)}`);
                });
                desktopDropdown.appendChild(dLink);
                
                // Attach Mobile Links
                const mLink = document.createElement('a');
                mLink.href = 'javascript:void(0)';
                mLink.textContent = formatDisplayName(category);
                mLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.querySelectorAll('.main-nav .nav-item').forEach(el => el.classList.remove('active'));
                    document.querySelectorAll('.dropdown-portal-menu').forEach(el => el.classList.remove('open'));
                    document.body.style.overflow = '';
                    navigateToProductView(`parent_type=${encodeURIComponent(parentType)}&category=${encodeURIComponent(category)}`);
                });
                mobileDropdown.appendChild(mLink);
            });
            
            navItem.appendChild(desktopDropdown);
            globalPortal.appendChild(mobileDropdown);

            // Mobile tap interactions and scroll-locking
            navItem.addEventListener('click', (e) => {
                if (window.innerWidth > 768) return; 
                
                e.preventDefault();
                e.stopPropagation();
                
                const isAlreadyActive = navItem.classList.contains('active');
                
                document.querySelectorAll('.main-nav .nav-item').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.dropdown-portal-menu').forEach(el => el.classList.remove('open'));
                document.body.style.overflow = '';
                
                if (!isAlreadyActive) {
                    navItem.classList.add('active');
                    const navRect = navContainer.getBoundingClientRect();
                    mobileDropdown.style.top = `${navRect.bottom}px`;
                    mobileDropdown.classList.add('open');
                    
                    // Lock background body from scrolling on app view
                    document.body.style.overflow = 'hidden';
                }
            });
        }
        navContainer.appendChild(navItem);
    }
    
    // Standalone links
    categories.standaloneCategories.forEach(category => {
        const navItem = document.createElement('div');
        navItem.className = 'nav-item standalone-item';
        navItem.innerHTML = `<span>${formatDisplayName(category)}</span>`;
        navItem.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToProductView(`category=${encodeURIComponent(category)}`);
        });
        navContainer.appendChild(navItem);
    });
    
    // Auto-close routines for external clicks and window scrolling
    const resetMenu = (e) => {
        if (e.type === 'click' && (e.target.closest('.main-nav') || e.target.closest('.dropdown-portal-menu'))) return;
        document.querySelectorAll('.main-nav .nav-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.dropdown-portal-menu').forEach(el => el.classList.remove('open'));
        document.body.style.overflow = '';
    };

    document.addEventListener('click', resetMenu);
    window.addEventListener('scroll', resetMenu, { passive: true });
}
/* ==========================================================================
   5. CART MANAGEMENT
   ========================================================================== */
   export async function syncCartCount() {
    try {
        const user = await safeGetUser();
        const cartKey = user ? `cart_${user.id}` : 'guest_cart';
        const cart = JSON.parse(localStorage.getItem(cartKey)) || [];
        const totalItems = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
        
        const cartCountBadge = document.getElementById("cartCount");
        if (cartCountBadge) {
            cartCountBadge.textContent = totalItems;
            // Toggles structural visibility classes instead of hardcoding CSS styles
            if (totalItems === 0) {
                cartCountBadge.classList.add('hidden');
            } else {
                cartCountBadge.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.warn("syncCartCount error:", err);
    }
}

export async function syncQuoteCount() {
    try {
        const user = await safeGetUser();
        if (!user) return;
        
        const { count, error } = await supabase
            .from('prescriptions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'quotation_sent');
        
        if (!error) {
            const quoteBadge = document.getElementById('quoteCount');
            if (quoteBadge) {
                quoteBadge.textContent = count || 0;
                // Toggles structural visibility classes instead of hardcoding CSS styles
                if (count > 0) {
                    quoteBadge.classList.remove('hidden');
                } else {
                    quoteBadge.classList.add('hidden');
                }
            }
        }
    } catch (err) {
        console.warn("syncQuoteCount error:", err);
    }
}

function showCartNotification(itemName = 'Item') {
    const notify = document.getElementById('cartNotification');
    if (notify) {
        const heading = notify.querySelector('h4');
        if (heading) heading.innerHTML = `&check; ${escapeHtml(itemName)} Added!`;
        notify.classList.add('active');
        notify.classList.remove('hidden');
        
        // Safe contextual timeout handler
        setTimeout(() => {
            closeCartNotification();
        }, 3000);
    }
    window.showToast(`${itemName} has been added to your cart`, 'success', 'Added to Cart', 2000);
}

function closeCartNotification() {
    const notify = document.getElementById('cartNotification');
    if (notify) {
        notify.classList.remove('active');
        notify.classList.add('hidden');
    }
}

/* ==========================================================================
   STOCK HELPERS (stock comes from the ERP via the online_products view)
   - customers never see quantities; they only see "Out of Stock", or a
     "not enough available" message if they ask for more than we have.
   ========================================================================== */
(function injectStockStyles() {
    if (typeof document === 'undefined' || document.getElementById('stock-style')) return;
    const st = document.createElement('style');
    st.id = 'stock-style';
    st.textContent = `
        .product-card { position: relative; }
        .out-of-stock-btn { background: #e5e7eb !important; color: #6b7280 !important; cursor: not-allowed !important; border: none !important; box-shadow: none !important; }
        .out-of-stock-badge { position: absolute; top: 10px; left: 10px; background: #6b7280; color: #fff; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; z-index: 3; }
        .product-card.is-out-of-stock .img-wrapper img { opacity: .5; filter: grayscale(.6); }
    `;
    document.head.appendChild(st);
})();

export async function getFreshStock(productId) {
    const { data, error } = await erp
        .from('online_products')
        .select('id, name, in_stock, available_packs')
        .eq('id', productId)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

export function notEnoughStockMessage(name) {
    return `Sorry, we don't have that many of "${name}" available right now. Please reduce the quantity.`;
}

export async function addToCart(productId) {
    try {
        const { data: product, error } = await erp
            .from('online_products')
            .select('*')
            .eq('id', productId)
            .single();
            
        if (error || !product) return;

        if (!product.in_stock) {
            window.showToast(`"${product.name}" is out of stock`, 'warning', 'Out of Stock');
            return;
        }

        const user = await safeGetUser();
        const cartKey = user ? `cart_${user.id}` : 'guest_cart';
        let cart = JSON.parse(localStorage.getItem(cartKey)) || [];

        // Price comes straight from the ERP (online price); no extra markdown here.
        let finalPrice = product.price;

        const idx = cart.findIndex(item => String(item.id) === String(productId));

        // Never let the bag hold more than we have available
        const alreadyInBag = idx > -1 ? (cart[idx].qty || 0) : 0;
        if (alreadyInBag + 1 > (product.available_packs || 0)) {
            window.showToast(notEnoughStockMessage(product.name), 'warning', 'Not Enough Stock');
            return;
        }
        
        if (idx > -1) {
            cart[idx].qty += 1;
            cart[idx].price = finalPrice;
            cart[idx].pack_size = product.pack_size || 1;
            window.showToast(`Quantity updated for "${product.name}"`, 'success', 'Cart Updated');
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                price: finalPrice,
                image: getProductImage(product.image_url),
                pack_size: product.pack_size || 1,
                qty: 1
            });
            showCartNotification(product.name);
        }

        localStorage.setItem(cartKey, JSON.stringify(cart));
        await syncCartCount();
        
    } catch (err) {
        console.error("Cart Error:", err);
        window.showToast("Failed to add item to cart", 'error', 'Error');
    }
}

// Global exposure declarations supporting multi-scoped execution targets safely
window.addToCart = addToCart;
window.closeNotification = closeCartNotification;
/* ==========================================================================
   6. SEARCH FUNCTIONALITY (DEBOUNCED & STYLE-FREE)
   ========================================================================== */
// Keeps track of the input delay timer globally within this block
let searchDebounceTimeout = null;

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('searchDropdown');
    const searchWrapper = document.querySelector('.search-upload-wrapper');
    if (dropdown && searchWrapper && !searchWrapper.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

let searchRequestId = 0;

window.handleLiveSearch = (event) => {
    // Clear any preceding keystroke timers to save mobile data requests
    clearTimeout(searchDebounceTimeout);

    const query = event.target.value.trim();
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    // Enter = open the full results page for what was typed
    if (event.key === 'Enter' && query.length >= 2) {
        dropdown.classList.add('hidden');
        window.location.assign(`../products/index.html?search=${encodeURIComponent(query)}`);
        return;
    }

    if (!query || query.length < 2 || !searchWords(query).length) {
        dropdown.classList.add('hidden');
        return;
    }

    // Wait 300ms after the user finishes typing before execution
    searchDebounceTimeout = setTimeout(async () => {
        const myRequest = ++searchRequestId;
        try {
            // Every typed word must match the name, brand or active ingredient
            let request = erp
                .from('online_products')
                .select('id, name, brand, active_ingredient, image_url, price, pack_size, in_stock');
            request = applySearchFilter(request, query).limit(40);
            const { data, error } = await request;

            if (error) throw error;
            if (myRequest !== searchRequestId) return; // a newer search is already running

            const products = rankSearchResults(data, query).slice(0, 8);
            dropdown.innerHTML = '';

            if (products.length) {
                products.forEach(p => {
                    const item = document.createElement('div');
                    item.className = 'search-result-item';

                    item.innerHTML = `
                        <img src="${getProductImage(p.image_url)}" alt="${escapeHtml(p.name)}" onerror="this.src='${DEFAULT_PRODUCT_IMAGE}'">
                        <div class="search-result-info">
                            <span class="search-result-name">${escapeHtml(p.name)}</span>
                            <span class="search-result-meta">${p.brand ? escapeHtml(p.brand) + ' &middot; ' : ''}${packLabelHtml(p)}${p.in_stock ? '' : ' <span class="search-result-soldout">Out of stock</span>'}</span>
                        </div>
                        <span class="search-result-price">ZMW ${formatMoney(p.price)}</span>
                    `;

                    // Clean, module-safe programmatic redirect
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        dropdown.classList.add('hidden');
                        window.location.assign(`../product-detail/index.html?id=${p.id}`);
                    });

                    dropdown.appendChild(item);
                });

                const seeAll = document.createElement('div');
                seeAll.className = 'search-result-all';
                seeAll.textContent = `See all results for "${query}"`;
                seeAll.addEventListener('click', () => {
                    dropdown.classList.add('hidden');
                    window.location.assign(`../products/index.html?search=${encodeURIComponent(query)}`);
                });
                dropdown.appendChild(seeAll);
            } else {
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = `No results found for "${query}"`;
                dropdown.appendChild(noResults);
            }

            dropdown.classList.remove('hidden');

        } catch (err) {
            console.error('Search error:', err);
            dropdown.classList.add('hidden');
        }
    }, 300);
};
/* ==========================================================================
   7. MODAL MANAGEMENT (SYNCHRONIZED WITH CUSTOMER HTML)
   ========================================================================== */
   window.openModal = (modalId) => {
    // Select all open modals using your active class naming strategy
    const activeModals = document.querySelectorAll('.modal.active, .modal-overlay-custom.active');
    activeModals.forEach(modal => {
        if (modal.id !== modalId) {
            modal.classList.remove('active');
            modal.classList.add('hidden'); // Ensures structural hiding
        }
    });
    
    const targetModal = document.getElementById(modalId);
    if (targetModal) {
        targetModal.classList.remove('hidden'); // Strip hidden status from your HTML
        targetModal.classList.add('active');   // Apply the dynamic active state
        document.body.classList.add('modal-open');
    }
};

window.closeModal = (modalId) => {
    const targetModal = document.getElementById(modalId);
    if (targetModal) {
        targetModal.classList.remove('active');
        targetModal.classList.add('hidden'); // Re-apply hidden status natively
        
        // Only unlock body scrolling if there are absolutely no other active modals open
        const anyRemainingOpen = document.querySelector('.modal.active, .modal-overlay-custom.active');
        if (!anyRemainingOpen) {
            document.body.classList.remove('modal-open');
        }
    }
};

window.openUploadModal = async () => {
    window.openModal('prescriptionModal');
    // Show which phone number we will use (from the member's profile)
    const line = document.getElementById('prescContactLine');
    if (!line) return;
    line.textContent = '';
    try {
        const user = await safeGetUser();
        if (!user) return;
        const { data } = await supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle();
        if (data?.phone) line.textContent = `We may call you on ${data.phone} if anything is unclear.`;
    } catch (e) { /* the note is optional */ }
};

const PRESC_MAX_BYTES = 10 * 1024 * 1024;

window.clearPrescriptionFile = () => {
    const input = document.getElementById('prescFile');
    if (input) input.value = '';
    const preview = document.getElementById('prescPreview');
    const img = document.getElementById('prescPreviewImg');
    if (img?.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
    if (img) { img.removeAttribute('src'); img.classList.add('hidden'); }
    preview?.classList.add('hidden');
    document.getElementById('prescDropArea')?.classList.remove('hidden');
    const status = document.getElementById('uploadStatus');
    if (status) status.textContent = '';
};

window.previewPrescriptionFile = (input) => {
    const file = input?.files?.[0];
    const status = document.getElementById('uploadStatus');
    if (!file) { window.clearPrescriptionFile(); return; }

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
        window.clearPrescriptionFile();
        if (status) status.textContent = 'Please choose a photo (JPG/PNG) or a PDF.';
        return;
    }
    if (file.size > PRESC_MAX_BYTES) {
        window.clearPrescriptionFile();
        if (status) status.textContent = 'That file is too large. Please choose one under 10 MB.';
        return;
    }
    if (status) status.textContent = '';

    const img = document.getElementById('prescPreviewImg');
    const name = document.getElementById('prescFileName');
    if (name) name.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    if (img) {
        if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
        if (isImage) { img.src = URL.createObjectURL(file); img.classList.remove('hidden'); }
        else { img.removeAttribute('src'); img.classList.add('hidden'); }
    }
    document.getElementById('prescPreview')?.classList.remove('hidden');
    document.getElementById('prescDropArea')?.classList.add('hidden');
};

// Fixed: Now points precisely to your HTML id="customerQuoteModal"
window.closeQuotationModal = () => {
    window.closeModal('customerQuoteModal');
};

window.openTrackingModal = async () => {
    // 1. Open the container framework layer first
    window.openModal('trackingModal');
    
    // 2. Safely populate datasets using the shared window engine scope
    if (typeof window.loadUserOrdersForTracking === 'function') {
        const orders = await window.loadUserOrdersForTracking();
        if (typeof window.renderTrackingBoxes === 'function') {
            window.renderTrackingBoxes(orders);
        }
    } else {
        console.warn("Tracking engine data layer missing from window scope.");
    }

    // 3. Bind navigation click elements for active vs history tabs
    if (typeof window.initializeTrackingTabs === 'function') {
        window.initializeTrackingTabs();
    }
};

// Safe, additive click listener checking backdrop wrappers
window.addEventListener('click', (event) => {
    const isModalBackdrop = event.target.classList.contains('modal') || 
                            event.target.classList.contains('modal-overlay-custom');
                            
    if (isModalBackdrop) {
        if (event.target.id) {
            window.closeModal(event.target.id);
        } else {
            const parentModal = event.target.closest('.modal, .modal-overlay-custom');
            if (parentModal && parentModal.id) {
                window.closeModal(parentModal.id);
            } else {
                // Total emergency cleanup fallback
                document.querySelectorAll('.modal.active, .modal-overlay-custom.active').forEach(el => {
                    el.classList.remove('active');
                    el.classList.add('hidden');
                });
                document.body.classList.remove('modal-open');
            }
        }
    }
});
/* ==========================================================================
   8. AUTHENTICATION (CLASS-DRIVEN & STYLE-FREE)
   ========================================================================== */
   export function openAuthModal() {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    if (loginForm && signupForm) {
        loginForm.classList.remove('hidden'); // Show Login natively via classes
        signupForm.classList.add('hidden');    // Hide Signup natively via classes
    }
    
    ['loginEmail', 'loginPass'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    window.openModal('authModal');
}

window.openAuthModal = openAuthModal;
window.closeAuthModal = () => window.closeModal('authModal');

window.toggleAuthMode = (view) => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    if (!loginForm || !signupForm) return;

    if (view === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        ['signupName', 'signupEmail', 'signupPhone', 'signupPlace', 'signupPass'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
};

window.handleLogin = async () => {
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPass')?.value;
    const loginBtn = document.getElementById('loginBtn');
    
    if (!email || !password) {
        window.showToast("Please fill in all fields", "warning", "Missing Information");
        return;
    }

    if (loginBtn) {
        loginBtn.classList.add('loading');
        loginBtn.disabled = true;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (loginBtn) {
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
    }
    
    if (error) {
        window.showToast(error.message, "error", "Login Failed");
    } else {
        window.closeAuthModal();
        window.showToast("Welcome back! You have successfully logged in.", "success", "Login Successful");
        setTimeout(() => location.reload(), 100);
    }
};

window.handleSignup = async () => {
    const email = document.getElementById('signupEmail')?.value;
    const password = document.getElementById('signupPass')?.value;
    const name = document.getElementById('signupName')?.value;
    const phone = document.getElementById('signupPhone')?.value;
    const place = document.getElementById('signupPlace')?.value;
    const signupBtn = document.getElementById('signupBtn');

    if (!email || !password || !name || !phone || !place) {
        window.showToast("Please fill in all fields", "warning", "Missing Information");
        return;
    }

    if (signupBtn) {
        signupBtn.classList.add('loading');
        signupBtn.disabled = true;
    }

    const { data, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name } }
    });

    if (signupBtn) {
        signupBtn.classList.remove('loading');
        signupBtn.disabled = false;
    }

    if (authError) {
        window.showToast(authError.message, "error", "Registration Failed");
        return;
    }

    if (data?.user) {
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({ id: data.user.id, name, phone, place, role: 'member' });

        if (profileError) {
            window.showToast(profileError.message, "error", "Database Error");
        } else {
            window.showToast("Registration successful! Please login now.", "success", "Welcome!");
            window.toggleAuthMode('login');
        }
    }
};

window.handleLogout = async () => {
    await supabase.auth.signOut();
    window.showToast("You have been logged out successfully.", "info", "Logged Out");
    location.reload();
};
/* ==========================================================================
   9. ROLE-BASED UI SYNC (CLASS-DRIVEN)
   ========================================================================== */
   async function syncAuthState() {
    try {
        const user = await safeGetUser();
        currentUser = user;
        
        const adminLink = document.getElementById('adminLink');
        const riderBtn = document.getElementById('riderBtn');
        const authLink = document.getElementById('authLink');

        // Clean initial state resetting using purely functional classes
        if (adminLink) adminLink.classList.add('hidden');
        if (riderBtn)  riderBtn.classList.add('hidden');

        if (!user) {
            if (authLink) {
                authLink.textContent = "Login / Signup";
                // Clear out any previous listeners using a clean, fresh event replacement
                authLink.replaceWith(authLink.cloneNode(true));
                const freshAuthLink = document.getElementById('authLink');
                freshAuthLink.addEventListener('click', (e) => { 
                    e.preventDefault(); 
                    openAuthModal(); 
                });
            }
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, name')
            .eq('id', user.id)
            .single();

        if (authLink) {
            const displayName = profile?.name || user.email?.split('@')[0] || 'User';
            authLink.textContent = `Hello, ${escapeHtml(displayName)} (Logout)`;
            
            authLink.replaceWith(authLink.cloneNode(true));
            const freshAuthLink = document.getElementById('authLink');
            freshAuthLink.addEventListener('click', (e) => { 
                e.preventDefault(); 
                window.handleLogout(); 
            });
        }

        if (profile) {
            const role = profile.role?.toLowerCase().trim();
            if (role === 'admin' && adminLink) {
                adminLink.classList.remove('hidden');
            }
            if (role === 'rider' && riderBtn) {
                riderBtn.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.warn("UI Sync failed:", e);
    }
}
/* ==========================================================================
   10. PRESCRIPTION & QUOTE MANAGEMENT (CLASS-DRIVEN & CLEAN MARKUP)
   ========================================================================== */
   window.handlePrescriptionSubmit = async (event) => {
    event.preventDefault();
    
    const fileInput = document.getElementById('prescFile');
    const refInput = document.getElementById('prescRef');
    const submitBtn = document.querySelector('#prescriptionModal button[type="submit"]');
    const user = await safeGetUser();

    if (!user) {
        window.showToast("Please login first to upload a prescription", "warning", "Login Required");
        openAuthModal();
        return;
    }
    
    if (!fileInput?.files[0]) {
        window.showToast("Please add a photo or PDF of your prescription", "warning", "No File Selected");
        return;
    }
    if (fileInput.files[0].size > PRESC_MAX_BYTES) {
        window.showToast("That file is over 10 MB. Please choose a smaller one.", "warning", "File Too Large");
        return;
    }

    if (submitBtn) {
        submitBtn.innerHTML = '<span>Uploading...</span>';
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
    }

    try {
        const file = fileInput.files[0];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
        const filePath = `${user.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage.from('prescriptions').upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('prescriptions').getPublicUrl(filePath);

        const { error: dbError } = await supabase.from('prescriptions').insert({
            user_id: user.id,
            file_url: urlData.publicUrl,
            reference_name: refInput?.value || '',
            status: 'pending'
        });

        if (dbError) throw dbError;

        window.showToast("Received! Our pharmacist will review it and send your quotation to your Quotes inbox.", "success", "Prescription Sent");
        window.closeModal('prescriptionModal');
        if (refInput) refInput.value = '';
        window.clearPrescriptionFile();
    } catch (err) {
        console.error("Upload Error:", err);
        window.showToast("Upload failed: " + err.message, "error", "Upload Failed");
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = '<span>Submit Prescription</span>';
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }
};

window.togglePrescList = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    const panel = document.getElementById('floatingPrescList');
    if (panel) {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) loadCustomerQuotes();
    }
};

window.acceptQuotation = async () => {
    const quoteId = currentQuoteId;
    const acceptBtn = document.querySelector('#customerQuoteModal .accept-quote-btn');
    
    if (!quoteId) {
        window.showToast("No quotation selected.", "warning", "Error");
        return;
    }
    
    if (acceptBtn) {
        acceptBtn.classList.add('loading');
        acceptBtn.disabled = true;
    }
    
    try {
        const user = await safeGetUser();
        const cartKey = user ? `cart_${user.id}` : 'guest_cart';

        const { data: quote, error } = await supabase
            .from('prescriptions')
            .select('quoted_items')
            .eq('id', quoteId)
            .single();

        if (error || !quote?.quoted_items) throw new Error("Quotation not found");

        let cart = JSON.parse(localStorage.getItem(cartKey)) || [];

        for (const item of quote.quoted_items) {
            let productData = null;
            
            if (item.product_id) {
                const { data: product } = await erp
                    .from('online_products')
                    .select('id, name, price, image_url')
                    .eq('id', item.product_id)
                    .maybeSingle();
                productData = product;
            }
            
            if (!productData && item.name) {
                const { data: product } = await erp
                    .from('online_products')
                    .select('id, name, price, image_url')
                    .ilike('name', item.name)
                    .limit(1)
                    .maybeSingle();
                productData = product;
            }
            
            const productId = productData?.id || item.product_id || item.id;
            const productName = productData?.name || item.name;
            const productPrice = productData?.price || item.price;
            const productImage = productData?.image_url ? getProductImage(productData.image_url) : null;
            
            const existingIndex = cart.findIndex(c => c.id === productId);
            
            if (existingIndex > -1) {
                cart[existingIndex].qty += Number(item.qty || 1);
            } else {
                cart.push({
                    id: productId,
                    name: productName,
                    price: Number(productPrice),
                    image: productImage,
                    qty: Number(item.qty || 1),
                    from_quote: true   // staff-quoted price; not re-priced or stock-checked at checkout
                });
            }
        }

        localStorage.setItem(cartKey, JSON.stringify(cart));
        
        await supabase
            .from('prescriptions')
            .update({ status: 'completed' })
            .eq('id', quoteId);
        
        await syncCartCount();
        await loadCustomerQuotes();
        await syncQuoteCount();

        window.closeModal('customerQuoteModal');
        window.showToast("All items have been added to your cart", 'success', 'Quotation Accepted');
        
    } catch (err) {
        console.error('Accept quotation error:', err);
        window.showToast("Failed to accept quotation: " + err.message, 'error', 'Error');
    } finally {
        if (acceptBtn) {
            acceptBtn.classList.remove('loading');
            acceptBtn.disabled = false;
        }
    }
};

window.rejectQuotation = () => {
    window.openModal('rejectQuoteModal');
};

window.confirmRejectQuotation = async () => {
    const quoteId = currentQuoteId;
    const reason = document.getElementById('rejectionReason')?.value.trim();
    
    if (!quoteId) {
        window.showToast("No quotation selected.", "warning", "Error");
        window.closeModal('rejectQuoteModal');
        return;
    }
    
    try {
        await supabase
            .from('prescriptions')
            .update({ 
                status: 'rejected',
                rejection_reason: reason || 'No reason provided',
                rejected_at: new Date().toISOString()
            })
            .eq('id', quoteId);
        
        await loadCustomerQuotes();
        await syncQuoteCount();
        
        window.closeModal('customerQuoteModal');
        window.closeModal('rejectQuoteModal');
        window.showToast("Quotation rejected successfully.", 'info', 'Quotation Rejected');
        
    } catch (err) {
        console.error('Reject quotation error:', err);
        window.showToast("Failed to reject quotation.", 'error', 'Error');
    }
};

async function loadCustomerQuotes() {
    const listContainer = document.getElementById('customerPrescList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="panel-status">Loading...</div>';

    const user = await safeGetUser();
    if (!user) {
        listContainer.innerHTML = '<div class="empty-state">Please login to view quotes</div>';
        return;
    }

    const { data: quotes, error } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['quotation_sent', 'pending', 'rejected'])
        .order('created_at', { ascending: false });

    if (error || !quotes?.length) {
        listContainer.innerHTML = '<div class="empty-state">📭 No active quotes found.</div>';
        return;
    }

    listContainer.innerHTML = quotes.map(q => {
        let statusLabel = '', statusClass = '';
        
        if (q.status === 'quotation_sent') {
            statusLabel = 'Quotation Ready';
            statusClass = 'status-ready';
        } else if (q.status === 'pending') {
            statusLabel = 'Under Review';
            statusClass = 'status-review';
        } else if (q.status === 'rejected') {
            statusLabel = 'Rejected';
            statusClass = 'status-cancelled';
        }
        
        return `
            <div class="quote-sidebar-card">
                <div class="card-header">
                    <span>${new Date(q.created_at).toLocaleDateString()}</span>
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                </div>
                <div class="card-ref">Ref: #${q.id.slice(0, 8)}</div>
                <div class="card-footer">
                    ${q.status === 'quotation_sent'
                        ? `<button class="primary-btn sm" onclick="viewCustomerQuotation('${q.id}')">View Quotation</button>`
                        : `<button class="secondary-btn sm" disabled>${q.status === 'rejected' ? 'Rejected' : 'Reviewing...'}</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
    
    if (typeof syncQuoteCount === 'function') syncQuoteCount();
}

window.viewCustomerQuotation = async (quoteId) => {
    const detailContainer = document.getElementById('quoteDetailView');
    const panel = document.getElementById('floatingPrescList');
    const grandTotalSpan = document.getElementById('quoteGrandTotal');
    const adminNoteDiv = document.getElementById('quoteAdminNote');
    const adminNoteText = document.getElementById('adminNoteText');
    const generalInstructionsDiv = document.getElementById('quoteGeneralInstructions');
    const generalInstructionsText = document.getElementById('generalInstructionsText');
    
    if (!detailContainer) return;
    
    if (panel) panel.classList.add('hidden');
    
    // Utilize your global class-driven Block 7 configuration
    window.openModal('customerQuoteModal');
    currentQuoteId = quoteId;

    try {
        const { data: quote, error } = await supabase
            .from('prescriptions')
            .select('quoted_items, total_amount, admin_note, general_instructions')
            .eq('id', quoteId)
            .single();

        if (error) throw error;
        
        currentQuoteItems = quote.quoted_items || [];
        
        if (quote.admin_note && adminNoteDiv) {
            adminNoteText.textContent = quote.admin_note;
            adminNoteDiv.classList.remove('hidden');
        } else if (adminNoteDiv) {
            adminNoteDiv.classList.add('hidden');
        }
        
        if (quote.general_instructions && generalInstructionsDiv) {
            generalInstructionsText.textContent = quote.general_instructions;
            generalInstructionsDiv.classList.remove('hidden');
        } else if (generalInstructionsDiv) {
            generalInstructionsDiv.classList.add('hidden');
        }
        
        if (grandTotalSpan) {
            grandTotalSpan.textContent = `ZMW ${Number(quote.total_amount || 0).toFixed(2)}`;
        }

        if (currentQuoteItems.length) {
            detailContainer.innerHTML = currentQuoteItems.map((item, index) => {
                const productId = item.product_id || item.id || '';
                const activeIngredient = item.active_ingredient || '';
                const medicineName = item.name || '';
                
                return `
                    <tr>
                        <td class="medicine-cell">
                            <strong>${escapeHtml(medicineName)}</strong>
                            ${item.dosage_instructions ? `<br><small class="dosage-info">💊 ${escapeHtml(item.dosage_instructions)}</small>` : ''}
                            ${activeIngredient ? `<br><small class="active-ingredient-info">🔬 Active: ${escapeHtml(activeIngredient)}</small>` : ''}
                        </td>
                        <td class="qty-cell">${item.qty || 1}</td>
                        <td class="price-cell">ZMW ${(item.price || 0).toFixed(2)}</td>
                        <td class="total-cell">ZMW ${((item.price || 0) * (item.qty || 1)).toFixed(2)}</td>
                        <td class="action-cell">
                            <button class="sub-btn-sm" onclick="openSubstituteModal('${escapeHtml(medicineName)}', ${index}, '${quoteId}', '${escapeHtml(activeIngredient)}', '${productId}')">
                                🔄 Substitute
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            detailContainer.innerHTML = '<tr><td colspan="5" class="text-center">No items in this quotation.</td></tr>';
        }
    } catch (err) {
        console.error(err);
        detailContainer.innerHTML = '<tr><td colspan="5" class="text-center error-text">Error loading quotation</td></tr>';
    }
};
/* ==========================================================================
   11. SUBSTITUTE MEDICINE FUNCTIONALITY (CLASS-DRIVEN)
   ========================================================================== */
   window.openSubstituteModal = async (medicineName, itemIndex, quoteId, activeIngredient, productId) => {
    const resultsContainer = document.getElementById('substituteResults');
    const medicineNameSpan = document.getElementById('substituteMedicineName');
    
    window.currentSubstitution = { medicineName, itemIndex, quoteId, activeIngredient, originalProductId: productId };
    
    if (medicineNameSpan) {
        medicineNameSpan.innerHTML = activeIngredient && activeIngredient.trim() !== '' 
            ? `${escapeHtml(medicineName)} <span class="active-ingredient-hint">(Active: ${escapeHtml(activeIngredient)})</span>`
            : `${escapeHtml(medicineName)} <span class="active-ingredient-hint">(No active ingredient info)</span>`;
    }
    
    if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="loading-text"><i class="fas fa-spinner fa-spin"></i> Searching for alternatives...</div>';
    }
    
    // Delegate display exclusively to your core modal engine
    window.openModal('substituteModal');
    
    if (activeIngredient && activeIngredient.trim() !== '') {
        await loadSubstitutesByIngredient(activeIngredient, medicineName);
    } else if (productId && productId.trim() !== '') {
        await loadSubstitutesByProductId(productId, medicineName);
    } else if (resultsContainer) {
        resultsContainer.innerHTML = `<div class="no-results"><i class="fas fa-exclamation-triangle"></i><p>No active ingredient information available.</p></div>`;
    }
};

window.loadSubstitutesByIngredient = async (activeIngredient, excludeMedicineName) => {
    const resultsContainer = document.getElementById('substituteResults');
    if (!resultsContainer || !activeIngredient) return;
    
    try {
        const { data: substitutes, error } = await erp
            .from('online_products')
            .select('id, name, brand, active_ingredient, price, image_url')
            .ilike('active_ingredient', `%${activeIngredient.trim()}%`)
            .neq('name', excludeMedicineName)
            .limit(20);
        
        if (error) throw error;
        
        if (substitutes?.length) {
            resultsContainer.innerHTML = `
                <div class="substitute-header-info">
                    <i class="fas fa-flask"></i> 
                    <span>Found <strong>${substitutes.length}</strong> alternative(s) with <strong>"${escapeHtml(activeIngredient)}"</strong></span>
                </div>
                ${substitutes.map(prod => `
                    <div class="substitute-item" onclick="selectSubstituteMedicine('${prod.id}', '${escapeHtml(prod.name)}', ${prod.price}, '${escapeHtml(prod.active_ingredient || activeIngredient)}')">
                        <div class="substitute-info">
                            <span class="substitute-name">${escapeHtml(prod.name)}</span>
                            <span class="substitute-brand">${escapeHtml(prod.brand || 'Generic')}</span>
                        </div>
                        <div class="substitute-price">
                            <span class="price-amount">ZMW ${formatMoney(prod.price)}</span>
                            <button class="select-btn">Select</button>
                        </div>
                    </div>
                `).join('')}
            `;
        } else {
            resultsContainer.innerHTML = `<div class="no-results"><i class="fas fa-search"></i><p>No alternatives found with "${escapeHtml(activeIngredient)}" as active ingredient.</p></div>`;
        }
    } catch (err) {
        console.error('Load substitutes error:', err);
        resultsContainer.innerHTML = '<div class="error-text">Error loading alternatives.</div>';
    }
};

window.loadSubstitutesByProductId = async (productId, excludeMedicineName) => {
    const resultsContainer = document.getElementById('substituteResults');
    if (!resultsContainer) return;
    
    try {
        const { data: originalProduct, error: productError } = await erp
            .from('online_products')
            .select('active_ingredient')
            .eq('id', productId)
            .single();
        
        if (productError || !originalProduct?.active_ingredient) {
            resultsContainer.innerHTML = `<div class="no-results"><i class="fas fa-exclamation-triangle"></i><p>Could not find active ingredient for this medicine.</p></div>`;
            return;
        }
        
        await loadSubstitutesByIngredient(originalProduct.active_ingredient, excludeMedicineName);
    } catch (err) {
        console.error('Load substitutes by product ID error:', err);
        resultsContainer.innerHTML = '<div class="error-text">Error loading alternatives.</div>';
    }
};

window.selectSubstituteMedicine = async (productId, productName, productPrice, activeIngredient) => {
    const { medicineName, itemIndex, quoteId } = window.currentSubstitution;
    
    // Replace browser confirm with custom confirm
    const confirmed = await window.customConfirm(
        `Replace "${medicineName}" with "${productName}"?`,
        'Confirm Substitution',
        'Yes, Substitute',
        'Cancel'
    );
    if (!confirmed) return;
    
    try {
        const { data: quote, error } = await supabase
            .from('prescriptions')
            .select('quoted_items')
            .eq('id', quoteId)
            .single();
        
        if (error) throw error;
        
        let items = [...quote.quoted_items];
        const oldQty = items[itemIndex].qty || 1;
        
        items[itemIndex] = {
            ...items[itemIndex],
            product_id: productId,
            name: productName,
            price: productPrice,
            qty: oldQty,
            active_ingredient: activeIngredient,
            substituted_from: medicineName,
            substituted_at: new Date().toISOString()
        };
        
        const newTotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
        
        const { error: updateError } = await supabase
            .from('prescriptions')
            .update({ quoted_items: items, total_amount: newTotal })
            .eq('id', quoteId);
        
        if (updateError) throw updateError;
        
        window.showToast(`Successfully changed to "${productName}"`, 'success', 'Medicine Substituted');
        window.closeSubstituteModal();
        await viewCustomerQuotation(quoteId);
        
    } catch (err) {
        console.error("Substitution error:", err);
        window.showToast("Failed to substitute medicine.", 'error', 'Substitution Failed');
    }
};

window.closeSubstituteModal = () => {
    window.closeModal('substituteModal');
    window.currentSubstitution = null;
};
/* ==========================================================================
   12. RIDER PORTAL - AUTOMATED SETTLEMENT (TEMPLATE-DRIVEN)
   ========================================================================== */
   window.openRiderPortal = async () => {
    window.openModal('riderModal');
    
    const container = document.getElementById('riderOrdersList');
    const template = document.getElementById('riderTaskTemplate');
    if (!container || !template) return;
    
    const user = await safeGetUser();
    if (!user) return;

    const { data: allRiderOrders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('rider_id', user.id)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error("Error fetching rider tasks:", error);
        container.textContent = "Failed to load delivery tasks.";
        return;
    }

    const activeOrders = allRiderOrders?.filter(o => o.order_status !== 'delivered') || [];
    const activeCount = activeOrders.length;
    const completedCount = allRiderOrders?.filter(o => o.order_status === 'delivered').length || 0;
    
    const activeCountEl = document.getElementById('riderActiveCount');
    const completedCountEl = document.getElementById('riderCompletedCount');
    if (activeCountEl) activeCountEl.textContent = activeCount;
    if (completedCountEl) completedCountEl.textContent = completedCount;

    container.textContent = '';

    if (!activeOrders.length) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'msg-center';
        emptyMsg.textContent = 'No active tasks assigned.';
        container.appendChild(emptyMsg);
        return;
    }

    activeOrders.forEach((order, index) => {
        const cardClone = template.content.cloneNode(true);
        
        const taskIdEl = cardClone.querySelector('.task-id');
        const statusEl = cardClone.querySelector('.status-badge-rider');
        const addressEl = cardClone.querySelector('.task-address');
        const totalEl = cardClone.querySelector('.task-total');
        const customerEl = cardClone.querySelector('.task-customer');
        const phoneEl = cardClone.querySelector('.task-phone');
        const actionsContainer = cardClone.querySelector('.task-card-actions');
        const mapContainer = cardClone.querySelector('.task-map-container');

        const shortId = order.id ? order.id.slice(0, 8).toUpperCase() : 'UNKNOWN';
        const rawTotal = order.total !== undefined && order.total !== null ? order.total : 0;
        const currentStatus = order.order_status || 'pending';
        const payMethod = (order.payment_method || 'cod').toLowerCase();
        const payStatus = (order.payment_status || 'pending').toLowerCase();

        if (taskIdEl) taskIdEl.textContent = `#${shortId}`;
        if (statusEl) {
            statusEl.textContent = currentStatus.replace(/_/g, ' ');
            statusEl.classList.add(currentStatus);
        }

        if (addressEl) addressEl.textContent = `📍 ${order.delivery_address || 'No Address Provided'}`;
        if (customerEl) customerEl.textContent = `👤 Customer: ${order.customer_name || 'N/A'}`;
        if (phoneEl) phoneEl.textContent = `📞 Phone: ${order.customer_phone || 'N/A'}`;

        if (totalEl) {
            let payLabel = payStatus === 'paid' ? '🟢 PAID' : (payMethod === 'cod' ? '💵 UNPAID (COLLECT CASH)' : '⚠️ UNPAID DIGITAL');
            totalEl.textContent = `💰 Total: ZMW ${parseFloat(rawTotal).toFixed(2)} (${payLabel})`;
        }

        // --- Map for this order ---
        if (mapContainer && order.delivery_lat && order.delivery_lng) {
            const mapId = `riderMap_${order.id}`;
            
            mapContainer.innerHTML = `
                <div id="${mapId}" class="rider-task-map"></div>
                <div class="map-distance-info">
                    <i class="fas fa-route"></i> Distance: ${order.delivery_distance_km ? order.delivery_distance_km.toFixed(1) : 'N/A'} km from store
                </div>
            `;
            
            setTimeout(() => {
                initRiderTaskMap(mapId, order.delivery_lat, order.delivery_lng, order.delivery_address);
            }, 200 + (index * 100));
        } else if (mapContainer) {
            mapContainer.innerHTML = `
                <div class="map-error">
                    <i class="fas fa-map-marked-alt"></i>
                    <span>No location data available</span>
                </div>
            `;
        }

        // --- Action Buttons with Navigation ---
        if (actionsContainer) {
            actionsContainer.innerHTML = '';
            
            if (order.delivery_lat && order.delivery_lng) {
                const navigateBtn = document.createElement('button');
                navigateBtn.className = 'btn-navigate';
                navigateBtn.innerHTML = '<i class="fas fa-directions"></i> Navigate';
                navigateBtn.addEventListener('click', () => {
                    window.updateRiderStatusAndNavigate(order.id, order.delivery_lat, order.delivery_lng, order.delivery_address);
                });
                actionsContainer.appendChild(navigateBtn);
            }
            
            if (currentStatus === 'ready_for_pickup') {
                const pickupBtn = document.createElement('button');
                pickupBtn.className = 'btn-pickup';
                pickupBtn.innerHTML = '<i class="fas fa-box-open"></i> Start Delivery';
                pickupBtn.addEventListener('click', () => window.updateRiderStatus(order.id, 'out_for_delivery'));
                actionsContainer.appendChild(pickupBtn);
            } else if (currentStatus === 'out_for_delivery') {
                const deliveredBtn = document.createElement('button');
                deliveredBtn.className = 'btn-delivered';
                deliveredBtn.innerHTML = '<i class="fas fa-check-circle"></i> Mark Delivered';
                deliveredBtn.addEventListener('click', () => window.updateRiderStatus(order.id, 'delivered'));
                actionsContainer.appendChild(deliveredBtn);
            }
            
            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn-view';
            viewBtn.innerHTML = '<i class="fas fa-file-invoice"></i> Invoice';
            viewBtn.addEventListener('click', () => {
                window.closeModal('riderModal');
                setTimeout(() => {
                    window.viewOrderInvoice(order.id);
                }, 300);
            });
            actionsContainer.appendChild(viewBtn);
        }

        container.appendChild(cardClone);
    });
};

// --- Update status and navigate together ---
window.updateRiderStatusAndNavigate = async (orderId, destLat, destLng, destAddress) => {
    try {
        const updateData = { 
            order_status: 'out_for_delivery', 
            rider_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase.from('orders').update(updateData).eq('id', orderId);
        if (error) throw error;
        
        window.showToast('📍 Order status updated to Out for Delivery!', 'success', 'Started Delivery');
        
        window.closeModal('riderModal');
        
        setTimeout(() => {
            window.openNavigation(destLat, destLng, destAddress);
        }, 500);
        
    } catch (err) {
        console.error('Error updating status:', err);
        window.showToast('Failed to update status. Please try again.', 'error', 'Error');
    }
};

// --- Function to initialize rider task map ---
function initRiderTaskMap(mapId, lat, lng, address) {
    const mapContainer = document.getElementById(mapId);
    if (!mapContainer) return;
    
    if (typeof L === 'undefined') {
        console.error('Leaflet not loaded');
        mapContainer.innerHTML = `
            <div class="map-error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Map library not loaded</span>
            </div>
        `;
        return;
    }
    
    try {
        const STORE_COORDINATES = { lat: -15.4167, lng: 28.2833 };
        
        const map = L.map(mapId, {
            center: [lat, lng],
            zoom: 14,
            scrollWheelZoom: false,
            zoomControl: true,
            attributionControl: true
        });
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> & CartoDB',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);
        
        const customerIcon = L.divIcon({
            className: 'customer-marker-icon',
            html: '📍',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        
        const customerMarker = L.marker([lat, lng], {
            icon: customerIcon,
            draggable: false
        }).addTo(map);
        
        const safeAddress = (address || '').replace(/"/g, '&quot;');
        
        customerMarker.bindPopup(`
            <b>📍 Customer Location</b><br>
            ${address || 'Delivery Location'}<br>
            <button onclick="window.openExternalMaps(${lat}, ${lng}, '${safeAddress}')" 
                style="padding:6px 12px;background:#1a5c3a;color:white;border:none;border-radius:4px;cursor:pointer;margin-top:6px;width:100%;">
                <i class="fas fa-directions"></i> Navigate
            </button>
        `).openPopup();
        
        L.circle([lat, lng], {
            radius: 50,
            color: '#ef4444',
            fillColor: '#fca5a5',
            fillOpacity: 0.15,
            weight: 2
        }).addTo(map);
        
        const storeIcon = L.divIcon({
            className: 'store-marker-icon',
            html: '🏪',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        
        L.marker([STORE_COORDINATES.lat, STORE_COORDINATES.lng], {
            icon: storeIcon
        }).addTo(map).bindPopup('<b>🏪 Griffins Medicals</b><br>Store Location');
        
        L.polyline([
            [STORE_COORDINATES.lat, STORE_COORDINATES.lng],
            [lat, lng]
        ], {
            color: '#3b82f6',
            weight: 2,
            dashArray: '5, 10',
            opacity: 0.6
        }).addTo(map);
        
        const bounds = L.latLngBounds([
            [STORE_COORDINATES.lat, STORE_COORDINATES.lng],
            [lat, lng]
        ]);
        map.fitBounds(bounds, { padding: [50, 50] });
        
        mapContainer._map = map;
        
        setTimeout(() => {
            map.invalidateSize();
        }, 300);
        
        console.log(`✅ Map initialized for order: ${mapId}`);
        
    } catch (err) {
        console.error('Error initializing rider map:', err);
        mapContainer.innerHTML = `
            <div class="map-error">
                <i class="fas fa-map-marked-alt"></i>
                <span>Could not load map</span>
            </div>
        `;
    }
}

// Make functions globally available
window.initRiderTaskMap = initRiderTaskMap;

window.updateRiderStatus = async (id, nextStatus) => {
    if (!id) return;
    
    const updateData = { order_status: nextStatus, updated_at: new Date().toISOString() };
    if (nextStatus === 'out_for_delivery') updateData.rider_started_at = new Date().toISOString();
    
    if (nextStatus === 'delivered') {
        updateData.actual_delivery_time = new Date().toISOString();
        updateData.payment_status = 'paid';
    }
    
    const { error } = await supabase.from('orders').update(updateData).eq('id', id);
    if (error) {
        window.showToast("Error updating status: " + error.message, 'error', 'Update Failed');
    } else {
        const successMessage = nextStatus === 'delivered' 
            ? 'Order delivered & payment marked as PAID automatically!' 
            : `Order status updated to ${nextStatus.replace(/_/g, ' ')}`;
            
        window.showToast(successMessage, 'success', 'Status Updated');
        window.openRiderPortal();
    }
};
/* ==========================================================================
   13. ORDER TRACKING & TAX INVOICE ENGINE - TEMPLATE DRIVEN
   ========================================================================== */
   const trackingStatusConfig = {
    pending: { label: 'Order Placed', class: 'status-pending', step: 1 },
    processing: { label: 'Processing', class: 'status-processing', step: 2 },
    ready_for_pickup: { label: 'Ready for Pickup', class: 'status-ready', step: 3 },
    out_for_delivery: { label: 'Out for Delivery', class: 'status-out-for-delivery', step: 4 },
    delivered: { label: 'Delivered', class: 'status-delivered', step: 5 },
    cancelled: { label: 'Cancelled', class: 'status-cancelled', step: 0 }
};

// Tab Controller Engine
window.initializeTrackingTabs = () => {
    const activeTabBtn = document.querySelector('.order-tab[data-tab="active"]');
    const historyTabBtn = document.querySelector('.order-tab[data-tab="history"]');
    const activeContainer = document.getElementById('activeOrdersContainer');
    const historyContainer = document.getElementById('historyOrdersContainer');

    if (!activeTabBtn || !historyTabBtn || !activeContainer || !historyContainer) return;

    // Remove any previously bound event listener instances safely
    const newActiveBtn = activeTabBtn.cloneNode(true);
    const newHistoryBtn = historyTabBtn.cloneNode(true);
    activeTabBtn.parentNode.replaceChild(newActiveBtn, activeTabBtn);
    historyTabBtn.parentNode.replaceChild(newHistoryBtn, historyTabBtn);

    // Default Initialization State
    newActiveBtn.classList.add('active');
    newHistoryBtn.classList.remove('active');
    activeContainer.style.display = 'block';
    historyContainer.style.display = 'none';

    newActiveBtn.addEventListener('click', () => {
        newActiveBtn.classList.add('active');
        newHistoryBtn.classList.remove('active');
        activeContainer.style.display = 'block';
        historyContainer.style.display = 'none';
    });

    newHistoryBtn.addEventListener('click', () => {
        newHistoryBtn.classList.add('active');
        newActiveBtn.classList.remove('active');
        historyContainer.style.display = 'block';
        activeContainer.style.display = 'none';
    });
};

window.loadUserOrdersForTracking = async () => {
    const user = await safeGetUser();
    if (!user) return [];
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        return orders || [];
    } catch (err) {
        console.error("Error loading tracking data:", err);
        return [];
    }
};

window.renderTrackingBoxes = (orders) => {
    const activeBox = document.getElementById('activeOrdersContainer');
    const historyBox = document.getElementById('historyOrdersContainer');
    const activeTemplate = document.getElementById('trackingActiveCardTemplate');
    const historyTemplate = document.getElementById('trackingHistoryItemTemplate');

    if (!activeBox || !historyBox || !activeTemplate || !historyTemplate) return;

    const validatedOrders = Array.isArray(orders) ? orders : [];
    
    const activeItems = validatedOrders.filter(o => {
        const status = (o.order_status || '').toLowerCase().trim();
        return status !== 'delivered' && status !== 'cancelled' && status !== '';
    });
    
    const historyItems = validatedOrders.filter(o => {
        const status = (o.order_status || '').toLowerCase().trim();
        return status === 'delivered' || status === 'cancelled';
    });

    activeBox.textContent = '';
    historyBox.textContent = '';

    // 1. Process Active Deliveries Queue
    if (!activeItems.length) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-msg';
        emptyMsg.textContent = '🎉 No active deliveries.';
        activeBox.appendChild(emptyMsg);
    } else {
        activeItems.forEach(order => {
            const clone = activeTemplate.content.cloneNode(true);
            const orderStatus = (order.order_status || 'pending').toLowerCase().trim();
            const statusInfo = trackingStatusConfig[orderStatus] || trackingStatusConfig.pending;
            const progressPercent = (statusInfo.step / 5) * 100;

            clone.querySelector('.order-id-badge').textContent = `#${(order.id || '').slice(0, 8).toUpperCase()}`;
            clone.querySelector('.order-date').textContent = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';
            
            const badge = clone.querySelector('.order-status-badge');
            badge.textContent = statusInfo.label;
            badge.className = `order-status-badge ${statusInfo.class}`;

            const fillElement = clone.querySelector('.progress-bar-fill');
            if (fillElement) {
                fillElement.setAttribute('data-progress', progressPercent);
                fillElement.style.setProperty('--progress-width', `${progressPercent}%`);
            }
            
            clone.querySelector('.order-total-val').textContent = `Total: ZMW ${parseFloat(order.total || 0).toFixed(2)}`;
            clone.querySelector('.order-address-val').textContent = `Address: ${order.delivery_address || 'Store Pickup'}`;

            clone.querySelector('.tracking-invoice-btn').addEventListener('click', () => window.viewOrderInvoice(order.id));

            if (orderStatus === 'pending') {
                const actionsDiv = clone.querySelector('.tracking-order-actions');
                if (actionsDiv) {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'cancel-order-btn';
                    cancelBtn.textContent = 'Cancel Order';
                    cancelBtn.addEventListener('click', () => window.cancelOrder(order.id));
                    actionsDiv.appendChild(cancelBtn);
                }
            }

            activeBox.appendChild(clone);
        });
    }

    // 2. Process Historical Archive Queue
    if (!historyItems.length) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-msg';
        emptyMsg.textContent = 'No order history found.';
        historyBox.appendChild(emptyMsg);
    } else {
        historyItems.forEach(order => {
            const clone = historyTemplate.content.cloneNode(true);
            const orderStatus = (order.order_status || 'delivered').toLowerCase().trim();
            const statusInfo = trackingStatusConfig[orderStatus] || trackingStatusConfig.delivered;

            clone.querySelector('.history-order-id').textContent = `#${(order.id || '').slice(0, 8).toUpperCase()}`;
            clone.querySelector('.history-order-date').textContent = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';
            
            const badge = clone.querySelector('.order-status-badge');
            if (badge) {
                badge.textContent = statusInfo.label;
                badge.className = `order-status-badge ${statusInfo.class}`;
            }

            clone.querySelector('.history-total-val').textContent = `Total: ZMW ${parseFloat(order.total || 0).toFixed(2)}`;
            clone.querySelector('.history-invoice-btn').addEventListener('click', () => window.viewOrderInvoice(order.id));

            historyBox.appendChild(clone);
        });
    }
};

window.cancelOrder = async (orderId) => {
    if (!orderId) return;
    // Replace browser confirm with custom confirm
    const confirmed = await window.customConfirm(
        'Are you sure you want to cancel this order?',
        'Cancel Order',
        'Yes, Cancel',
        'No, Keep'
    );
    if (!confirmed) return;
    
    const { error } = await supabase
        .from('orders')
        .update({ 
            order_status: 'cancelled', 
            updated_at: new Date().toISOString() 
        })
        .eq('id', orderId);
    
    if (error) {
        window.showToast("Error cancelling order: " + error.message, 'error', 'Action Failed');
    } else {
        window.showToast("Order cancelled successfully.", 'success', 'Order Updated');
        if (typeof window.openTrackingModal === 'function') {
            window.openTrackingModal();
        }
    }
};

window.viewOrderInvoice = async (orderId) => {
    if (!orderId) return;
    try {
        const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (error || !order) {
            window.showToast("Order invoice data could not be found.", "error", "Not Found");
            return;
        }

        const items = Array.isArray(order.items) ? order.items : [];
        const subtotal = typeof order.subtotal === 'number' ? order.subtotal : items.reduce((s, i) => s + ((i.price || 0) * (i.qty || 1)), 0);
        const deliveryFee = parseFloat(order.delivery_charge || 0);
        const total = parseFloat(order.total || (subtotal + deliveryFee));
        
        const isPaid = (order.payment_status || '').toLowerCase() === 'paid';
        const orderStatus = (order.order_status || 'pending').toLowerCase().trim();
        const statusInfo = trackingStatusConfig[orderStatus] || trackingStatusConfig.pending;

        // Build the invoice HTML - Same as admin
        const invoiceHtml = `
            <div class="invoice-paper">
                <div class="invoice-paper-header">
                    <div class="invoice-logo-section">
                        <h1>GRIFFINS MEDICALS LIMITED</h1>
                        <p>Plot 3534, Freedomway, Lusaka, Zambia</p>
                        <p>Tel: +260 970 000 000 | Email: info@griffinsmeds.com</p>
                        <p>TPIN: 1001643378 | License: ZAMRA23/PHAR/0792</p>
                    </div>
                    <div class="invoice-title-section">
                        <h2>TAX INVOICE</h2>
                        <div class="invoice-number">Invoice #${order.id.slice(0, 12).toUpperCase()}</div>
                    </div>
                </div>
                
                <div class="invoice-paper-customer">
                    <div class="invoice-bill-to">
                        <strong>BILL TO:</strong>
                        <p>${escapeHtml(order.customer_name || 'Customer')}</p>
                        <p>${escapeHtml(order.delivery_address || 'Store Pickup')}</p>
                        <p>Phone: ${order.customer_phone || 'N/A'}</p>
                    </div>
                    <div class="invoice-details">
                        <div><strong>Invoice Date:</strong> ${order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}</div>
                        <div><strong>Order Status:</strong> <span class="status-badge-small ${statusInfo.class}">${statusInfo.label}</span></div>
                        <div><strong>Payment Status:</strong> <span class="status-badge-small ${isPaid ? 'status-delivered' : 'status-pending'}">${isPaid ? 'PAID' : 'PENDING'}</span></div>
                    </div>
                </div>
                
                <table class="invoice-paper-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Description</th>
                            <th class="text-center">QTY</th>
                            <th class="text-right">Unit Price (ZMW)</th>
                            <th class="text-right">Total (ZMW)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, index) => `
                            <tr>
                                <td class="text-center">${index + 1}</td>
                                <td><strong>${escapeHtml(item.name || 'Unknown Item')}</strong></td>
                                <td class="text-center">${item.qty || 1}</td>
                                <td class="text-right">${parseFloat(item.price || 0).toFixed(2)}</td>
                                <td class="text-right">${parseFloat((item.price || 0) * (item.qty || 1)).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                        ${!items.length ? '<tr><td colspan="5" class="text-center">No items found</td></tr>' : ''}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="4" class="text-right"><strong>Subtotal:</strong></td>
                            <td class="text-right"><strong>${subtotal.toFixed(2)}</strong></td>
                        </tr>
                        <tr>
                            <td colspan="4" class="text-right"><strong>Delivery Fee:</strong></td>
                            <td class="text-right"><strong>${deliveryFee.toFixed(2)}</strong></td>
                        </tr>
                        <tr class="invoice-grand-total">
                            <td colspan="4" class="text-right"><strong>GRAND TOTAL:</strong></td>
                            <td class="text-right"><strong>ZMW ${total.toFixed(2)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
                
                <div class="invoice-paper-footer">
                    <p>Thank you for choosing Griffins Medicals!</p>
                    <p class="invoice-note">This is a computer-generated invoice. No signature required.</p>
                    <div class="payment-details">
                        <small>Payment: ${isPaid ? '✓ Paid' : 'Payment due on delivery'}</small>
                    </div>
                </div>
            </div>
        `;

        const invoiceContent = document.getElementById('invoiceContent');
        if (invoiceContent) {
            invoiceContent.innerHTML = invoiceHtml;
        }

        const invoiceModal = document.getElementById('invoiceModal');
        if (invoiceModal) {
            invoiceModal.classList.add('active');
            invoiceModal.style.display = 'flex';
        }
    } catch (err) {
        console.error("Invoice compilation error:", err);
        window.showToast("Error generating compliance invoice layout.", "error", "Error");
    }
};

window.closeInvoiceViewModal = function() {
    const modal = document.getElementById('invoiceModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
};

window.printInvoiceView = function() {
    const invoiceContent = document.getElementById('invoiceContent');
    if (!invoiceContent) return;
    
    const invoiceHTML = invoiceContent.innerHTML;
    if (!invoiceHTML || invoiceHTML.includes('Loading invoice') || invoiceHTML.includes('No items found')) {
        window.showToast('Please wait for invoice to load before printing.', 'warning');
        return;
    }

    // Check if on mobile app (Capacitor)
    const isMobileApp = window.Capacitor && Capacitor.isNativePlatform();
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isMobile = isMobileApp || isMobileDevice;

    if (isMobile) {
        // MOBILE APP: Create a full-screen overlay with print button
        const overlay = document.createElement('div');
        overlay.id = 'printOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            z-index: 9999999;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 16px;
            padding-bottom: 100px;
            display: block;
        `;
        
        overlay.innerHTML = `
            <style>
                .print-paper {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    background: white;
                    font-family: 'Inter', Arial, sans-serif;
                }
                .print-paper .invoice-paper-header {
                    text-align: center;
                    margin-bottom: 2rem;
                    padding-bottom: 1rem;
                    border-bottom: 2px solid #2d6a4f;
                }
                .print-paper .invoice-logo-section h1 {
                    color: #2d6a4f;
                    font-size: 1.3rem;
                    margin-bottom: 0.5rem;
                }
                .print-paper .invoice-logo-section p {
                    color: #64748b;
                    font-size: 0.7rem;
                    margin: 0.2rem 0;
                }
                .print-paper .invoice-title-section h2 {
                    font-size: 1.1rem;
                    color: #1e293b;
                    margin-top: 1rem;
                }
                .print-paper .invoice-number {
                    font-family: monospace;
                    font-size: 0.8rem;
                    color: #64748b;
                    background: #f1f5f9;
                    display: inline-block;
                    padding: 0.2rem 1rem;
                    border-radius: 50px;
                    margin-top: 0.3rem;
                }
                .print-paper .invoice-paper-customer {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 1.5rem;
                    padding: 1rem;
                    background: #f8fafc;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    flex-wrap: wrap;
                    gap: 1rem;
                }
                .print-paper .invoice-bill-to p {
                    margin: 0.2rem 0;
                    font-size: 0.8rem;
                    color: #475569;
                }
                .print-paper .invoice-details div {
                    margin: 0.3rem 0;
                    font-size: 0.8rem;
                    color: #475569;
                }
                .print-paper .invoice-details div strong {
                    color: #1e293b;
                }
                .print-paper .invoice-paper-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 1.5rem;
                }
                .print-paper .invoice-paper-table th {
                    background: #f1f5f9;
                    padding: 0.8rem;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #334155;
                    text-transform: uppercase;
                    border-bottom: 2px solid #cbd5e1;
                }
                .print-paper .invoice-paper-table td {
                    padding: 0.8rem;
                    border-bottom: 1px solid #e2e8f0;
                    font-size: 0.85rem;
                }
                .print-paper .invoice-paper-table .text-center { text-align: center; }
                .print-paper .invoice-paper-table .text-right { text-align: right; }
                .print-paper .invoice-grand-total {
                    background: #f1f5f9;
                    font-weight: 700;
                }
                .print-paper .invoice-grand-total td {
                    border-top: 2px solid #cbd5e1;
                    font-size: 1rem;
                }
                .print-paper .invoice-paper-footer {
                    text-align: center;
                    margin-top: 2rem;
                    padding-top: 1rem;
                    border-top: 1px solid #e2e8f0;
                }
                .print-paper .invoice-paper-footer p {
                    color: #64748b;
                    font-size: 0.7rem;
                    margin: 0.2rem 0;
                }
                .print-paper .invoice-paper-footer .payment-details {
                    margin-top: 0.5rem;
                    padding-top: 0.5rem;
                    border-top: 1px dashed #e2e8f0;
                }
                .print-paper .status-badge-small {
                    display: inline-block;
                    padding: 0.2rem 0.8rem;
                    border-radius: 50px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .print-paper .status-badge-small.status-delivered {
                    background: #d1fae5;
                    color: #10b981;
                }
                .print-paper .status-badge-small.status-pending {
                    background: #fef3c7;
                    color: #f59e0b;
                }
                .print-paper .status-badge-small.status-processing {
                    background: #dbeafe;
                    color: #3b82f6;
                }
                .print-paper .status-badge-small.status-cancelled {
                    background: #fee2e2;
                    color: #ef4444;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .print-footer {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: white;
                    padding: 16px 20px;
                    border-top: 2px solid #e2e8f0;
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    z-index: 10;
                    box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
                }
                .print-footer button {
                    padding: 14px 28px;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    min-width: 140px;
                    touch-action: manipulation;
                }
                .btn-download-pdf {
                    background: #1a5c3a;
                    color: white;
                }
                .btn-download-pdf:hover {
                    background: #2d6a4f;
                }
                .btn-download-pdf:active {
                    transform: scale(0.96);
                }
                .btn-close-print {
                    background: #e2e8f0;
                    color: #334155;
                }
                .btn-close-print:hover {
                    background: #cbd5e1;
                }
                .btn-close-print:active {
                    transform: scale(0.96);
                }
                .mobile-toast {
                    position: fixed;
                    bottom: 100px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #1e293b;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-size: 14px;
                    z-index: 20;
                    max-width: 90%;
                    text-align: center;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    animation: slideUpToast 0.5s ease;
                }
                .mobile-toast i {
                    margin-right: 8px;
                    color: #fbbf24;
                }
                @keyframes slideUpToast {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes fadeOutToast {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color-adjust: exact !important;
                }
                @media print {
                    .print-footer { display: none !important; }
                    .mobile-toast { display: none !important; }
                    body { padding: 0 !important; }
                    .print-paper { padding: 0.5in !important; }
                }
                @media (max-width: 600px) {
                    .print-paper .invoice-paper-customer { flex-direction: column; }
                    .print-footer button { flex: 1; min-width: 100px; padding: 12px 16px; font-size: 14px; }
                    .print-paper { padding: 12px; }
                    .print-paper .invoice-paper-table { font-size: 12px; }
                    .print-paper .invoice-paper-table th,
                    .print-paper .invoice-paper-table td { padding: 6px 4px; }
                }
            </style>
            <div class="print-paper">
                ${invoiceHTML}
            </div>
            <div class="print-footer">
                <button class="btn-download-pdf" onclick="downloadPDF()">
                    <i class="fas fa-file-pdf"></i> Save as PDF
                </button>
                <button class="btn-close-print" onclick="closePrintOverlay()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        
        let toastTimeout = null;
        
        function showMobileToast(message, isPermanent = false) {
            const existingToast = document.querySelector('.mobile-toast');
            if (existingToast) existingToast.remove();
            
            if (toastTimeout) {
                clearTimeout(toastTimeout);
                toastTimeout = null;
            }
            
            const toast = document.createElement('div');
            toast.className = 'mobile-toast';
            toast.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
            overlay.appendChild(toast);
            
            if (!isPermanent) {
                toastTimeout = setTimeout(() => {
                    if (toast && toast.parentNode) {
                        toast.style.animation = 'fadeOutToast 0.5s ease';
                        setTimeout(() => {
                            if (toast && toast.parentNode) toast.remove();
                        }, 500);
                    }
                    toastTimeout = null;
                }, 4000);
            }
        }
        
        window.downloadPDF = function() {
            showMobileToast('📄 Preparing your invoice...', true);
            
            setTimeout(() => {
                const existingToast = document.querySelector('.mobile-toast');
                if (existingToast) existingToast.remove();
                
                window.print();
                
                setTimeout(() => {
                    showMobileToast('📄 Select "Save as PDF" to download your invoice', false);
                }, 500);
            }, 500);
        };
        
        window.closePrintOverlay = function() {
            const el = document.getElementById('printOverlay');
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
            document.body.style.overflow = '';
            document.removeEventListener('keydown', escHandler);
            window.removeEventListener('popstate', closePrintOverlay);
            if (toastTimeout) {
                clearTimeout(toastTimeout);
                toastTimeout = null;
            }
            delete window.downloadPDF;
            delete window.closePrintOverlay;
        };
        
        setTimeout(() => {
            showMobileToast('📄 Tap "Save as PDF" to download your invoice', false);
        }, 500);
        
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closePrintOverlay();
            }
        };
        document.addEventListener('keydown', escHandler);
        window.addEventListener('popstate', closePrintOverlay);
        
        window.onafterprint = function() {
            setTimeout(() => {
                showMobileToast('✅ Invoice saved! You can find it in your Downloads folder.', false);
            }, 500);
        };
        
    } else {
        // DESKTOP: Use the existing overlay with Print and Close buttons
        const printDiv = document.createElement('div');
        printDiv.id = 'printArea';
        printDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            z-index: 999999;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 16px;
            padding-bottom: 100px;
            display: none;
        `;
        
        printDiv.innerHTML = `
            <style>
                .invoice-print-paper {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    background: white;
                }
                .invoice-print-paper .invoice-paper-header {
                    text-align: center;
                    margin-bottom: 2rem;
                    padding-bottom: 1rem;
                    border-bottom: 2px solid #2d6a4f;
                }
                .invoice-print-paper .invoice-logo-section h1 {
                    color: #2d6a4f;
                    font-size: 1.3rem;
                    margin-bottom: 0.5rem;
                }
                .invoice-print-paper .invoice-logo-section p {
                    color: #64748b;
                    font-size: 0.7rem;
                    margin: 0.2rem 0;
                }
                .invoice-print-paper .invoice-title-section h2 {
                    font-size: 1.1rem;
                    color: #1e293b;
                    margin-top: 1rem;
                }
                .invoice-print-paper .invoice-number {
                    font-family: monospace;
                    font-size: 0.8rem;
                    color: #64748b;
                    background: #f1f5f9;
                    display: inline-block;
                    padding: 0.2rem 1rem;
                    border-radius: 50px;
                    margin-top: 0.3rem;
                }
                .invoice-print-paper .invoice-paper-customer {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 1.5rem;
                    padding: 1rem;
                    background: #f8fafc;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    flex-wrap: wrap;
                    gap: 1rem;
                }
                .invoice-print-paper .invoice-bill-to p {
                    margin: 0.2rem 0;
                    font-size: 0.8rem;
                    color: #475569;
                }
                .invoice-print-paper .invoice-details div {
                    margin: 0.3rem 0;
                    font-size: 0.8rem;
                    color: #475569;
                }
                .invoice-print-paper .invoice-details div strong {
                    color: #1e293b;
                }
                .invoice-print-paper .invoice-paper-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 1.5rem;
                }
                .invoice-print-paper .invoice-paper-table th {
                    background: #f1f5f9;
                    padding: 0.8rem;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #334155;
                    text-transform: uppercase;
                    border-bottom: 2px solid #cbd5e1;
                }
                .invoice-print-paper .invoice-paper-table td {
                    padding: 0.8rem;
                    border-bottom: 1px solid #e2e8f0;
                    font-size: 0.85rem;
                }
                .invoice-print-paper .invoice-paper-table .text-center { text-align: center; }
                .invoice-print-paper .invoice-paper-table .text-right { text-align: right; }
                .invoice-print-paper .invoice-grand-total {
                    background: #f1f5f9;
                    font-weight: 700;
                }
                .invoice-print-paper .invoice-grand-total td {
                    border-top: 2px solid #cbd5e1;
                    font-size: 1rem;
                }
                .invoice-print-paper .invoice-paper-footer {
                    text-align: center;
                    margin-top: 2rem;
                    padding-top: 1rem;
                    border-top: 1px solid #e2e8f0;
                }
                .invoice-print-paper .invoice-paper-footer p {
                    color: #64748b;
                    font-size: 0.7rem;
                    margin: 0.2rem 0;
                }
                .invoice-print-paper .invoice-paper-footer .payment-details {
                    margin-top: 0.5rem;
                    padding-top: 0.5rem;
                    border-top: 1px dashed #e2e8f0;
                }
                .invoice-print-paper .status-badge-small {
                    display: inline-block;
                    padding: 0.2rem 0.8rem;
                    border-radius: 50px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .invoice-print-paper .status-badge-small.status-delivered {
                    background: #d1fae5;
                    color: #10b981;
                }
                .invoice-print-paper .status-badge-small.status-pending {
                    background: #fef3c7;
                    color: #f59e0b;
                }
                .invoice-print-paper .status-badge-small.status-processing {
                    background: #dbeafe;
                    color: #3b82f6;
                }
                .invoice-print-paper .status-badge-small.status-cancelled {
                    background: #fee2e2;
                    color: #ef4444;
                }
                .print-controls {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: white;
                    padding: 16px 20px;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    z-index: 10;
                    flex-wrap: wrap;
                    box-shadow: 0 -4px 10px rgba(0,0,0,0.05);
                }
                .print-controls button {
                    padding: 14px 28px;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    min-width: 120px;
                }
                .btn-print-action {
                    background: #1a5c3a;
                    color: white;
                }
                .btn-print-action:hover {
                    background: #2d6a4f;
                }
                .btn-close-action {
                    background: #e2e8f0;
                    color: #334155;
                }
                .btn-close-action:hover {
                    background: #cbd5e1;
                }
                * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color-adjust: exact !important;
                }
                @media print {
                    .print-controls { display: none !important; }
                    body { padding: 0 !important; }
                    .invoice-print-paper { padding: 0.5in !important; }
                }
                @media (max-width: 600px) {
                    .invoice-print-paper .invoice-paper-customer { flex-direction: column; }
                    .print-controls button { flex: 1; min-width: 80px; padding: 12px 16px; font-size: 14px; }
                    .invoice-print-paper { padding: 12px; }
                    .invoice-print-paper .invoice-paper-table { font-size: 12px; }
                    .invoice-print-paper .invoice-paper-table th,
                    .invoice-print-paper .invoice-paper-table td { padding: 6px 4px; }
                }
            </style>
            <div class="invoice-print-paper">
                ${invoiceHTML}
            </div>
            <div class="print-controls">
                <button class="btn-print-action" onclick="triggerDesktopPrint()">
                    <i class="fas fa-print"></i> Print
                </button>
                <button class="btn-close-action" onclick="closeDesktopPrint()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        `;
        
        document.body.appendChild(printDiv);
        printDiv.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        window.triggerDesktopPrint = function() {
            window.print();
        };
        
        window.closeDesktopPrint = function() {
            const el = document.getElementById('printArea');
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
            document.body.style.overflow = '';
            document.removeEventListener('keydown', escHandler);
            delete window.triggerDesktopPrint;
            delete window.closeDesktopPrint;
        };
        
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closeDesktopPrint();
            }
        };
        document.addEventListener('keydown', escHandler);
        window.addEventListener('popstate', closeDesktopPrint);
        
        setTimeout(function() {
            window.print();
        }, 800);
    }
};

/* ==========================================================================
   THIS WEEK'S OFFERS (home page)
   Offers come from the shop database; product name, price and stock from the ERP.
   ========================================================================== */

window.toggleOfferBalloon = function(tile, ev) {
    if (ev) ev.stopPropagation();
    const wasOpen = tile.classList.contains('open');
    document.querySelectorAll('.offer-tile.open').forEach(t => t.classList.remove('open'));
    if (!wasOpen) tile.classList.add('open');
};
document.addEventListener('click', (e) => {
    if (!e.target.closest('.offer-tile')) document.querySelectorAll('.offer-tile.open').forEach(t => t.classList.remove('open'));
});

async function renderOffers() {
    const section = document.getElementById('offersSection');
    const grid = document.getElementById('offersGrid');
    if (!section || !grid) return;
    try {
        const offers = await fetchActiveOffers();
        if (!offers.length) { section.style.display = 'none'; return; }

        const ids = [...new Set(offers.map(o => String(o.product_id)))];
        const { data: products, error } = await erp.from('online_products').select('id, name, price, in_stock, image_url').in('id', ids);
        if (error) throw error;
        const byId = new Map((products || []).map(p => [String(p.id), p]));

        const cards = offers.map(o => {
            const p = byId.get(String(o.product_id));
            if (!p) return '';   // product no longer on the shop
            const normal = Number(p.price);
            const now = offerPrice(normal, o);
            const soldOut = !p.in_stock;
            const conds = describeConditions(o);
            const img = o.image_url || '';
            const action = soldOut
                ? `<div class="offer-balloon-note">Out of stock right now</div>`
                : (offerHasConditions(o)
                    ? `<div class="offer-balloon-note">Added to your bag automatically when you qualify</div>`
                    : `<button class="offer-balloon-btn" onclick="event.stopPropagation(); addToCart('${p.id}')">Add to Cart</button>`);
            return `
                <div class="offer-tile${soldOut ? ' is-out-of-stock' : ''}" tabindex="0" onclick="toggleOfferBalloon(this, event)">
                    ${img ? `<img class="offer-bg" src="${escapeHtml(img)}" alt="${escapeHtml(o.title)}" loading="lazy" onerror="this.style.display='none'">` : '<div class="offer-bg offer-bg-empty">🎁</div>'}
                    <div class="offer-ribbon">${escapeHtml(offerLabel(o))}</div>
                    <div class="offer-glass">
                        <span class="offer-glass-title">${escapeHtml(o.title)}</span>
                        <button type="button" class="offer-info-btn" aria-label="Offer details" onclick="toggleOfferBalloon(this.closest('.offer-tile'), event)">i</button>
                    </div>
                    <div class="offer-balloon" role="tooltip" onclick="event.stopPropagation()">
                        <p class="offer-balloon-product">${escapeHtml(p.name)}</p>
                        <p class="offer-balloon-price"><b>${now === 0 ? 'FREE' : 'ZMW ' + now.toFixed(2)}</b> <s>ZMW ${normal.toFixed(2)}</s></p>
                        ${conds.length ? `<ul class="offer-conditions">${conds.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
                        ${action}
                    </div>
                </div>`;
        }).filter(Boolean);

        if (!cards.length) { section.style.display = 'none'; return; }
        grid.innerHTML = cards.join('');
        section.style.display = '';
    } catch (err) {
        console.error('Error loading offers:', err);
        section.style.display = 'none';
    }
}
/* ==========================================================================
   14. PRODUCT GRID RENDERING
   ========================================================================== */
async function renderGrid(id, filterCol, filterVal, limitCount = 8) {
    const grid = document.getElementById(id);
    if (!grid) return;

    try {
        const { data, error } = await erp.from('online_products').select('*').eq(filterCol, filterVal).limit(limitCount);
        if (error) throw error;

        if (!data?.length) {
            grid.innerHTML = "<p>No products found.</p>";
            return;
        }

        grid.innerHTML = data.map(p => {
            const displayPrice = p.price;
            let oldPrice = null;
            let discountLabel = '';

            // original price > sale price only when the ERP online price is below cost + 60%
            if (p.original_price && p.original_price > p.price) {
                oldPrice = p.original_price;
                discountLabel = `<div class="discount-badge">${Math.round(((oldPrice - p.price) / oldPrice) * 100)}% OFF</div>`;
            }

            const soldOut = !p.in_stock;

            return `
                <div class="product-card${soldOut ? ' is-out-of-stock' : ''}" onclick="location.href='../product-detail/index.html?id=${p.id}'">
                    ${soldOut ? '<div class="out-of-stock-badge">Out of Stock</div>' : discountLabel}
                    <div class="img-wrapper"><img src="${getProductImage(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='${DEFAULT_PRODUCT_IMAGE}'"></div>
                    <h3>${escapeHtml(p.name)}</h3>
                    <div class="price-box">
                        <span class="current-price">ZMW ${formatMoney(displayPrice)}</span>
                        ${oldPrice ? `<span class="original-price">ZMW ${formatMoney(oldPrice)}</span>` : ''}
                    </div>
                    <div class="pack-size-row">${packLabelHtml(p)}</div>
                    ${soldOut
                        ? `<button class="add-to-cart-btn out-of-stock-btn" disabled onclick="event.stopPropagation()">Out of Stock</button>`
                        : `<button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart('${p.id}')">Add to Cart</button>`}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error(`Error loading ${id}:`, err);
        grid.innerHTML = "<p>Error loading products.</p>";
    }
}

/* ==========================================================================
   15. FEEDBACK & REVIEWS SYSTEM - AUTO PUBLISH (No Admin Approval)
   ========================================================================== */
   let currentRating = 0;

   window.setRating = (rating) => {
       currentRating = rating;
       document.getElementById('feedbackRating').value = rating;
       
       const stars = document.querySelectorAll('.star-rating i');
       stars.forEach((star, index) => {
           if (index < rating) {
               star.className = 'fas fa-star';
               star.style.color = '#fbbf24';
           } else {
               star.className = 'far fa-star';
               star.style.color = '#cbd5e1';
           }
       });
   };
   
   window.openFeedbackModal = () => {
       currentRating = 0;
       document.getElementById('feedbackRating').value = 0;
       document.getElementById('feedbackMessage').value = '';
       document.getElementById('feedbackName').value = '';
       
       const stars = document.querySelectorAll('.star-rating i');
       stars.forEach(star => {
           star.className = 'far fa-star';
           star.style.color = '#cbd5e1';
       });
       
       window.openModal('feedbackModal');
   };
   
   // Submit feedback - AUTO APPROVED (no admin approval needed)
   window.submitFeedback = async () => {
       const message = document.getElementById('feedbackMessage')?.value.trim();
       const name = document.getElementById('feedbackName')?.value.trim();
       const rating = parseInt(document.getElementById('feedbackRating')?.value) || 0;
       
       if (!message) {
           window.showToast("Please write your review", "warning", "Missing Review");
           return;
       }
       
       if (rating === 0) {
           window.showToast("Please select a rating", "warning", "Missing Rating");
           return;
       }
       
       const user = await safeGetUser();
       const displayName = name || user?.email?.split('@')[0] || 'Anonymous';
       
       // AUTO APPROVED - immediately public
       const feedbackData = {
           user_id: user?.id || null,
           user_name: displayName,
           rating: rating,
           message: message,
           type: 'feedback',
           status: 'approved',
           is_public: true,
           created_at: new Date().toISOString()
       };
       
       try {
           const { error } = await supabase.from('feedback').insert([feedbackData]);
           if (error) throw error;
           
           window.showToast("Thank you for your review! It has been published immediately.", "success", "Review Published");
           closeModal('feedbackModal');
           await loadPublicFeedback();
       } catch (err) {
           console.error('Error submitting feedback:', err);
           window.showToast("Failed to submit. Please try again.", "error", "Submission Failed");
       }
   };
   
   // FIXED: Load public feedback with proper sorting - Maximum 15 reviews
   async function loadPublicFeedback() {
       const container = document.getElementById('feedbackList');
       if (!container) return;
       
       const sortBy = document.getElementById('feedbackSortFilter')?.value || 'newest';
       
       try {
           let query = supabase
               .from('feedback')
               .select('*')
               .eq('type', 'feedback')
               .eq('status', 'approved')
               .eq('is_public', true);
           
           // Apply sorting based on selected filter
           if (sortBy === 'newest') {
               query = query.order('created_at', { ascending: false });
           } else if (sortBy === 'oldest') {
               query = query.order('created_at', { ascending: true });
           } else if (sortBy === 'highest') {
               query = query.order('rating', { ascending: false });
           } else if (sortBy === 'lowest') {
               query = query.order('rating', { ascending: true });
           } else {
               query = query.order('created_at', { ascending: false });
           }
           
           // Limit to maximum 15 reviews
           const { data, error } = await query.limit(15);
           if (error) throw error;
           
           if (!data || data.length === 0) {
               container.innerHTML = `
                   <div class="empty-state">
                       <i class="fas fa-star"></i>
                       <p>No reviews yet. Be the first to leave a review!</p>
                   </div>
               `;
               return;
           }
           
           container.innerHTML = data.map(feedback => `
               <div class="feedback-card">
                   <div class="feedback-header">
                       <div class="feedback-user">
                           <i class="fas fa-user-circle"></i>
                           <span class="user-name">${escapeHtml(feedback.user_name || 'Anonymous')}</span>
                       </div>
                       <div class="feedback-rating">${generateStarRating(feedback.rating)}</div>
                   </div>
                   <div class="feedback-message">
                       <p>${escapeHtml(feedback.message)}</p>
                   </div>
                   <div class="feedback-footer">
                       <span class="feedback-date">${formatDate(feedback.created_at)}</span>
                   </div>
               </div>
           `).join('');
           
       } catch (err) {
           console.error('Error loading feedback:', err);
           container.innerHTML = '<div class="error-text">Error loading reviews. Please refresh the page.</div>';
       }
   }
   
   // Make sure the filter dropdown triggers reload
   document.addEventListener('DOMContentLoaded', () => {
       const sortFilter = document.getElementById('feedbackSortFilter');
       if (sortFilter) {
           sortFilter.addEventListener('change', () => {
               loadPublicFeedback();
           });
       }
   });
   
   function generateStarRating(rating) {
       let stars = '';
       for (let i = 1; i <= 5; i++) {
           stars += i <= rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
       }
       return `<div class="stars">${stars}</div>`;
   }
   
   function formatDate(dateString) {
       const date = new Date(dateString);
       const now = new Date();
       const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
       
       if (diffDays === 0) return 'Today';
       if (diffDays === 1) return 'Yesterday';
       if (diffDays < 7) return `${diffDays} days ago`;
       return date.toLocaleDateString();
   }
/* ==========================================================================
   MOBILE DROPDOWN TOGGLE - COMPLETELY REWRITTEN
   ========================================================================== */

// Function to handle mobile dropdown toggles
function initMobileDropdowns() {
    if (window.innerWidth <= 768) {
        const navItems = document.querySelectorAll('.nav-item');
        
        // Remove all existing listeners to avoid duplicates
        navItems.forEach(item => {
            item.removeEventListener('click', handleNavItemClick);
            item.removeEventListener('mouseleave', handleNavItemLeave);
        });
        
        // Add click handler for mobile
        navItems.forEach(item => {
            item.addEventListener('click', handleNavItemClick);
            // Add mouseleave for better UX when moving mouse
            item.addEventListener('mouseleave', handleNavItemLeave);
        });
        
        // Close dropdown when clicking anywhere else
        document.addEventListener('click', closeAllDropdowns);
    } else {
        // On desktop, remove mobile handlers
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.removeEventListener('click', handleNavItemClick);
            item.removeEventListener('mouseleave', handleNavItemLeave);
        });
        document.removeEventListener('click', closeAllDropdowns);
    }
}

// Handle click on nav item
function handleNavItemClick(e) {
    // Prevent event from bubbling
    e.stopPropagation();
    
    const currentItem = this;
    const isActive = currentItem.classList.contains('active');
    
    // Close all dropdowns first
    closeAllDropdowns();
    
    // If current item wasn't active, open it
    if (!isActive) {
        currentItem.classList.add('active');
    }
}

// Handle mouse leave for desktop
function handleNavItemLeave(e) {
    // For touch devices, we don't auto-close on leave
    if (window.innerWidth <= 768) return;
    
    // On desktop, close when mouse leaves
    this.classList.remove('active');
}

// Close all dropdowns
function closeAllDropdowns(e) {
    // If event is passed and clicked element is inside a nav-item, don't close
    if (e && e.target.closest('.nav-item')) {
        return;
    }
    
    const allNavItems = document.querySelectorAll('.nav-item');
    allNavItems.forEach(item => {
        item.classList.remove('active');
    });
}

// Re-initialize on window resize with safety reset
let resizeTimer;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        // Release any lingering mobile touch locks on background content
        document.body.style.overflow = '';
        
        // Rebuild the navigation template seamlessly for the new screen size
        buildDynamicNavigation();
    }, 250);
});
// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initMobileDropdowns();
    
    // Also close dropdowns when pressing Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllDropdowns();
        }
    });
});

// Export for use in other modules if needed
window.closeAllDropdowns = closeAllDropdowns;
/* ==========================================================================
   17. INITIALIZATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Page loading...");
    
    await loadAllMedicines();
    await syncCartCount();
    await syncQuoteCount();
    await syncAuthState();
    await buildDynamicNavigation();
    await loadPublicFeedback();
    initMobileDropdowns(); // Call this here
    
    renderGrid('essentialsGrid', 'health_essentials', true, 10);
    renderGrid('trendingGrid', 'is_trending', true, 10);
    renderGrid('featuredGrid', 'featured_home', true, 10);
    renderOffers();

    setTimeout(() => {
        const steps = document.querySelector('.prescription-steps');
        if (steps) steps.scrollLeft = 0;
    }, 100);  
    console.log("Page fully loaded");
});

// Fix auth state change handler
supabase.auth.onAuthStateChange(() => {
    setTimeout(async () => {
        await syncAuthState();
        await syncCartCount();
        await syncQuoteCount();
        await loadAllMedicines();
    }, 100);
});

// Run on resize
window.addEventListener('resize', initMobileDropdowns);

// Compatibility exports
window.addAllToCart = window.acceptQuotation;
window.addAllQuoteToCart = window.acceptQuotation;
window.viewQuotation = window.viewCustomerQuotation;
window.closeSubstituteModal = window.closeSubstituteModal;