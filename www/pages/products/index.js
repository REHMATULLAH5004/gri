import { supabase, erp } from '../../assets/js/supabase-config.js';
import { formatMoney, packLabelHtml, applySearchFilter, rankSearchResults } from '../../assets/js/shop-format.js';

// Import shared functions from home.js
import { syncCartCount, addToCart, openAuthModal } from '../home/index.js';

// back_button functions are now available globally via window object
// No need to import them - use window.pushNavigationState, window.getCurrentPageInfo, etc.

// Re-export for global access
window.addToCart = addToCart;
window.openAuthModal = openAuthModal;
window.showToast = showToast;

/* ==========================================================================
   1. GLOBAL CONSTANTS
   ========================================================================== */
const DEFAULT_PRODUCT_IMAGE = 'https://placehold.co/400x400/f0f0f0/999999?text=No+Image';

function getProductImage(imageUrl) {
    return (imageUrl && imageUrl.trim() !== '') ? imageUrl : DEFAULT_PRODUCT_IMAGE;
}

/* ==========================================================================
   2. STATE & URL PARAMS
   ========================================================================== */
const params = new URLSearchParams(window.location.search);
const category = params.get('category');
const parentType = params.get('parent_type');
const searchTerm = params.get('search');
const subCategory = params.get('sub_category');

let currentProducts = [];
let filteredResults = [];
let availableSubCategories = [];
let availableBrands = [];

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

function formatDisplayName(str) {
    if (!str) return '';
    return str.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function showLoading(message = 'Loading products...') {
    const grid = document.getElementById('productGrid');
    if (grid) {
        grid.innerHTML = `<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>${message}</p></div>`;
    }
}

/* ==========================================================================
   4. BRAND FUNCTIONS
   ========================================================================== */
async function loadBrandsFromDB() {
    try {
        let query = erp
            .from('online_products')
            .select('brand')
            .not('brand', 'is', null)
            .not('brand', 'eq', '');
        
        if (category) query = query.eq('category', category);
        if (parentType) query = query.eq('parent_type', parentType);
        
        const { data, error } = await query;
        if (error) throw error;
        
        const uniqueBrands = [...new Set(
            data.map(item => item.brand?.trim()).filter(Boolean)
        )].sort();
        
        return uniqueBrands;
    } catch (err) {
        console.error("Error loading brands:", err);
        return [];
    }
}

function populateBrandFilter(brands) {
    const brandSelect = document.getElementById('brandFilter');
    if (!brandSelect) return;
    
    brandSelect.innerHTML = '<option value="all">All Brands</option>';
    brands.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandSelect.appendChild(option);
    });
}

/* ==========================================================================
   5. SUBCATEGORY FUNCTIONS
   ========================================================================== */
async function loadSubCategoriesFromDB() {
    try {
        let query = erp
            .from('online_products')
            .select('sub_category')
            .not('sub_category', 'is', null)
            .not('sub_category', 'eq', '');
        
        if (category) query = query.eq('category', category);
        if (parentType) query = query.eq('parent_type', parentType);
        
        const { data, error } = await query;
        if (error) throw error;
        
        const uniqueSubCategories = [...new Set(
            data.map(item => item.sub_category?.trim()).filter(Boolean)
        )].sort();
        
        return uniqueSubCategories;
    } catch (err) {
        console.error("Error loading subcategories:", err);
        return [];
    }
}

function populateSubCategoryFilter(subCategories) {
    const filterSelect = document.getElementById('categoryFilter');
    if (!filterSelect) return;
    
    let options = `<option value="all">All ${category ? formatDisplayName(category) : 'Products'}</option>`;
    if (subCategories.length > 0) {
        options += subCategories.map(subCat => 
            `<option value="${subCat}">${formatDisplayName(subCat)}</option>`
        ).join('');
    }
    filterSelect.innerHTML = options;
    
    if (subCategory && subCategories.includes(subCategory)) {
        filterSelect.value = subCategory;
    }
}

/* ==========================================================================
   6. PAGE INITIALIZATION
   ========================================================================== */
   async function initPage() {
    console.log('Initializing page...');
    
    // --- ADD THIS: Update navigation state for back button ---
    // Get current page info and update the navigation stack using window functions
    if (typeof window.getCurrentPageInfo === 'function' && typeof window.pushNavigationState === 'function') {
        const currentInfo = window.getCurrentPageInfo();
        // Check if we came from home page with query params
        const params = new URLSearchParams(window.location.search);
        const category = params.get('category');
        const parentType = params.get('parent_type');
        const searchTerm = params.get('search');
        
        // If we have category, parent_type, or search, this is a filtered view
        if (category || parentType || searchTerm) {
            // Push the current state with the full URL including query params
            const fullUrl = window.location.href;
            window.pushNavigationState('product', fullUrl);
            console.log('📍 Product page with filters - pushed to stack:', fullUrl);
        } else {
            // Regular product page (all products)
            const fullUrl = window.location.href;
            window.pushNavigationState('product', fullUrl);
            console.log('📍 Product page (all products) - pushed to stack:', fullUrl);
        }
    }
    // --- END OF ADDED CODE ---
    
    const titleEl = document.getElementById('pageTitle');
    const subtitleEl = document.getElementById('pageSubtitle');
    const uploadBtn = document.getElementById('mainUploadBtn');
    const breadcrumbSpan = document.getElementById('currentPath');
    const quoteBtn = document.getElementById('quoteBtn');
    
    // Hide quote button on products page if exists
    if (quoteBtn) quoteBtn.style.display = 'none';

    if (breadcrumbSpan && category) {
        breadcrumbSpan.textContent = formatDisplayName(category);
    }

    if (category) {
        availableSubCategories = await loadSubCategoriesFromDB();
        availableBrands = await loadBrandsFromDB();
        
        populateSubCategoryFilter(availableSubCategories);
        populateBrandFilter(availableBrands);
        
        if (titleEl) titleEl.textContent = formatDisplayName(category);
        
        if (subtitleEl) {
            if (category === 'prescription') {
                subtitleEl.textContent = 'Your health isn\'t a guess. We\'ll ask for a valid prescription — because the right medicine starts with the right medical advice. Our pharmacists verify every order to keep you safe.';
                if (uploadBtn) uploadBtn.style.display = 'inline-block';
            } else if (parentType === 'cosmetics') {
                subtitleEl.textContent = 'Premium beauty and personal care products.';
            } 
            else {
                subtitleEl.textContent = `Browse our collection of ${formatDisplayName(category)}`;
            }
        }
        
        await setupPriceSliderFromProducts();
        
    } else if (searchTerm) {
        if (titleEl) titleEl.textContent = `Search Results: "${searchTerm}"`;
        if (subtitleEl) subtitleEl.textContent = `Showing products matching "${searchTerm}"`;
        if (uploadBtn) uploadBtn.style.display = 'none';
        setupPriceSlider(5000);
        populateBrandFilter([]);
    } else {
        if (titleEl) titleEl.textContent = "All Products";
        if (subtitleEl) subtitleEl.textContent = "Browse our complete healthcare catalog";
        if (uploadBtn) uploadBtn.style.display = 'none';
        setupPriceSlider(5000);
        populateBrandFilter([]);
    }
    
    await loadProducts();
}

async function setupPriceSliderFromProducts() {
    try {
        let query = erp.from('online_products').select('price').not('price', 'is', null);
        if (category) query = query.eq('category', category);
        if (parentType) query = query.eq('parent_type', parentType);
        
        const { data, error } = await query;
        if (error) throw error;
        
        if (data?.length > 0) {
            const prices = data.map(p => parseFloat(p.price)).filter(p => !isNaN(p));
            const maxPrice = Math.max(...prices, 1000);
            setupPriceSlider(Math.ceil(maxPrice / 100) * 100);
        } else {
            setupPriceSlider(5000);
        }
    } catch (err) {
        console.error('Error setting up price slider:', err);
        setupPriceSlider(5000);
    }
}

function setupPriceSlider(max) {
    const slider = document.getElementById('priceRange');
    const label = document.getElementById('priceLabel');
    if (slider) {
        slider.max = max;
        slider.value = max;
        if (label) label.textContent = max;
    }
}

/* ==========================================================================
   7. DATA FETCHING
   ========================================================================== */
async function loadProducts() {
    showLoading();

    try {
        let query = erp.from('online_products').select('*');

        if (searchTerm) {
            // every typed word must match the name, brand or active ingredient
            query = applySearchFilter(query, searchTerm);
        } else if (category) {
            if (parentType) query = query.eq('parent_type', parentType);
            query = query.eq('category', category);
        }

        const { data, error } = await query;
        if (error) throw error;

        // search results: best matches first
        currentProducts = searchTerm ? rankSearchResults(data, searchTerm) : (data || []);
        filteredResults = [...currentProducts];
        
        if (subCategory && subCategory !== 'all') {
            filteredResults = filteredResults.filter(p => 
                p.sub_category?.toLowerCase() === subCategory.toLowerCase()
            );
        }
        
        updateProductCount();
        renderProducts(filteredResults);
        
        console.log(`Loaded ${currentProducts.length} products`);

    } catch (err) {
        console.error("Fetch error:", err);
        const grid = document.getElementById('productGrid');
        if (grid) {
            grid.innerHTML = '<div class="error-text"><i class="fas fa-exclamation-circle"></i><p>Error loading products. Please refresh the page.</p></div>';
        }
    }
}

function updateProductCount() {
    const countText = document.getElementById('productCountText');
    if (countText) {
        countText.textContent = `Showing ${filteredResults.length} product${filteredResults.length !== 1 ? 's' : ''}`;
    }
}

/* ==========================================================================
   8. PRODUCT RENDERING
   ========================================================================== */
function renderProducts(products) {
    const grid = document.getElementById('productGrid');
    
    if (!grid) return;
    updateProductCount();

    if (products.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><p>No products found. Try adjusting your filters.</p></div>';
        return;
    }

    grid.innerHTML = products.map(p => {
        const isPrescription = (p.requires_prescription === true || p.category === 'prescription');
        const price = parseFloat(p.price) || 0;
        const oldPrice = parseFloat(p.compare_at_price) || parseFloat(p.original_price) || 0;
        
        let priceHTML = `<span class="current-price">ZMW ${formatMoney(price)}</span>`;
        let discountBadge = "";

        if (oldPrice > price) {
            const discountPercent = Math.round(((oldPrice - price) / oldPrice) * 100);
            priceHTML = `
                <span class="original-price">ZMW ${formatMoney(oldPrice)}</span>
                <span class="current-price">ZMW ${formatMoney(price)}</span>
            `;
            discountBadge = `<div class="discount-badge">-${discountPercent}%</div>`;
        }

        const soldOut = (p.in_stock === false);
        const actionBtn = soldOut
            ? `<button class="add-to-cart-btn out-of-stock-btn" disabled onclick="event.stopPropagation()">Out of Stock</button>`
            : isPrescription 
            ? `<button class="prescription-btn" onclick="event.stopPropagation(); openPrescriptionUpload('${p.id}', '${escapeHtml(p.name)}')">
                <i class="fas fa-file-prescription"></i> Upload Prescription
               </button>`
            : `<button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart('${p.id}')">
                <i class="fas fa-shopping-cart"></i> Add to Cart
               </button>`;

        const productImage = getProductImage(p.image_url);

        return `
            <div class="product-card${soldOut ? ' is-out-of-stock' : ''}" onclick="location.href='../product-detail/index.html?id=${p.id}'">
                ${soldOut ? '<div class="out-of-stock-badge">Out of Stock</div>' : discountBadge}
                <div class="img-wrapper">
                    <img src="${productImage}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='${DEFAULT_PRODUCT_IMAGE}'">
                </div>
                <h3>${escapeHtml(p.name)}</h3>
                ${p.brand ? `<p class="brand-name">${escapeHtml(p.brand)}</p>` : ''}
                <div class="price-box">
                    ${priceHTML}
                </div>
                <div class="pack-size-row">${packLabelHtml(p)}</div>
                ${actionBtn}
            </div>
        `;
    }).join('');
}

/* ==========================================================================
   9. FILTERS & SORTING
   ========================================================================== */
window.updatePriceDisplay = (val) => {
    const label = document.getElementById('priceLabel');
    if (label) label.textContent = val;
    applyCombinedFilters();
};

window.applyCategoryFilter = () => applyCombinedFilters();

window.applyCombinedFilters = () => {
    const subCatVal = document.getElementById('categoryFilter')?.value || 'all';
    const brandVal = document.getElementById('brandFilter')?.value || 'all';
    const priceSlider = document.getElementById('priceRange');
    const maxPrice = priceSlider ? parseFloat(priceSlider.value) : Infinity;

    filteredResults = currentProducts.filter(p => {
        const matchesSubCat = (subCatVal === 'all' || p.sub_category === subCatVal);
        const matchesBrand = (brandVal === 'all' || (p.brand && p.brand === brandVal));
        const matchesPrice = (parseFloat(p.price) <= maxPrice);
        return matchesSubCat && matchesBrand && matchesPrice;
    });

    const sortValue = document.getElementById('sortFilter')?.value || 'name';
    applySort(sortValue, true);
    updateProductCount();
};

window.applySort = (value, skipFilter = false) => {
    const productsToSort = skipFilter ? filteredResults : [...filteredResults];
    
    switch(value) {
        case 'name':
            productsToSort.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'price-low':
            productsToSort.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));
            break;
        case 'price-high':
            productsToSort.sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));
            break;
    }
    
    if (!skipFilter) filteredResults = productsToSort;
    renderProducts(productsToSort);
};

/* ==========================================================================
   10. PRESCRIPTION UPLOAD FUNCTIONS
   ========================================================================== */
window.openPrescriptionUpload = async (productId, productName) => {
    const modal = document.getElementById('prescriptionModal');
    const hiddenInput = document.getElementById('targetProductId');
    const statusDiv = document.getElementById('uploadStatus');
    const form = modal?.querySelector('form');
    
    if (!modal) return;

    if (form) form.reset();
    if (statusDiv) {
        statusDiv.innerHTML = '';
        statusDiv.className = 'status-msg';
    }
    
    if (hiddenInput) hiddenInput.value = productId;
    
    window.currentPrescriptionProduct = { id: productId, name: productName };
    
    if (modal.showModal) {
        modal.showModal();
    } else {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
    document.body.classList.add('modal-open');
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
    window.currentPrescriptionProduct = null;
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
        if (typeof openAuthModal === 'function') {
            openAuthModal();
        } else {
            window.openAuthModal();
        }
        return;
    }
    
    if (!fileInput?.files[0]) {
        if (typeof showToast === 'function') {
            showToast("Please select a prescription image file", "warning", "Missing File");
        } else {
            alert("Please select a prescription image file");
        }
        return;
    }

    if (statusDiv) {
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading prescription...';
        statusDiv.className = 'status-msg uploading';
    }
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
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
        let product = currentProducts.find(p => p.id === productId);
        if (product) productName = product.name;
        
        const prescriptionData = {
            user_id: user.id,
            file_url: urlData.publicUrl,
            reference_name: refInput?.value || (productName ? `Prescription for ${productName}` : 'Prescription Request'),
            status: 'pending',
            created_at: new Date().toISOString()
        };

        if (productId && product) {
            prescriptionData.product_id = productId;
            prescriptionData.product_name = productName;
        }

        const { error: dbError } = await supabase
            .from('prescriptions')
            .insert(prescriptionData);

        if (dbError) throw dbError;

        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Prescription uploaded successfully!';
            statusDiv.className = 'status-msg success';
        }

        if (typeof showToast === 'function') {
            showToast("Prescription uploaded successfully! Our pharmacist will review it shortly.", "success", "Upload Complete");
        }

        setTimeout(() => {
            window.closePrescriptionModal();
            
            if (fileInput) fileInput.value = '';
            if (refInput) refInput.value = '';
        }, 1500);

    } catch (err) {
        console.error("Upload Error:", err);
        if (statusDiv) {
            statusDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Upload failed: ${err.message}`;
            statusDiv.className = 'status-msg error';
        }
        if (typeof showToast === 'function') {
            showToast(err.message, "error", "Upload Failed");
        } else {
            alert("Upload failed: " + err.message);
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit Prescription';
        }
    }
};

/* ==========================================================================
   11. MODAL MANAGEMENT
   ========================================================================== */
window.closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
};

window.closeAuthModal = () => {
    window.closeModal('authModal');
};

/* ==========================================================================
   12. LOADING OVERLAY
   ========================================================================== */
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

// Add loading overlay styles if not present
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
   13. INITIALIZATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Products page loaded");
    
    // Initialize cart count only
    if (typeof syncCartCount === 'function') {
        await syncCartCount();
    }
    
    // Initialize the page
    await initPage();
    
    // Setup click outside for modal
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
        if (event.target.id === 'prescriptionModal' && event.target.close) {
            event.target.close();
        }
    };
    
    console.log("Products page initialization complete");
});

// Re-export for global access
window.showLoadingOverlay = showLoadingOverlay;
window.hideLoadingOverlay = hideLoadingOverlay;
window.getProductImage = getProductImage;
window.DEFAULT_PRODUCT_IMAGE = DEFAULT_PRODUCT_IMAGE;
window.openPrescriptionUpload = openPrescriptionUpload;
window.closePrescriptionModal = closePrescriptionModal;
window.handlePrescriptionSubmit = handlePrescriptionSubmit;