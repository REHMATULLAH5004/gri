import { supabase, erp } from '../../assets/js/supabase-config.js';
import { formatMoney, packLabelHtml } from '../../assets/js/shop-format.js';
import { syncCartCount, addToCart, openAuthModal, getFreshStock, notEnoughStockMessage } from '../home/index.js';

// Re-export for global access (these are already available)
window.addToCart = addToCart;
window.openAuthModal = openAuthModal;
window.showToast = showToast;

/* ==========================================================================
   STUB FOR addDetailedToCart – prevents inline onclick errors
   ========================================================================== */
window.addDetailedToCart = function() {
    if (typeof window._addDetailedToCart === 'function') {
        window._addDetailedToCart();
    } else {
        console.warn('addDetailedToCart not ready yet, retrying...');
        setTimeout(() => {
            if (typeof window._addDetailedToCart === 'function') {
                window._addDetailedToCart();
            } else {
                window.showToast('Page still loading, please try again in a moment', 'warning');
            }
        }, 100);
    }
};

/* ==========================================================================
   1. GLOBAL CONSTANTS
   ========================================================================== */
const PLACEHOLDER_IMAGE = 'https://placehold.co/400x400/f0f0f0/999999?text=No+Image';

function getProductImage(imageUrl) {
    return (imageUrl && imageUrl.trim() !== '') ? imageUrl : PLACEHOLDER_IMAGE;
}

/* ==========================================================================
   2. STATE & URL PARAMS
   ========================================================================== */
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');
let currentProduct = null;

/* ==========================================================================
   3. HELPER FUNCTIONS
   ========================================================================== */
async function safeGetUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) return null;
        return user;
    } catch {
        return null;
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

function showLoadingOverlay(message = 'Loading...') {
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

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

/* ==========================================================================
   4. LOADING & UI STATE MANAGEMENT
   ========================================================================== */
function showLoadingState() {
    const titleEl = document.getElementById('detTitle');
    const brandEl = document.getElementById('detBrand');
    const priceEl = document.getElementById('detPrice');
    const descEl = document.getElementById('detDesc');
    const imgEl = document.getElementById('mainProductImg');
    
    if (titleEl) titleEl.textContent = 'Loading product...';
    if (brandEl) brandEl.textContent = '—';
    if (priceEl) priceEl.innerHTML = '<span class="current-price">Loading...</span>';
    if (descEl) descEl.innerHTML = 'Loading product information...';
    if (imgEl) imgEl.src = PLACEHOLDER_IMAGE;
    
    const similarContainer = document.getElementById('similarProducts');
    const boughtContainer = document.getElementById('boughtTogether');
    
    if (similarContainer) {
        similarContainer.innerHTML = '<div class="loading-spinner">⏳ Loading similar products...</div>';
    }
    if (boughtContainer) {
        boughtContainer.innerHTML = '<div class="loading-spinner">⏳ Loading recommendations...</div>';
    }
}

function showErrorState(message) {
    const container = document.getElementById('productDetail');
    if (container) {
        container.innerHTML = `
            <div class="error-state">
                <h2>⚠️ ${message}</h2>
                <button onclick="location.href='../home/index.html'" class="primary-btn">Return to Shop</button>
            </div>
        `;
    }
}

/* ==========================================================================
   5. CART FUNCTIONS
   ========================================================================== */
async function updateCartCount() {
    const user = await safeGetUser();
    const cartKey = user ? `cart_${user.id}` : 'guest_cart';
    const cart = JSON.parse(localStorage.getItem(cartKey)) || [];
    const totalQty = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
    
    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) cartBtn.textContent = `Cart (${totalQty})`;
}

function showCartNotification() {
    const notify = document.getElementById('cartNotification');
    if (notify) {
        notify.style.display = 'block';
        setTimeout(() => { window.closeNotification(); }, 4000);
    }
}

window.closeNotification = () => {
    const notify = document.getElementById('cartNotification');
    if (notify) notify.style.display = 'none';
};

window.changeQty = function(amount) {
    const qtyInput = document.getElementById('pQty');
    if (!qtyInput) return;
    let newVal = (parseInt(qtyInput.value) || 1) + amount;
    qtyInput.value = newVal < 1 ? 1 : newVal;
};

/* ==========================================================================
   6. PRESCRIPTION UPLOAD MODAL FUNCTIONS
   ========================================================================== */
window.openPrescriptionUploadModal = async (productId, productName) => {
    let modal = document.getElementById('prescriptionModal');
    
    if (!modal) {
        modal = document.createElement('dialog');
        modal.id = 'prescriptionModal';
        modal.className = 'prescription-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <button type="button" class="close-modal-btn" onclick="window.closePrescriptionModal()">&times;</button>
                <h3 id="prescriptionModalTitle">Upload Prescription</h3>
                <p id="prescriptionModalText">Please upload your prescription to continue.</p>
                <form onsubmit="window.handlePrescriptionSubmit(event)">
                    <div class="form-group">
                        <label for="prescRef">Reference Name (Optional)</label>
                        <input type="text" id="prescRef" placeholder="e.g., My Meds - Jan 2026">
                    </div>
                    <div class="form-group">
                        <label for="prescFile">Prescription File</label>
                        <input type="file" id="prescFile" accept="image/*,application/pdf" required>
                        <small>Accepted: JPEG, PNG, PDF (Max 5MB)</small>
                    </div>
                    <input type="hidden" id="targetProductId" value="">
                    <div id="uploadStatus"></div>
                    <div class="modal-actions">
                        <button type="button" class="secondary-btn" onclick="window.closePrescriptionModal()">Cancel</button>
                        <button type="submit" class="primary-btn">Submit Prescription</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const modalTitle = document.getElementById('prescriptionModalTitle');
    const modalText = document.getElementById('prescriptionModalText');
    const hiddenInput = document.getElementById('targetProductId');
    const statusDiv = document.getElementById('uploadStatus');
    const form = modal.querySelector('form');
    
    if (form) form.reset();
    if (statusDiv) {
        statusDiv.innerHTML = '';
        statusDiv.className = '';
    }
    
    if (hiddenInput) hiddenInput.value = productId;
    if (modalTitle) modalTitle.textContent = 'Upload Prescription';
    
    if (modalText && productName) {
        modalText.innerHTML = `Please upload a valid prescription for: <strong>${escapeHtml(productName)}</strong><br><small>Our pharmacist will review your prescription and provide a quotation within 24 hours.</small>`;
    }
    
    if (modal.showModal) {
        modal.showModal();
        document.body.classList.add('modal-open');
    } else {
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
};

window.closePrescriptionModal = () => {
    const modal = document.getElementById('prescriptionModal');
    if (modal) {
        if (modal.close) {
            modal.close();
        } else {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
        document.body.classList.remove('modal-open');
    }
};

window.handlePrescriptionSubmit = async (event) => {
    event.preventDefault();
    
    const fileInput = document.getElementById('prescFile');
    const refInput = document.getElementById('prescRef');
    const productIdInput = document.getElementById('targetProductId');
    const statusDiv = document.getElementById('uploadStatus');
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    const user = await safeGetUser();

    if (!user) {
        window.showToast("Please login first to upload a prescription", "warning", "Login Required");
        openAuthModal();
        window.closePrescriptionModal();
        return;
    }
    
    if (!fileInput?.files[0]) {
        window.showToast("Please select a prescription image or PDF file", "warning", "Missing File");
        return;
    }

    if (statusDiv) {
        statusDiv.innerHTML = '<div class="upload-status uploading">⏳ Uploading prescription...</div>';
    }
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Uploading...';
    }

    try {
        const file = fileInput.files[0];
        const productId = productIdInput?.value || '';
        
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            throw new Error('Please upload a valid image (JPEG, PNG) or PDF file');
        }
        
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('File size must be less than 5MB');
        }
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('prescriptions')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('prescriptions')
            .getPublicUrl(filePath);

        let productName = '';
        let product = null;
        if (productId && currentProduct && currentProduct.id === productId) {
            productName = currentProduct.name;
            product = currentProduct;
        }
        
        const prescriptionData = {
            user_id: user.id,
            file_url: urlData.publicUrl,
            reference_name: refInput?.value || (productName ? `Prescription for ${productName}` : 'Prescription Request'),
            status: 'pending',
            created_at: new Date().toISOString()
        };

        if (productId && productName) {
            prescriptionData.product_id = productId;
            prescriptionData.product_name = productName;
        }

        const { error: dbError } = await supabase
            .from('prescriptions')
            .insert(prescriptionData);

        if (dbError) throw dbError;

        if (statusDiv) {
            statusDiv.innerHTML = '<div class="upload-status success">✅ Prescription uploaded successfully!</div>';
        }

        window.showToast("Prescription uploaded successfully! Our pharmacist will review it shortly.", "success", "Upload Complete");

        setTimeout(() => {
            window.closePrescriptionModal();
            if (fileInput) fileInput.value = '';
            if (refInput) refInput.value = '';
        }, 1500);

    } catch (err) {
        console.error("Upload Error:", err);
        if (statusDiv) {
            statusDiv.innerHTML = `<div class="upload-status error">❌ Upload failed: ${err.message}</div>`;
        }
        window.showToast(err.message, "error", "Upload Failed");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit Prescription';
        }
    }
};

/* ==========================================================================
   7. ADD TO CART (With Prescription Check)
   ========================================================================== */
async function addDetailedToCartReal() {
    if (!currentProduct) return;

    const isPrescription = (currentProduct.requires_prescription === true || currentProduct.category === 'prescription');
    
    if (isPrescription) {
        window.openPrescriptionUploadModal(currentProduct.id, currentProduct.name);
        return;
    }

    const user = await safeGetUser();
    const cartKey = user ? `cart_${user.id}` : 'guest_cart';
    
    const qtyInput = document.getElementById('pQty');
    const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
    let cart = JSON.parse(localStorage.getItem(cartKey)) || [];
    
    // Price comes straight from the ERP (online price); no extra markdown here.
    let finalPrice = currentProduct.price;
    
    const existingIndex = cart.findIndex(item => item.id === currentProduct.id);

    // Check live stock (customers only ever see "Out of Stock" / "not enough available")
    const fresh = await getFreshStock(currentProduct.id);
    if (!fresh || !fresh.in_stock) {
        window.showToast(`"${currentProduct.name}" is out of stock`, 'warning', 'Out of Stock');
        return;
    }
    const alreadyInBag = existingIndex > -1 ? (cart[existingIndex].qty || 0) : 0;
    if (alreadyInBag + qty > (fresh.available_packs || 0)) {
        window.showToast(notEnoughStockMessage(currentProduct.name), 'warning', 'Not Enough Stock');
        return;
    }
    if (existingIndex > -1) {
        cart[existingIndex].qty += qty;
        window.showToast(`Quantity updated for "${currentProduct.name}"`, 'success', 'Cart Updated');
    } else {
        cart.push({
            id: currentProduct.id,
            name: currentProduct.name,
            price: finalPrice,
            original_price: currentProduct.price,
            image: getProductImage(currentProduct.image_url),
            qty: qty,
            is_prescription: false
        });
        window.showToast(`${currentProduct.name} has been added to your cart`, 'success', 'Added to Cart');
    }

    localStorage.setItem(cartKey, JSON.stringify(cart));
    await syncCartCount();
    showCartNotification();

    const btn = document.querySelector('.purchase-btn');
    if (btn) {
        const oldText = btn.textContent;
        btn.textContent = "✓ Added to Bag";
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = oldText;
            btn.disabled = false;
        }, 2000);
    }
}

// Assign the real function to both the internal property and the global stub (replacing it)
window._addDetailedToCart = addDetailedToCartReal;
// Replace the stub with the real function so future clicks go directly
window.addDetailedToCart = addDetailedToCartReal;

/* ==========================================================================
   8. SIMILAR PRODUCTS (Based on Active Ingredient)
   ========================================================================== */
async function loadSimilarProducts(product, currentId) {
    const container = document.getElementById('similarProducts');
    
    if (!product.active_ingredient || product.active_ingredient.trim() === '') {
        container.innerHTML = '<p class="empty-text">No similar products found with the same active ingredient.</p>';
        return;
    }
    
    const { data, error } = await erp
        .from('online_products')
        .select('*')
        .eq('active_ingredient', product.active_ingredient)
        .neq('id', currentId)
        .limit(6);
    
    if (error || !data || data.length === 0) {
        container.innerHTML = '<p class="empty-text">No similar products found with the same active ingredient.</p>';
        return;
    }
    
    renderGrid('similarProducts', data);
}

/* ==========================================================================
   9. FREQUENTLY BOUGHT TOGETHER (Based on Bundle Column)
   ========================================================================== */
async function loadBoughtTogether(product, currentId) {
    const container = document.getElementById('boughtTogether');
    
    if (!product.bundle || product.bundle.trim() === '') {
        container.innerHTML = '<p class="empty-text">No bundle recommendations available for this product.</p>';
        return;
    }
    
    const { data, error } = await erp
        .from('online_products')
        .select('*')
        .eq('bundle', product.bundle)
        .neq('id', currentId)
        .limit(6);
    
    if (error || !data || data.length === 0) {
        container.innerHTML = '<p class="empty-text">No frequently bought together items found.</p>';
        return;
    }
    
    renderGrid('boughtTogether', data);
}

/* ==========================================================================
   10. RENDER GRID FUNCTION
   ========================================================================== */
function renderGrid(elementId, products) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (!products || products.length === 0) {
        container.innerHTML = '<p class="empty-text">No products available.</p>';
        return;
    }

    container.innerHTML = products.map(p => {
        const isPrescription = (p.requires_prescription === true || p.category === 'prescription');
        const price = parseFloat(p.price) || 0;
        const oldPrice = parseFloat(p.original_price) || 0;
        const productImage = getProductImage(p.image_url);
        
        let priceHTML = `<span class="new-price">ZMW ${formatMoney(price)}</span>`;
        let discountBadge = '';

        if (oldPrice > price) {
            const discountPercent = Math.round(((oldPrice - price) / oldPrice) * 100);
            priceHTML = `
                <span class="old-price">ZMW ${formatMoney(oldPrice)}</span>
                <span class="new-price">ZMW ${formatMoney(price)}</span>
            `;
            discountBadge = `<div class="discount-badge">-${discountPercent}%</div>`;
        }
        
        return `
            <div class="product-card" onclick="location.href='../product-detail/index.html?id=${p.id}'">
                ${discountBadge}
                <div class="img-wrapper">
                    <img src="${productImage}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">
                </div>
                <h4>${escapeHtml(p.name)}</h4>
                ${p.brand ? `<p class="brand-name">${escapeHtml(p.brand)}</p>` : ''}
                <div class="price-box">
                    ${priceHTML}
                </div>
                <div class="pack-size-row">${packLabelHtml(p)}</div>
                ${isPrescription ? '<span class="prescription-badge">⚠️ Prescription Required</span>' : ''}
            </div>
        `;
    }).join('');
}

/* ==========================================================================
   11. QUOTATION VIEW FOR PRESCRIPTION ITEMS
   ========================================================================== */
async function renderQuotationView(id) {
    const user = await safeGetUser();
    const cartKey = user ? `cart_${user.id}` : 'guest_cart';
    const cart = JSON.parse(localStorage.getItem(cartKey)) || [];
    const quoteItem = cart.find(item => String(item.id) === String(id));

    if (!quoteItem) {
        showErrorState('Quote item not found.');
        return;
    }

    const titleEl = document.getElementById('detTitle');
    const brandEl = document.getElementById('detBrand');
    const imgEl = document.getElementById('mainProductImg');
    const priceEl = document.getElementById('detPrice');
    const categoryEl = document.getElementById('categoryPath');
    const descEl = document.getElementById('detDesc');
    const buyBtn = document.querySelector('.purchase-btn');
    const qtyBox = document.querySelector('.qty-box');
    
    if (titleEl) titleEl.textContent = quoteItem.name;
    if (brandEl) brandEl.textContent = "Pharmacist Recommended";
    if (imgEl) imgEl.src = quoteItem.image || quoteItem.image_url || PLACEHOLDER_IMAGE;
    if (priceEl) priceEl.innerHTML = `<span class="current-price">ZMW ${parseFloat(quoteItem.price).toFixed(2)}</span>`;
    if (categoryEl) categoryEl.textContent = "Prescription Quote";
    
    if (descEl) {
        descEl.innerHTML = `
            <div class="quote-message">
                <p>✓ This item has been approved by our pharmacist based on your prescription.</p>
                <p class="quote-note">You can proceed to checkout with this verified item.</p>
            </div>
        `;
    }

    if (buyBtn) buyBtn.style.display = 'none';
    if (qtyBox) qtyBox.style.display = 'none';
    
    const similarContainer = document.getElementById('similarProducts');
    const boughtContainer = document.getElementById('boughtTogether');
    
    if (similarContainer) {
        similarContainer.innerHTML = '<p class="empty-text">Browse our catalog for more products.</p>';
    }
    if (boughtContainer) {
        boughtContainer.innerHTML = '<p class="empty-text">No bundle recommendations available.</p>';
    }
}

/* ==========================================================================
   12. AUTH MODAL FUNCTIONS
   ========================================================================== */
window.closeAuthModal = () => {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
};

window.toggleAuth = (mode) => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    if (loginForm && signupForm) {
        loginForm.style.display = mode === 'login' ? 'block' : 'none';
        signupForm.style.display = mode === 'signup' ? 'block' : 'none';
    }
};

window.handleLogin = async () => {
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPass')?.value;
    const loginBtn = document.querySelector('#loginForm .primary-btn');
    
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
    const signupBtn = document.querySelector('#signupForm .primary-btn');
    
    if (!email || !password || !name) {
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
            .upsert({ id: data.user.id, name: name, role: 'member' });
        
        if (profileError) {
            window.showToast(profileError.message, "error", "Database Error");
        } else {
            window.showToast("Registration successful! Please login now.", "success", "Welcome!");
            window.toggleAuth('login');
        }
    }
};

/* ==========================================================================
   13. LOADING OVERLAY STYLES
   ========================================================================== */
const loadingOverlayStyles = document.createElement('style');
loadingOverlayStyles.textContent = `
    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100000;
    }
    .loading-overlay.hidden {
        display: none;
    }
    .loading-overlay .loading-spinner {
        background: white;
        padding: 1.5rem 2rem;
        border-radius: 16px;
        text-align: center;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
    }
    .loading-overlay .loading-spinner i {
        font-size: 2rem;
        color: #2d6a4f;
        margin-bottom: 0.5rem;
        display: block;
    }
`;
document.head.appendChild(loadingOverlayStyles);

/* ==========================================================================
   14. PAGE INITIALIZATION
   ========================================================================== */
async function initPage() {
    showLoadingState();
    showLoadingOverlay('Loading product details...');
    
    if (!productId) {
        window.location.href = '../home/index.html';
        return;
    }

    if (productId.includes('quote')) {
        await renderQuotationView(productId);
        hideLoadingOverlay();
        return;
    }

    const { data: product, error } = await erp
        .from('online_products')
        .select('*')
        .eq('id', productId)
        .single();

    if (error || !product) {
        showErrorState('Product not found.');
        hideLoadingOverlay();
        return;
    }
    
    currentProduct = product;
    
    const isPrescription = (product.requires_prescription === true || product.category === 'prescription');
    
    // Update DOM with product data
    const titleEl = document.getElementById('detTitle');
    const brandEl = document.getElementById('detBrand');
    const imgEl = document.getElementById('mainProductImg');
    const categoryEl = document.getElementById('categoryPath');
    const priceDisplay = document.getElementById('detPrice');
    const descEl = document.getElementById('detDesc');
    
    if (titleEl) titleEl.textContent = product.name;
    if (brandEl) brandEl.textContent = product.brand || "Generic";
    if (imgEl) imgEl.src = getProductImage(product.image_url);
    if (categoryEl) categoryEl.textContent = product.category || "Medicine";
    
    const currentPrice = parseFloat(product.price || 0);
    const originalPrice = parseFloat(product.original_price || 0);

    if (priceDisplay) {
        if (originalPrice > currentPrice) {
            const discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
            priceDisplay.innerHTML = `
                <span class="old-price-detail">ZMW ${formatMoney(originalPrice)}</span>
                <span class="current-price">ZMW ${formatMoney(currentPrice)}</span>
                <span class="discount-badge-detail">-${discountPercent}%</span>
                <div class="pack-size-row">${packLabelHtml(product)}</div>
            `;
        } else {
            priceDisplay.innerHTML = `<span class="current-price">ZMW ${formatMoney(currentPrice)}</span><div class="pack-size-row">${packLabelHtml(product)}</div>`;
        }
    }
    
    if (descEl) descEl.innerHTML = product.description || "No product information available.";
    
    const purchaseBtn = document.querySelector('.purchase-btn');
    if (purchaseBtn && product.in_stock === false) {
        purchaseBtn.textContent = "Out of Stock";
        purchaseBtn.disabled = true;
        purchaseBtn.classList.add('out-of-stock-btn');
        purchaseBtn.onclick = null;
    } else if (purchaseBtn && isPrescription) {
        purchaseBtn.textContent = "📋 Upload Prescription";
        purchaseBtn.classList.add('prescription-btn');
        purchaseBtn.onclick = () => window.openPrescriptionUploadModal(product.id, product.name);
    } else if (purchaseBtn) {
        purchaseBtn.textContent = "🛒 Add to Bag";
        purchaseBtn.classList.remove('prescription-btn');
        purchaseBtn.onclick = () => window.addDetailedToCart(); // now always defined
    }
    
    // Load related products
    await loadSimilarProducts(product, product.id);
    await loadBoughtTogether(product, product.id);
    
    await updateCartCount();
    hideLoadingOverlay();
}

/* ==========================================================================
   15. INITIALIZATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Product detail page loaded");
    await initPage();
    
    // Click outside modal to close
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
        if (event.target.id === 'prescriptionModal' && event.target.close) {
            event.target.close();
        }
    };
});

// Re-export for global access (additional helpers)
window.showLoadingOverlay = showLoadingOverlay;
window.hideLoadingOverlay = hideLoadingOverlay;
window.getProductImage = getProductImage;
window.PLACEHOLDER_IMAGE = PLACEHOLDER_IMAGE;
window.openPrescriptionUploadModal = openPrescriptionUploadModal;
window.closePrescriptionModal = closePrescriptionModal;
window.handlePrescriptionSubmit = handlePrescriptionSubmit;