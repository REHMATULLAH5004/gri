import { supabase, erp } from '../../assets/js/supabase-config.js';
import { getPrescriptionFileUrl } from '../../assets/js/prescription-files.js';

/* ==========================================================================
   0. GLOBAL CONSTANTS & CONFIGURATION
   ========================================================================== */
const PLACEHOLDER_IMAGE = 'https://placehold.co/400x400/f0f0f0/999999?text=No+Image';

/* ==========================================================================
   1. CHECK ADMIN ACCESS & INITIALIZATION
   ========================================================================== */
let currentUser = null;
let allProducts = [];
let allOrders = [];
let allPrescriptions = [];
let allUsers = [];
let allMedicines = [];
let allRiders = [];

let brandOptions = [];
let categoryOptions = [];
let subCategoryOptions = [];
let activeIngredientOptions = [];

let currentCSVData = [];
let currentEditData = [];
let currentPrescription = null;
let quotationItems = [];
let medicineSearchTimeout = null;

async function checkAdminAccess() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = '../home/index.html';
            return;
        }
        
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, name')
            .eq('id', session.user.id)
            .single();
        
            if (!profile || profile.role !== 'admin') {
                window.showToast('Access denied. Admin privileges required.', 'error', 'Access Denied', 3000);
                setTimeout(() => {
                    window.location.href = '../home/index.html';
                }, 1000);
                return;
            }
        
        currentUser = profile;
        document.getElementById('adminName').textContent = profile.name || 'Admin';
        
        // Wire up the tabs FIRST so a link like admin/index.html#prescriptions
        // (the ERP's Prescriptions button) opens the right tab straight away,
        // instead of after every list below has finished loading.
        setupTabs();
        setupToastContainer();
        
        await loadDashboardStats();
        await loadProducts();
        await loadOffers();
        await loadOrders();
        await loadPrescriptions();
        await loadUsers();
        await loadRiders();
        await loadDropdownOptions();
        await loadAllMedicines();
    } catch (err) {
        console.error('Admin access error:', err);
    }
}

function setupTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => tab.style.display = 'none');
    const dashboardTab = document.getElementById('dashboardTab');
    if (dashboardTab) dashboardTab.style.display = 'block';
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            navBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            tabs.forEach(tab => tab.style.display = 'none');
            const activeTab = document.getElementById(`${tabId}Tab`);
            if (activeTab) activeTab.style.display = 'block';
        });
    });

    // Deep link from the ERP's Prescriptions button: admin/index.html#prescriptions
    const hashTab = (location.hash || '').replace('#', '');
    if (hashTab) document.querySelector(`.nav-btn[data-tab="${hashTab}"]`)?.click();
}

/* ==========================================================================
   2. TOAST NOTIFICATION SYSTEM
   ========================================================================== */
   function setupToastContainer() {
    if (!document.getElementById('toastContainer')) {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
}

window.showToast = (message, type = 'info', title = '', duration = 3000) => {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    let defaultTitle = '';
    switch(type) {
        case 'success':
            icon = '<i class="fas fa-check-circle"></i>';
            defaultTitle = 'Success!';
            break;
        case 'error':
            icon = '<i class="fas fa-exclamation-circle"></i>';
            defaultTitle = 'Error!';
            break;
        case 'warning':
            icon = '<i class="fas fa-exclamation-triangle"></i>';
            defaultTitle = 'Warning!';
            break;
        default:
            icon = '<i class="fas fa-info-circle"></i>';
            defaultTitle = 'Info';
    }
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title || defaultTitle}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.closest('.toast').remove()">&times;</button>
        <div class="toast-progress"></div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast && toast.parentNode) {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 300);
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
   3. CATEGORY TREE  (parent type -> category -> sub category)
   --------------------------------------------------------------------------
   These are the SHOP's own menu groups: they decide where a product shows on
   the shop (menus, filters, prescription items). The list starts from the
   groups below (medicine / cosmetics / surgicals / diagnostics) and grows from what you save on products.
   ========================================================================== */
const DEFAULT_CATEGORY_TREE = {
    "medicine": {
        "prescription": [
            "analgesics_and_anti_inflammatory",
            "antibiotics",
            "antifungals",
            "antiparasitics_and_antimalarials",
            "antivirals",
            "cardiovascular",
            "central_nervous_system",
            "dermatology",
            "diabetes_and_endocrine",
            "metabolic_and_electrolytes",
            "gastrointestinal",
            "urology_and_reproductive_health",
            "hematology",
            "gout_and_musculoskeletal",
            "oncology",
            "immunosuppressants",
            "eye_care",
            "respiratory_and_allergy",
            "vaccines_and_biologicals",
            "contrast_media"
        ],
        "otc": [
            "pain_and_fever_relief",
            "cough_cold_and_allergy",
            "digestive_health",
            "oral_care",
            "eye_ear_and_nose_care",
            "herbal_and_homeopathic"
        ],
        "health_supplement": [
            "vitamins_and_minerals",
            "blood_booster",
            "bone_and_joint_health",
            "heart_health",
            "mental_focus_and_sleep",
            "fertility_and_reproductive_health",
            "weight_management"
        ]
    },
    "cosmetics": {
        "skin_care": [
            "moisturizer",
            "face_care",
            "body_care"
        ]
    },
    "surgicals": {
        "surgical_instruments": [
            "forceps",
            "scissors",
            "scalpel_handles",
            "needle_holders",
            "gynaecology_instruments",
            "orthopaedic_instruments",
            "trays_boxes_and_containers",
            "surgical_kits",
            "implants_and_shunts"
        ],
        "orthopaedic_supports": [
            "braces_and_supports",
            "casting_materials"
        ],
        "consumables_and_hygiene": [
            "wound_care",
            "ppe_and_gloves",
            "syringes_and_catheters",
            "maternity_supplies",
            "disinfectants_and_hygiene"
        ]
    },
    "diagnostics": {
        "diagnostic_devices": [
            "blood_glucose_monitoring",
            "blood_pressure_monitors",
            "diagnostic_instruments",
            "test_kits"
        ]
    }
};
let categoryTree = JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE));

function mergeCategoryTreeFromProducts(rows) {
    (rows || []).forEach(r => {
        const pt = r.parent_type, c = r.shop_category, sc = r.shop_sub_category;
        if (!pt || !c) return;
        categoryTree[pt] = categoryTree[pt] || {};
        categoryTree[pt][c] = categoryTree[pt][c] || [];
        if (sc && !categoryTree[pt][c].includes(sc)) categoryTree[pt][c].push(sc);
    });
}

function fillSelect(select, values, placeholder, selected) {
    if (!select) return;
    select.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);
    const list = [...values];
    if (selected && !list.includes(selected)) list.push(selected);
    list.forEach(v => {
        const option = document.createElement('option');
        option.value = v;
        option.textContent = v;
        select.appendChild(option);
    });
    if (selected) select.value = selected;
}

window.loadCategoriesByParent = function(selectedCategory, selectedSub) {
    const parentType = document.getElementById('prodParentType').value;
    const categorySelect = document.getElementById('prodCategory');
    const subSelect = document.getElementById('prodSubCategory');
    const pick = (typeof selectedCategory === 'string') ? selectedCategory : '';

    if (!parentType) {
        fillSelect(categorySelect, [], 'Select Parent Type first');
        fillSelect(subSelect, [], 'Select category first');
        return;
    }
    const cats = Object.keys(categoryTree[parentType] || {}).sort();
    fillSelect(categorySelect, cats, 'Select or add new category', pick);
    fillSelect(subSelect, [], 'Select category first');
    if (pick) window.loadSubCategoriesByCategory(selectedSub);
};

window.loadSubCategoriesByCategory = function(selectedSub) {
    const parentType = document.getElementById('prodParentType').value;
    const category = document.getElementById('prodCategory').value;
    const subSelect = document.getElementById('prodSubCategory');
    const pick = (typeof selectedSub === 'string') ? selectedSub : '';

    if (!category) {
        fillSelect(subSelect, [], 'Select category first');
        return;
    }
    const subs = ((categoryTree[parentType] || {})[category] || []).slice().sort();
    fillSelect(subSelect, subs, 'Select or add new sub category', pick);
};

window.onSubCategoryChange = function() {};

/* ==========================================================================
   4. DROPDOWN OPTIONS
   --------------------------------------------------------------------------
   Brand and active ingredient now come from the ERP (read-only here), so the
   only things you can add are shop categories / sub categories.
   ========================================================================== */
async function loadDropdownOptions() {
    // nothing to load: categories come from the category tree above,
    // brand / active ingredient are read-only values from the ERP product.
}

window.addNewOption = function(type) {
    const parentType = document.getElementById('prodParentType')?.value;

    if (type === 'category') {
        if (!parentType) {
            window.showToast('Please select Parent Type first', 'warning', 'Missing Selection');
            return;
        }
        const input = document.getElementById('newCategory');
        const value = (input?.value || '').trim();
        if (!value) { window.showToast('Please enter a value', 'warning', 'Missing Value'); return; }
        categoryTree[parentType] = categoryTree[parentType] || {};
        if (!categoryTree[parentType][value]) categoryTree[parentType][value] = [];
        input.value = '';
        window.loadCategoriesByParent(value);
        window.showToast(`Category "${value}" added. It is saved when you save this product.`, 'success', 'Category Added');
        return;
    }

    if (type === 'subCategory') {
        const category = document.getElementById('prodCategory')?.value;
        if (!parentType || !category) {
            window.showToast('Please select Parent Type and Category first', 'warning', 'Missing Selection');
            return;
        }
        const input = document.getElementById('newSubCategory');
        const value = (input?.value || '').trim();
        if (!value) { window.showToast('Please enter a value', 'warning', 'Missing Value'); return; }
        categoryTree[parentType][category] = categoryTree[parentType][category] || [];
        if (!categoryTree[parentType][category].includes(value)) categoryTree[parentType][category].push(value);
        input.value = '';
        window.loadCategoriesByParent(category, value);
        window.showToast(`Sub category "${value}" added. It is saved when you save this product.`, 'success', 'Sub Category Added');
    }
};

/* ==========================================================================
   5. IMAGE UPLOAD
   ========================================================================== */
window.previewImage = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('previewImg');
            if (preview) preview.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.uploadImage = async function() {
    const fileInput = document.getElementById('prodImageFile');
    const statusDiv = document.getElementById('imageUploadStatus');
    const imageUrlInput = document.getElementById('prodImageUrl');
    const previewImg = document.getElementById('previewImg');
    
    if (!fileInput?.files?.[0]) {
        showToast('Please select an image first', 'warning');
        return;
    }
    
    const file = fileInput.files[0];
    const fileName = `products/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    if (statusDiv) {
        statusDiv.innerHTML = '⏳ Uploading...';
    }
    
    // The "product-images" storage bucket is created once in the shop database
    // (admin-only upload, public read). The page cannot create it itself.
    const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, { contentType: file.type || undefined, upsert: false });
    if (uploadError) {
        console.error('Product image upload failed:', uploadError);
        const m = String(uploadError.message || uploadError);
        if (statusDiv) {
            statusDiv.innerHTML = /bucket not found/i.test(m)
                ? '❌ Upload failed: the product-images storage is not set up.'
                : /row-level security|not authorized|permission|unauthor/i.test(m)
                    ? '❌ Upload failed: permission denied. Sign in again as admin.'
                    : /size|exceeded|too large/i.test(m)
                        ? '❌ Upload failed: the picture is too large (max 15 MB).'
                        : '❌ Upload failed: ' + escapeHtml(m);
        }
        return;
    }
    
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
    if (imageUrlInput) imageUrlInput.value = urlData.publicUrl;
    if (previewImg) previewImg.src = urlData.publicUrl;
    
    if (statusDiv) {
        statusDiv.innerHTML = '✅ Image uploaded successfully!';
    }
    setTimeout(() => { if (statusDiv) statusDiv.innerHTML = ''; }, 3000);
};

/* ==========================================================================
   6. RICH TEXT EDITOR
   ========================================================================== */
window.formatText = function(command) {
    const editor = document.getElementById('descriptionEditor');
    if (!editor) return;
    editor.focus();
    switch(command) {
        case 'bold': document.execCommand('bold', false, null); break;
        case 'italic': document.execCommand('italic', false, null); break;
        case 'underline': document.execCommand('underline', false, null); break;
        case 'bullet': document.execCommand('insertUnorderedList', false, null); break;
        case 'number': document.execCommand('insertOrderedList', false, null); break;
    }
};

function syncDescription() {
    const editor = document.getElementById('descriptionEditor');
    const textarea = document.getElementById('prodDescription');
    if (editor && textarea) textarea.value = editor.innerHTML;
}

/* ==========================================================================
   7. DASHBOARD STATS
   ========================================================================== */
async function loadDashboardStats() {
    try {
        const { count: productCount } = await erp.from('online_products').select('*', { count: 'exact', head: true });
        document.getElementById('totalProducts').textContent = productCount || 0;
        
        const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
        document.getElementById('totalOrders').textContent = orderCount || 0;
        
        const { count: pendingPresc } = await supabase.from('prescriptions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        document.getElementById('pendingPrescriptions').textContent = pendingPresc || 0;
        
        const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        document.getElementById('totalUsers').textContent = userCount || 0;
        
        await updateDashboardOrderCounts();
        
        const { data: recentOrders } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5);
        const recentTable = document.getElementById('recentOrdersList');
        if (recentTable && recentOrders?.length) {
            recentTable.innerHTML = recentOrders.map(order => `
                <tr>
                    <td>#${order.id.slice(0,8)}</div>
                    <td>${escapeHtml(order.customer_name || 'Guest')}</div>
                    <td>ZMW ${parseFloat(order.total || order.total_price || 0).toFixed(2)}</div>
                    <td><span class="status-badge status-${order.order_status || order.status}">${(order.order_status || order.status)?.replace(/_/g, ' ')}</span></div>
                    <td>${new Date(order.created_at).toLocaleDateString()}</div>
                    <td><button class="action-btn view" onclick="viewOrderDetails('${order.id}')"><i class="fas fa-eye"></i></button></div>
                </tr>
            `).join('');
        } else if (recentTable) {
            recentTable.innerHTML = '<tr><td colspan="6">No orders found<\/tr>';
        }
    } catch (err) { console.error('Error loading dashboard stats:', err); }
}

async function updateDashboardOrderCounts() {
    try {
        const { data: orders } = await supabase.from('orders').select('order_status');
        if (!orders) return;
        
        const counts = {
            pending: orders.filter(o => o.order_status === 'pending').length,
            processing: orders.filter(o => o.order_status === 'processing').length,
            ready_for_pickup: orders.filter(o => o.order_status === 'ready_for_pickup').length,
            out_for_delivery: orders.filter(o => o.order_status === 'out_for_delivery').length,
            delivered: orders.filter(o => o.order_status === 'delivered').length
        };
        
        const pendingStatusCount = document.getElementById('pendingStatusCount');
        const processingStatusCount = document.getElementById('processingStatusCount');
        const readyStatusCount = document.getElementById('readyStatusCount');
        const outForDeliveryStatusCount = document.getElementById('outForDeliveryStatusCount');
        const deliveredStatusCount = document.getElementById('deliveredStatusCount');
        const pendingOrdersCount = document.getElementById('pendingOrdersCount');
        const activeDeliveriesCount = document.getElementById('activeDeliveriesCount');
        
        if (pendingStatusCount) pendingStatusCount.textContent = counts.pending;
        if (processingStatusCount) processingStatusCount.textContent = counts.processing;
        if (readyStatusCount) readyStatusCount.textContent = counts.ready_for_pickup;
        if (outForDeliveryStatusCount) outForDeliveryStatusCount.textContent = counts.out_for_delivery;
        if (deliveredStatusCount) deliveredStatusCount.textContent = counts.delivered;
        if (pendingOrdersCount) pendingOrdersCount.textContent = counts.pending;
        if (activeDeliveriesCount) activeDeliveriesCount.textContent = counts.out_for_delivery;
    } catch (err) {
        console.error('Error updating dashboard counts:', err);
    }
}

/* ==========================================================================
   8. PRODUCT MANAGEMENT  (products are created in the ERP; here you only
      fill in the ONLINE details and choose what shows on the shop)
   ========================================================================== */
const ERP_ALLOWED_ROLES = ['Admin', 'Manager', 'Pharmacist'];
let erpStaffReady = false;

async function verifyErpRole() {
    try {
        const { data, error } = await erp.rpc('get_current_user_role');
        if (error) return false;
        return ERP_ALLOWED_ROLES.includes(data);
    } catch (e) { return false; }
}

async function ensureErpStaff(promptIfNeeded) {
    const { data: { session } } = await erp.auth.getSession();
    if (session && await verifyErpRole()) { erpStaffReady = true; return true; }
    if (session) await erp.auth.signOut();
    erpStaffReady = false;
    if (!promptIfNeeded) return false;
    return await promptErpLogin();
}

function promptErpLogin() {
    return new Promise(resolve => {
        let ov = document.getElementById('erpLoginOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'erpLoginOverlay';
            ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:99999;padding:16px;';
            ov.innerHTML = `
                <form id="erpLoginForm" style="background:#fff;border-radius:14px;padding:26px;max-width:380px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:inherit;">
                    <h3 style="margin:0 0 6px;font-size:20px;color:#0a2e25;">ERP staff sign in</h3>
                    <p style="margin:0 0 16px;color:#555;font-size:14px;">Products and stock live in the ERP. Sign in with your ERP login to manage what shows on the shop.</p>
                    <input id="erpLoginEmail" type="email" placeholder="ERP email" autocomplete="username" required style="width:100%;padding:11px 12px;margin-bottom:10px;border:1px solid #ccd;border-radius:8px;box-sizing:border-box;">
                    <input id="erpLoginPassword" type="password" placeholder="ERP password" autocomplete="current-password" required style="width:100%;padding:11px 12px;margin-bottom:10px;border:1px solid #ccd;border-radius:8px;box-sizing:border-box;">
                    <div id="erpLoginMsg" style="min-height:18px;color:#b91c1c;font-size:13px;margin-bottom:8px;"></div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button type="button" id="erpLoginCancel" style="padding:10px 16px;border:1px solid #ccd;background:#fff;border-radius:8px;cursor:pointer;">Cancel</button>
                        <button type="submit" id="erpLoginBtn" style="padding:10px 18px;border:none;background:#5a1f1b;color:#fff;border-radius:8px;cursor:pointer;">Sign in</button>
                    </div>
                </form>`;
            document.body.appendChild(ov);
        }
        const form = ov.querySelector('#erpLoginForm');
        const msg = ov.querySelector('#erpLoginMsg');
        const btn = ov.querySelector('#erpLoginBtn');
        msg.textContent = '';
        ov.style.display = 'flex';

        form.onsubmit = async (e) => {
            e.preventDefault();
            btn.disabled = true; btn.textContent = 'Signing in...'; msg.textContent = '';
            const email = ov.querySelector('#erpLoginEmail').value.trim();
            const password = ov.querySelector('#erpLoginPassword').value;
            const { error } = await erp.auth.signInWithPassword({ email, password });
            if (error) {
                msg.textContent = 'Sign in failed. Check the ERP email and password.';
            } else if (!(await verifyErpRole())) {
                await erp.auth.signOut();
                msg.textContent = 'This ERP account is not allowed to manage online products (Admin or Manager only).';
            } else {
                erpStaffReady = true;
                ov.style.display = 'none';
                ov.querySelector('#erpLoginPassword').value = '';
                resolve(true);
            }
            btn.disabled = false; btn.textContent = 'Sign in';
        };
        ov.querySelector('#erpLoginCancel').onclick = () => { ov.style.display = 'none'; resolve(false); };
    });
}

window.erpSignIn = async function() {
    if (await ensureErpStaff(true)) { await loadProducts(); await loadAllMedicines(); }
};

function badge(text, bg, fg) {
    return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:600;background:${bg};color:${fg};">${text}</span>`;
}

async function loadProducts(promptIfNeeded = false) {
    const tbody = document.getElementById('productsList');
    try {
        const ok = await ensureErpStaff(promptIfNeeded);
        if (!ok) {
            allProducts = [];
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;">
                Products come from the ERP. <button class="add-btn" onclick="erpSignIn()" style="margin-left:8px;">Sign in with ERP login</button></td></tr>`;
            return;
        }
        const { data, error } = await erp.from('online_admin_products').select('*').order('name', { ascending: true }).limit(5000);
        if (error) throw error;
        allProducts = data || [];
        mergeCategoryTreeFromProducts(allProducts);
        populateCategoryFilter(allProducts);
        window.filterProducts();
    } catch (err) {
        console.error('Error loading products:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="9">Error loading products from the ERP</td></tr>';
    }
}
window.loadProducts = () => loadProducts(true);

function renderProductsTable(products) {
    const tbody = document.getElementById('productsList');
    if (!tbody) return;

    if (!products?.length) {
        tbody.innerHTML = '<tr><td colspan="9">No products found</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(product => {
        const imgSrc = product.image_url && product.image_url.trim() !== '' ? product.image_url : PLACEHOLDER_IMAGE;
        const cat = product.shop_category || '';
        const catHtml = cat ? escapeHtml(cat) : `<span style="color:#888;">${escapeHtml(product.category || '-')} (ERP)</span>`;
        const sale = parseFloat(product.sale_price || 0);
        const orig = parseFloat(product.original_price || 0);
        const priceHtml = sale > 0
            ? (orig > sale ? `<s style="color:#888;">ZMW ${orig.toFixed(2)}</s> ZMW ${sale.toFixed(2)}` : `ZMW ${sale.toFixed(2)}`)
            : '<span style="color:#b45309;">No price yet</span>';
        const customTag = parseFloat(product.price_override || 0) > 0 ? '<br><small style="color:#7c3aed;">Custom price</small>' : '';
        const stockHtml = product.in_stock ? badge('In stock', '#dcfce7', '#166534') : badge('Out of stock', '#f3f4f6', '#6b7280');
        let statusHtml;
        if (product.needs_online_details) statusHtml = badge('Needs details', '#fef3c7', '#92400e');
        else if (product.show_online) statusHtml = badge('Live on shop', '#dbeafe', '#1e40af');
        else statusHtml = badge('Hidden', '#f3f4f6', '#6b7280');

        const toggleBtn = product.needs_online_details ? '' : `
            <button class="action-btn" title="${product.show_online ? 'Hide from shop' : 'Show on shop'}" onclick="toggleOnline('${product.id}')">
                <i class="fas ${product.show_online ? 'fa-eye-slash' : 'fa-eye'}"></i></button>`;

        const flagBox = (col, label) => product.needs_online_details
            ? ''
            : `<label style="display:block;white-space:nowrap;font-size:12px;cursor:pointer;"><input type="checkbox" ${product[col] ? 'checked' : ''} onchange="toggleHomeFlag('${product.id}', '${col}', this)"> ${label}</label>`;
        const homeHtml = product.needs_online_details
            ? '<small style="color:#888;">Add details first</small>'
            : flagBox('is_trending', 'Trending') + flagBox('featured_home', 'Featured') + flagBox('health_essentials', 'Essentials');

        return `
            <tr>
                <td><img src="${imgSrc}" class="product-img" onerror="this.src='${PLACEHOLDER_IMAGE}'"></td>
                <td>${escapeHtml(product.name)}${product.brand ? `<br><small style="color:#888;">${escapeHtml(product.brand)}</small>` : ''}</td>
                <td>${catHtml}</td>
                <td>${priceHtml}${customTag}</td>
                <td>${stockHtml}</td>
                <td>${statusHtml}</td>
                <td>${product.requires_prescription ? '<span class="status-badge status-pending">Yes</span>' : 'No'}</td>
                <td>${homeHtml}</td>
                <td>
                    <button class="action-btn edit" title="Edit online details" onclick="editProduct('${product.id}')"><i class="fas fa-edit"></i></button>
                    ${toggleBtn}
                </td>
            </tr>
        `;
    }).join('');
}

function populateCategoryFilter(products) {
    const categories = [...new Set(products.map(p => p.shop_category || p.category).filter(Boolean))].sort();
    const filterSelect = document.getElementById('categoryFilter');
    if (!filterSelect) return;
    const current = filterSelect.value;
    filterSelect.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        filterSelect.appendChild(option);
    });
    if (current && categories.includes(current)) filterSelect.value = current;
}

window.filterProducts = function() {
    const searchTerm = (document.getElementById('productSearch')?.value || '').toLowerCase();
    const category = document.getElementById('categoryFilter')?.value || 'all';
    const parentType = document.getElementById('parentTypeFilter')?.value || 'all';
    const status = document.getElementById('onlineStatusFilter')?.value || 'all';
    let filtered = [...allProducts];
    if (searchTerm) filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(searchTerm) ||
        (p.brand || '').toLowerCase().includes(searchTerm) ||
        (p.sku || '').toLowerCase().includes(searchTerm));
    if (category !== 'all') filtered = filtered.filter(p => (p.shop_category || p.category) === category);
    if (parentType !== 'all') filtered = filtered.filter(p => p.parent_type === parentType);
    if (status === 'needs') filtered = filtered.filter(p => p.needs_online_details);
    if (status === 'live') filtered = filtered.filter(p => p.show_online);
    if (status === 'hidden') filtered = filtered.filter(p => !p.needs_online_details && !p.show_online);
    renderProductsTable(filtered);
};

function setSelectValue(select, value) {
    if (!select) return;
    select.innerHTML = '';
    const o = document.createElement('option');
    o.value = value || '';
    o.textContent = value || '-';
    select.appendChild(o);
    select.value = value || '';
}

window.openProductModal = function(productId = null) {
    const modal = document.getElementById('productModal');
    if (!modal) return;
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;   // products are created in the ERP, never here

    const form = document.getElementById('productForm');
    if (form) form.reset();
    const editor = document.getElementById('descriptionEditor');
    if (editor) editor.innerHTML = '';

    document.getElementById('productModalTitle').textContent = 'Online details';
    document.getElementById('prodId').value = product.id;

    // ---- read-only, straight from the ERP ----
    document.getElementById('prodName').value = product.name || '';
    setSelectValue(document.getElementById('prodBrand'), product.brand);
    setSelectValue(document.getElementById('prodActiveIngredient'), product.active_ingredient);
    const sale = parseFloat(product.sale_price || 0);
    const orig = parseFloat(product.original_price || 0);
    document.getElementById('prodPrice').value = sale > 0 ? sale.toFixed(2) : '';
    document.getElementById('prodOriginalPrice').value = orig > sale ? orig.toFixed(2) : '';
    const overrideVal = parseFloat(product.price_override || 0);
    const autoVal = parseFloat(product.auto_price || 0);
    const overrideInput = document.getElementById('prodPriceOverride');
    if (overrideInput) overrideInput.value = overrideVal > 0 ? overrideVal.toFixed(2) : '';
    const autoNote = document.getElementById('prodAutoPriceNote');
    if (autoNote) autoNote.textContent = overrideVal > 0
        ? `Custom price is active. The ERP price would be ZMW ${autoVal.toFixed(2)}. Clear this box and save to go back to the ERP price.`
        : (autoVal > 0 ? `Now using the ERP price (ZMW ${autoVal.toFixed(2)}). Type a price here to override it.` : 'No ERP price yet. Type a price here to set one.');

    // ---- shop-only details you can edit ----
    document.getElementById('prodShowOnline').checked = !!product.show_online;
    document.getElementById('prodParentType').value = product.parent_type || '';
    window.loadCategoriesByParent(product.shop_category || '', product.shop_sub_category || '');
    document.getElementById('prodBundle').value = product.bundle || '';
    document.getElementById('prodTag').value = product.tag || '';
    document.getElementById('prodImageUrl').value = product.image_url || '';
    document.getElementById('prodIsTrending').checked = !!product.is_trending;
    document.getElementById('prodFeaturedHome').checked = !!product.featured_home;
    document.getElementById('prodHealthEssentials').checked = !!product.health_essentials;

    const previewImg = document.getElementById('previewImg');
    if (previewImg) {
        previewImg.src = (product.image_url && product.image_url.trim() !== '') ? product.image_url : PLACEHOLDER_IMAGE;
        previewImg.onerror = function() { this.src = PLACEHOLDER_IMAGE; };
    }
    if (product.description && editor) {
        editor.innerHTML = product.description;
        document.getElementById('prodDescription').value = product.description;
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
};

window.closeProductModal = function() {
    const modal = document.getElementById('productModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
};

async function saveOnlineDetails(productId, fields) {
    const payload = { product_id: productId, ...fields, updated_at: new Date().toISOString() };
    return await erp.from('online_product_details').upsert(payload, { onConflict: 'product_id' });
}

window.saveProduct = async function(event) {
    event.preventDefault();
    syncDescription();

    const productId = document.getElementById('prodId')?.value;
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const showOnline = !!document.getElementById('prodShowOnline')?.checked;
    const parentType = document.getElementById('prodParentType')?.value || null;
    const shopCategory = document.getElementById('prodCategory')?.value || null;

    const overrideRaw = (document.getElementById('prodPriceOverride')?.value || '').trim();
    let priceOverride = null;
    if (overrideRaw !== '') {
        priceOverride = parseFloat(overrideRaw);
        if (!(priceOverride > 0)) {
            window.showToast('Custom price must be more than 0. Leave it empty to use the ERP price.', 'warning', 'Invalid Price');
            return;
        }
        priceOverride = Math.round(priceOverride * 100) / 100;
    }
    const effectivePrice = priceOverride !== null ? priceOverride : parseFloat(product.auto_price || 0);

    if (showOnline) {
        if (!parentType || !shopCategory) {
            window.showToast('Choose a Parent Type and Category so the shop knows where to show this product.', 'warning', 'Missing Selection');
            return;
        }
        if (!(effectivePrice > 0)) {
            window.showToast('This product has no price in the ERP yet (no purchase cost). Receive stock in the ERP first, then show it on the shop.', 'warning', 'No Price Yet', 6000);
            return;
        }
    }

    const result = await saveOnlineDetails(productId, {
        show_online: showOnline,
        price_override: priceOverride,
        parent_type: parentType,
        shop_category: shopCategory,
        shop_sub_category: document.getElementById('prodSubCategory')?.value || null,
        bundle: document.getElementById('prodBundle')?.value || null,
        tag: document.getElementById('prodTag')?.value || null,
        image_url: document.getElementById('prodImageUrl')?.value || null,
        is_trending: !!document.getElementById('prodIsTrending')?.checked,
        featured_home: !!document.getElementById('prodFeaturedHome')?.checked,
        health_essentials: !!document.getElementById('prodHealthEssentials')?.checked,
        description: document.getElementById('prodDescription')?.value || null
    });

    if (result?.error) {
        window.showToast('Error saving: ' + result.error.message, 'error');
    } else {
        window.showToast(showOnline ? 'Saved. The product is live on the shop.' : 'Saved. The product is hidden from the shop.', 'success');
        closeProductModal();
        await loadProducts();
        await loadDashboardStats();
        await loadAllMedicines();
    }
};

window.toggleHomeFlag = async function(id, col, box) {
    const allowed = ['is_trending', 'featured_home', 'health_essentials'];
    const product = allProducts.find(p => p.id === id);
    if (!product || !allowed.includes(col)) return;
    const value = !!box.checked;
    box.disabled = true;
    const { error } = await saveOnlineDetails(id, { [col]: value });
    box.disabled = false;
    if (error) {
        box.checked = !value;
        window.showToast('Error: ' + error.message, 'error');
        return;
    }
    product[col] = value;
    if (!product.show_online && value) {
        window.showToast('Ticked, but this product is hidden from the shop, so it will not appear on the home page until it is live.', 'warning', 'Product Hidden', 6000);
    } else {
        window.showToast('Home page updated', 'success');
    }
};

window.editProduct = function(id) { openProductModal(id); };

window.toggleOnline = async function(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product || product.needs_online_details) return;
    const makeLive = !product.show_online;
    if (makeLive && !(parseFloat(product.sale_price) > 0)) {
        window.showToast('This product has no price in the ERP yet, so it cannot go live.', 'warning', 'No Price Yet');
        return;
    }
    if (makeLive && (!product.parent_type || !product.shop_category)) {
        window.showToast('Open the product and choose a Parent Type and Category first.', 'warning', 'Missing Selection');
        return;
    }
    const { error } = await saveOnlineDetails(id, { show_online: makeLive });
    if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
    window.showToast(makeLive ? 'Now live on the shop' : 'Hidden from the shop', 'success');
    await loadProducts();
    await loadDashboardStats();
};

// Products are never created or deleted here any more (the ERP owns the product list).
window.deleteProduct = function() {
    window.showToast('Products are managed in the ERP. Use the eye button to hide a product from the shop.', 'info');
};

// Ask for the ERP login the first time the Products tab is opened
document.querySelector('[data-tab="products"]')?.addEventListener('click', () => {
    if (!erpStaffReady) loadProducts(true);
});

/* ==========================================================================
   9. BULK ADD PRODUCTS
   ========================================================================== */
window.openBulkAddModal = function() {
    window.showToast('Products are managed in the ERP now. Bulk add/edit is switched off here.', 'info'); return;
    const modal = document.getElementById('bulkAddModal');
    if (modal) {
        document.getElementById('bulkCsvFile').value = '';
        document.getElementById('csvPreviewContainer').style.display = 'none';
        currentCSVData = [];
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
};

window.closeBulkAddModal = function() {
    const modal = document.getElementById('bulkAddModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
};

window.downloadSampleCSV = function() {
    const sampleData = [
        ['name', 'brand', 'parent_type', 'category', 'sub_category', 'active_ingredient', 'bundle', 'price', 'original_price', 'is_promotion', 'is_trending', 'description'],
        ['Paracetamol 500mg', 'GSK', 'medicine', 'otc', 'pain_fever_relief', 'Paracetamol', 'pain-relief', '25.00', '35.00', 'false', 'false', 'Fast acting pain reliever'],
        ['Amoxicillin 250mg', 'Pfizer', 'medicine', 'prescription', 'antibiotics', 'Amoxicillin', 'antibiotics', '45.00', '', 'true', 'false', 'Broad spectrum antibiotic']
    ];
    
    const csvContent = sampleData.map(row => row.join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_add_products_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
};

function parseCSV(content) {
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        let line = lines[i];
        const values = [];
        let inQuote = false;
        let currentValue = '';
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                values.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue.trim());
        
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    return { headers, data };
}

window.previewCSVFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const { headers, data } = parseCSV(e.target.result);
        const requiredHeaders = ['name', 'price'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) {
            alert(`Missing required columns: ${missingHeaders.join(', ')}`);
            return;
        }
        currentCSVData = data;
        document.getElementById('csvPreviewCount').textContent = data.length;
        const previewList = document.getElementById('csvPreviewList');
        if (previewList && data.length) {
            previewList.innerHTML = data.map((item, index) => `
                <div class="preview-item ${!item.name || !item.price ? 'error' : ''}">
                    <span class="preview-name">${index + 1}. ${escapeHtml(item.name || 'Missing name')}</span>
                    <span class="preview-details">
                        ${escapeHtml(item.brand || 'No brand')} | ${item.category || 'No category'} | 
                        Price: ${item.price ? 'ZMW ' + parseFloat(item.price).toFixed(2) : 'Missing'} | 
                        Stock: ${item.stock || '100'}
                    </span>
                </div>
            `).join('');
        }
        document.getElementById('csvPreviewContainer').style.display = 'block';
    };
    reader.readAsText(file);
};

window.clearCSVPreview = function() {
    document.getElementById('bulkCsvFile').value = '';
    document.getElementById('csvPreviewContainer').style.display = 'none';
    currentCSVData = [];
};

window.confirmBulkImport = async function() {
    window.showToast('Products are managed in the ERP now. Bulk add/edit is switched off here.', 'info'); return;
    if (!currentCSVData.length) { 
        window.showToast('No data to import', 'warning', 'Empty Data');
        return; 
    }
    
    const validProducts = [];
    const errors = [];
    
    for (let i = 0; i < currentCSVData.length; i++) {
        const item = currentCSVData[i];
        
        if (!item.name) {
            errors.push(`Row ${i + 1}: Missing product name`);
            continue;
        }
        if (!item.price) {
            errors.push(`Row ${i + 1}: Missing price for ${item.name}`);
            continue;
        }
        
        const productData = {
            name: item.name,
            brand: item.brand || 'Generic',
            parent_type: item.parent_type || 'medicine',
            category: item.category || 'uncategorized',
            sub_category: item.sub_category || null,
            active_ingredient: item.active_ingredient || null,
            bundle: item.bundle || null,
            tag: item.tag || null,
            price: parseFloat(item.price) || 0,
            original_price: item.original_price ? parseFloat(item.original_price) : null,
            stock: parseInt(item.stock) || 100,
            is_promotion: item.is_promotion === 'true' || item.is_promotion === 'yes' || false,
            is_trending: item.is_trending === 'true' || item.is_trending === 'yes' || false,
            featured_home: item.featured_home === 'true' || false,
            description: item.description || null,
            image_url: item.image_url || null
        };
        validProducts.push(productData);
    }
    
    if (errors.length > 0) {
        window.showToast(`Errors found:\n${errors.join('\n')}`, 'error', 'Validation Errors');
        return;
    }
    
    if (!validProducts.length) {
        window.showToast('No valid products to import', 'warning', 'Invalid Data');
        return;
    }
    
    // Replace confirm with custom confirm
    const confirmed = await window.customConfirm(
        `Import ${validProducts.length} products?`,
        'Confirm Import',
        'Yes, Import',
        'Cancel'
    );
    if (!confirmed) return;
    
    let success = 0, fail = 0;
    const failedProducts = [];
    
    for (const product of validProducts) {
        const { error } = await supabase.from('products').insert([product]);
        if (error) {
            fail++;
            failedProducts.push(product.name);
            console.error('Error importing:', product.name, error);
        } else {
            success++;
        }
    }
    
    let message = `✅ Import complete!\nAdded: ${success}\nFailed: ${fail}`;
    if (failedProducts.length > 0) {
        message += `\n\nFailed products:\n${failedProducts.slice(0, 10).join('\n')}`;
        if (failedProducts.length > 10) message += `\n... and ${failedProducts.length - 10} more`;
    }
    
    await window.customAlert(message, 'Import Complete', 'info');
    
    closeBulkAddModal();
    await loadProducts();
    await loadDashboardStats();
    await loadDropdownOptions();
    await loadAllMedicines();
};

/* ==========================================================================
   10. BULK EDIT PRODUCTS (SIMPLIFIED)
   ========================================================================== */
window.downloadProductsCSV = function() {
    if (!allProducts?.length) { alert('No products to export'); return; }
    
    const headers = ['id', 'name', 'brand', 'active_ingredient', 'price', 'original_price'];
    
    const rows = [headers];
    
    for (const product of allProducts) {
        rows.push([
            product.id || '',
            `"${(product.name || '').replace(/"/g, '""')}"`,
            `"${(product.brand || '').replace(/"/g, '""')}"`,
            `"${(product.active_ingredient || '').replace(/"/g, '""')}"`,
            product.price || 0,
            product.original_price || ''
        ]);
    }
    
    const csvContent = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_edit_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    window.showToast(`✅ Exported ${allProducts.length} products with edit-friendly fields`, 'success', 'Export Complete');
};

window.previewEditCSVFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const { headers, data } = parseCSV(e.target.result);
        if (!headers.includes('id')) { alert('CSV must contain an "id" column'); return; }
        
        const validUpdates = [];
        const invalidUpdates = [];
        
        for (const item of data) {
            if (!item.id) { 
                invalidUpdates.push({ id: 'Missing ID' }); 
                continue; 
            }
            const product = allProducts.find(p => p.id === item.id);
            if (!product) { 
                invalidUpdates.push({ id: item.id }); 
                continue; 
            }
            
            const updates = {};
            if (item.name && item.name !== product.name) updates.name = item.name;
            if (item.brand && item.brand !== product.brand) updates.brand = item.brand;
            if (item.active_ingredient && item.active_ingredient !== product.active_ingredient) updates.active_ingredient = item.active_ingredient;
            if (item.price && parseFloat(item.price) !== product.price) updates.price = parseFloat(item.price);
            if (item.original_price !== undefined && item.original_price !== '') {
                const newOriginalPrice = parseFloat(item.original_price);
                if (!isNaN(newOriginalPrice)) {
                    updates.original_price = newOriginalPrice;
                } else if (item.original_price === '') {
                    updates.original_price = null;
                }
            }
            
            if (Object.keys(updates).length) validUpdates.push({ id: item.id, product, updates });
        }
        
        currentEditData = validUpdates;
        const summaryDiv = document.getElementById('updateSummary');
        if (summaryDiv) {
            summaryDiv.innerHTML = `
                <div class="update-summary">
                    <strong>📊 Update Summary</strong><br>
                    Products to update: <span class="summary-success">${validUpdates.length}</span><br>
                    ${invalidUpdates.length ? `<span class="summary-error">⚠️ Invalid entries: ${invalidUpdates.length}</span>` : ''}
                </div>
            `;
        }
        document.getElementById('editCsvPreviewContainer').style.display = 'block';
    };
    reader.readAsText(file);
};

window.clearEditCSVPreview = function() {
    document.getElementById('editCsvFile').value = '';
    document.getElementById('editCsvPreviewContainer').style.display = 'none';
    currentEditData = [];
};

window.confirmBulkEdit = async function() {
    window.showToast('Products are managed in the ERP now. Bulk add/edit is switched off here.', 'info'); return;
    if (!currentEditData.length) { 
        window.showToast('No valid updates to apply', 'warning', 'Empty Data');
        return; 
    }
    
    const confirmed = await window.customConfirm(
        `Apply updates to ${currentEditData.length} products?`,
        'Confirm Bulk Edit',
        'Yes, Apply',
        'Cancel'
    );
    if (!confirmed) return;
    
    let success = 0, fail = 0;
    const failedUpdates = [];
    
    for (const item of currentEditData) {
        const { error } = await supabase.from('products').update(item.updates).eq('id', item.id);
        if (error) {
            fail++;
            failedUpdates.push(item.product.name);
            console.error('Error updating product:', item.product.name, error);
        } else {
            success++;
        }
    }
    
    let message = `✅ Bulk Edit Complete!\nUpdated: ${success}\nFailed: ${fail}`;
    if (failedUpdates.length > 0) {
        message += `\n\nFailed products:\n${failedUpdates.slice(0, 10).join('\n')}`;
        if (failedUpdates.length > 10) message += `\n... and ${failedUpdates.length - 10} more`;
    }
    alert(message);
    
    closeBulkEditModal();
    await loadProducts();
    await loadDashboardStats();
    await loadDropdownOptions();
    await loadAllMedicines();
};

window.openBulkEditModal = function() {
    window.showToast('Products are managed in the ERP now. Bulk add/edit is switched off here.', 'info'); return;
    const modal = document.getElementById('bulkEditModal');
    if (modal) {
        document.getElementById('editCsvFile').value = '';
        document.getElementById('editCsvPreviewContainer').style.display = 'none';
        currentEditData = [];
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
};

window.closeBulkEditModal = function() {
    const modal = document.getElementById('bulkEditModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    currentEditData = [];
};

/* ==========================================================================
   11. ORDER MANAGEMENT
   ========================================================================== */
const statusFlow = {
    'pending': ['processing', 'cancelled'],
    'processing': ['ready_for_pickup', 'cancelled'],
    'ready_for_pickup': ['out_for_delivery'],
    'out_for_delivery': ['delivered'],
    'delivered': [],
    'awaiting_delivery_confirmation': ['processing', 'cancelled']
};

const statusConfig = {
    'pending': { label: 'Pending', class: 'status-pending', icon: 'fa-clock' },
    'processing': { label: 'Processing', class: 'status-processing', icon: 'fa-cogs' },
    'ready_for_pickup': { label: 'Ready for Pickup', class: 'status-ready', icon: 'fa-box-open' },
    'out_for_delivery': { label: 'Out for Delivery', class: 'status-out-for-delivery', icon: 'fa-truck' },
    'delivered': { label: 'Delivered', class: 'status-delivered', icon: 'fa-check-circle' },
    'cancelled': { label: 'Cancelled', class: 'status-cancelled', icon: 'fa-times-circle' },
    'awaiting_delivery_confirmation': { label: 'Awaiting Courier', class: 'status-warning', icon: 'fa-clock' }
};

const paymentStatusConfig = {
    'pending': { label: 'Pending', class: 'status-pending', icon: 'fa-clock' },
    'paid': { label: 'Paid', class: 'status-delivered', icon: 'fa-check-circle' }
};

const canMarkPaid = ['processing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

async function loadOrders() {
    try {
        const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        allOrders = data || [];
        renderOrdersTable(allOrders);
        updateOrderStats(allOrders);
        await updateDashboardOrderCounts();
    } catch (err) { console.error('Error loading orders:', err); }
}

function updateOrderStats(orders) {
    const pending = orders.filter(o => o.order_status === 'pending').length;
    const processing = orders.filter(o => o.order_status === 'processing').length;
    const readyForPickup = orders.filter(o => o.order_status === 'ready_for_pickup').length;
    const outForDelivery = orders.filter(o => o.order_status === 'out_for_delivery').length;
    const delivered = orders.filter(o => o.order_status === 'delivered').length;
    
    const pendingEl = document.getElementById('pendingOrders');
    const processingEl = document.getElementById('processingOrders');
    const readyForPickupEl = document.getElementById('readyForPickupOrders');
    const outForDeliveryEl = document.getElementById('outForDeliveryOrders');
    const deliveredEl = document.getElementById('deliveredOrders');
    
    if (pendingEl) pendingEl.textContent = pending;
    if (processingEl) processingEl.textContent = processing;
    if (readyForPickupEl) readyForPickupEl.textContent = readyForPickup;
    if (outForDeliveryEl) outForDeliveryEl.textContent = outForDelivery;
    if (deliveredEl) deliveredEl.textContent = delivered;
}

async function getRiderName(riderId) {
    if (!riderId) return 'Unassigned';
    try {
        const { data } = await supabase.from('profiles').select('name').eq('id', riderId).single();
        return data?.name || 'Unknown';
    } catch {
        return 'Unknown';
    }
}

function renderOrdersTable(orders) {
    const tbody = document.getElementById('ordersList');
    if (!tbody) return;
    if (!orders?.length) { tbody.innerHTML = '<tr><td colspan="9">No orders found<\/tr>'; return; }
    
    tbody.innerHTML = orders.map(order => {
        const currentStatus = order.order_status || 'pending';
        const nextStatuses = statusFlow[currentStatus] || [];
        const itemCount = order.items?.length || 0;
        const paymentStatus = order.payment_status || 'pending';
        const canMarkPaidNow = canMarkPaid.includes(currentStatus) && paymentStatus !== 'paid';
        const riderName = order.rider_name || (order.rider_id ? 'Assigned' : 'Unassigned');
        
        return `
            <tr>
                <td><strong>#${order.id.slice(0,8)}</strong></td>
                <td>
                    ${escapeHtml(order.customer_name || 'Guest')}
                    ${order.customer_phone ? `<br><small>${escapeHtml(order.customer_phone)}</small>` : ''}
                </td>
                <td class="text-center">${itemCount}</td>
                <td class="text-right">ZMW ${parseFloat(order.total || 0).toFixed(2)}</div>
                <td class="text-center">
                    <span class="status-badge ${paymentStatusConfig[paymentStatus]?.class}">${paymentStatusConfig[paymentStatus]?.label}</span>
                 </div>
                <td class="text-center">
                    <span class="status-badge ${statusConfig[currentStatus]?.class || 'status-pending'}">
                        <i class="fas ${statusConfig[currentStatus]?.icon || 'fa-clock'}"></i> ${statusConfig[currentStatus]?.label || currentStatus}
                    </span>
                    ${order.is_outsourced_delivery ? '<br><small class="outsourced-badge">🚚 Outsourced</small>' : ''}
                 </div>
                <td>${riderName}</div>
                <td class="text-nowrap">${new Date(order.created_at).toLocaleDateString()}</div>
                <td>
                    <div class="action-group">
                        <button class="action-btn view" onclick="viewInvoice('${order.id}')" title="View Invoice">
                            <i class="fas fa-file-invoice"></i>
                        </button>
                        ${canMarkPaidNow ? `<button class="action-btn edit" onclick="markPaymentAsPaid('${order.id}')" title="Mark as Paid">
                            <i class="fas fa-check-circle"></i>
                        </button>` : ''}
                        ${(currentStatus === 'ready_for_pickup' || currentStatus === 'awaiting_delivery_confirmation') && !order.rider_id ? 
                            `<button class="action-btn rider" onclick="openAssignRiderModal('${order.id}')" title="Assign Rider">
                                <i class="fas fa-motorcycle"></i>
                            </button>` : ''}
                        ${nextStatuses.length > 0 ? `
                            <select onchange="updateOrderStatus('${order.id}', this.value)" class="status-select">
                                <option value="">Update</option>
                                ${nextStatuses.map(status => `<option value="${status}">→ ${statusConfig[status]?.label}</option>`).join('')}
                            </select>
                        ` : currentStatus === 'delivered' ? `<span class="status-complete">✓ Complete</span>` : ''}
                    </div>
                 </div>
            </tr>
        `;
    }).join('');
    
    // Fetch rider names asynchronously and update the table
    orders.forEach(async (order) => {
        if (order.rider_id && (!order.rider_name || order.rider_name === 'Unassigned')) {
            const riderName = await getRiderName(order.rider_id);
            if (riderName && riderName !== 'Unassigned' && riderName !== 'Unknown') {
                const rows = tbody.querySelectorAll('tr');
                for (const row of rows) {
                    const firstCell = row.cells[0];
                    if (firstCell && firstCell.textContent.includes(order.id.slice(0,8))) {
                        const riderCell = row.cells[6];
                        if (riderCell) riderCell.textContent = riderName;
                        break;
                    }
                }
                order.rider_name = riderName;
            }
        }
    });
}

window.filterOrders = function() {
    const searchTerm = document.getElementById('orderSearch')?.value.toLowerCase() || '';
    const status = document.getElementById('orderStatusFilter')?.value || 'all';
    const dateFilter = document.getElementById('orderDateFilter')?.value || '';
    
    let filtered = [...allOrders];
    if (searchTerm) filtered = filtered.filter(o => o.id.toLowerCase().includes(searchTerm) || o.customer_name?.toLowerCase().includes(searchTerm) || o.customer_phone?.toLowerCase().includes(searchTerm));
    if (status !== 'all') filtered = filtered.filter(o => (o.order_status || o.status) === status);
    if (dateFilter) filtered = filtered.filter(o => new Date(o.created_at).toDateString() === new Date(dateFilter).toDateString());
    renderOrdersTable(filtered);
};

window.filterByStatus = function(status) {
    const statusFilter = document.getElementById('orderStatusFilter');
    if (statusFilter) statusFilter.value = status;
    filterOrders();
};

window.updateOrderStatus = async function(orderId, newStatus) {
    if (!newStatus) return;
    const order = allOrders.find(o => o.id === orderId);
    if (!order) { showToast('Order not found', 'error'); return; }
    
    const currentStatus = order.order_status || order.status || 'pending';
    const allowedNextStatuses = statusFlow[currentStatus] || [];
    
    if (!allowedNextStatuses.includes(newStatus)) {
        showToast(`Cannot change from "${statusConfig[currentStatus]?.label}" to "${statusConfig[newStatus]?.label}"`, 'warning');
        document.querySelectorAll('.status-select').forEach(select => select.value = '');
        return;
    }
    
    let confirmMessage = `Confirm status update:\n\nOrder #${order.id.slice(0,8)}\nFrom: ${statusConfig[currentStatus]?.label}\nTo: ${statusConfig[newStatus]?.label}\n\nProceed?`;
if (newStatus === 'cancelled') {
    confirmMessage = `⚠️ WARNING: You are about to CANCEL this order!\n\nOrder #${order.id.slice(0,8)}\nTotal Amount: ZMW ${order.total || order.total_price}\n\nThis action cannot be undone.\n\nProceed with cancellation?`;
}

const confirmed = await window.customConfirm(confirmMessage, 'Confirm Status Update', 'Proceed', 'Cancel');
if (!confirmed) {
    document.querySelectorAll('.status-select').forEach(select => select.value = '');
    return;
}
    
    const updateData = { 
        order_status: newStatus,
        updated_at: new Date().toISOString() 
    };
    if (newStatus === 'delivered') updateData.actual_delivery_time = new Date().toISOString();
    if (newStatus === 'out_for_delivery') updateData.rider_started_at = new Date().toISOString();
    
    const { error } = await supabase.from('orders').update(updateData).eq('id', orderId);
    if (error) {
        showToast('Error updating order status: ' + error.message, 'error');
    } else {
        showToast(`Order status updated to ${statusConfig[newStatus]?.label}!`, 'success');
        await loadOrders();
        await loadDashboardStats();
    }
};

window.markPaymentAsPaid = async function(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) { showToast('Order not found', 'error'); return; }
    const currentStatus = order.order_status || order.status || 'pending';
    
    if (order.payment_status === 'paid') { showToast('Payment is already marked as paid!', 'warning'); return; }
    if (!canMarkPaid.includes(currentStatus)) {
        showToast(`Payment can only be marked as paid when order status is: ${canMarkPaid.map(s => statusConfig[s]?.label).join(', ')}`, 'warning');
        return;
    }
    const confirmed = await window.customConfirm(
        `Confirm payment received:\n\nOrder #${order.id.slice(0,8)}\nCustomer: ${order.customer_name}\nTotal: ZMW ${order.total || order.total_price}\n\nProceed to mark as PAID?`,
        'Confirm Payment',
        'Yes, Mark as Paid',
        'Cancel'
    );
    if (!confirmed) return;
    
    const { error } = await supabase.from('orders').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) {
        showToast('Error updating payment status: ' + error.message, 'error');
    } else {
        showToast('Payment marked as PAID!', 'success');
        await loadOrders();
        await loadDashboardStats();
    }
};

window.viewInvoice = async function(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    
    const items = order.items || [];
    const subtotal = order.subtotal || items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
    const deliveryFee = order.delivery_charge || 0;
    const total = order.total || (subtotal + deliveryFee);
    const isPaid = order.payment_status === 'paid';
    const isOutsourced = order.is_outsourced_delivery || false;
    const currentStatus = order.order_status || 'pending';
    
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
                    <div class="invoice-number">Invoice #${order.id.slice(0,12).toUpperCase()}</div>
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
                    <div><strong>Invoice Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</div>
                    <div><strong>Order Status:</strong> <span class="status-badge ${statusConfig[currentStatus]?.class}">${statusConfig[currentStatus]?.label || currentStatus}</span></div>
                    <div><strong>Payment Status:</strong> <span class="status-badge ${isPaid ? 'status-delivered' : 'status-pending'}">${isPaid ? 'PAID' : 'PENDING'}</span></div>
                </div>
            </div>
            
            <table class="invoice-paper-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Unit Price (ZMW)</th>
                        <th>Total (ZMW)</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item, idx) => `
                        <tr>
                            <td class="text-center">${idx + 1}</div>
                            <td><strong>${escapeHtml(item.name)}</strong>${item.dosage_instructions ? `<br><small>${escapeHtml(item.dosage_instructions)}</small>` : ''}</div>
                            <td class="text-center">${item.qty || 1}</div>
                            <td class="text-right">${(item.price || 0).toFixed(2)}</div>
                            <td class="text-right">${((item.price || 0) * (item.qty || 1)).toFixed(2)}</div>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" class="text-right"><strong>Subtotal:</strong></div>
                        <td class="text-right"><strong>${subtotal.toFixed(2)}</strong></div>
                    </tr>
                    <tr>
                        <td colspan="4" class="text-right"><strong>Delivery Fee:</strong></div>
                        <td class="text-right"><strong>${deliveryFee.toFixed(2)}</strong></div>
                    </tr>
                    ${isOutsourced ? `
                    <tr>
                        <td colspan="4" class="text-right"><strong>Outsourced Delivery:</strong></div>
                        <td class="text-right"><strong>Included</strong></div>
                    </tr>
                    ` : ''}
                    <tr class="invoice-grand-total">
                        <td colspan="4" class="text-right"><strong>GRAND TOTAL:</strong></div>
                        <td class="text-right"><strong>ZMW ${total.toFixed(2)}</strong></div>
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
    if (invoiceContent) invoiceContent.innerHTML = invoiceHtml;
    
    const invoiceModal = document.getElementById('invoiceModal');
    if (invoiceModal) {
        invoiceModal.classList.add('active');
        invoiceModal.style.display = 'flex';
    }
};

window.printInvoice = function() {
    const invoiceContent = document.getElementById('invoiceContent');
    if (!invoiceContent) return;
    
    // Get the invoice HTML content
    const invoiceHTML = invoiceContent.innerHTML;
    if (!invoiceHTML || invoiceHTML.includes('Loading invoice')) {
        window.showToast('Please wait for invoice to load before printing.', 'warning');
        return;
    }
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        window.showToast('Please allow popups for printing', 'warning', 'Print Blocked');
        return;
    }
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Tax Invoice - Griffins Medicals</title>
            <style>
                /* Reset */
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    background: white; 
                    font-family: 'Inter', Arial, sans-serif;
                    padding: 20px;
                    margin: 0;
                }
                /* Force all colors to print */
                * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color-adjust: exact !important;
                }
                /* Invoice styles */
                .invoice-paper {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 2rem;
                    background: white;
                    color: black;
                }
                .invoice-paper-header {
                    text-align: center;
                    border-bottom: 2px solid #1a5c3a;
                    padding-bottom: 1rem;
                    margin-bottom: 1.5rem;
                }
                .invoice-logo-section h1 {
                    color: #1a5c3a;
                    font-size: 1.5rem;
                    margin-bottom: 0.5rem;
                }
                .invoice-logo-section p {
                    color: #333;
                    font-size: 0.75rem;
                    margin: 0.2rem 0;
                }
                .invoice-title-section h2 {
                    font-size: 1.2rem;
                    color: #000;
                    margin-top: 0.5rem;
                }
                .invoice-number {
                    font-family: monospace;
                    font-size: 0.8rem;
                    color: #333;
                    background: #f0f0f0;
                    padding: 0.2rem 1rem;
                    border-radius: 20px;
                    display: inline-block;
                    margin-top: 0.3rem;
                }
                .invoice-paper-customer {
                    display: flex;
                    justify-content: space-between;
                    padding: 1rem;
                    background: #f8f8f8;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    margin-bottom: 1.5rem;
                }
                .invoice-bill-to p {
                    margin: 0.2rem 0;
                    font-size: 0.85rem;
                    color: #000;
                }
                .invoice-details div {
                    margin: 0.3rem 0;
                    font-size: 0.85rem;
                    color: #000;
                }
                .invoice-paper-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 1.5rem;
                }
                .invoice-paper-table th {
                    background: #1a3c34;
                    color: white;
                    padding: 0.6rem;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    border-bottom: 2px solid #000;
                }
                .invoice-paper-table td {
                    padding: 0.6rem;
                    border-bottom: 1px solid #ccc;
                    color: #000;
                    font-size: 0.85rem;
                }
                .invoice-grand-total {
                    background: #f5f5f5;
                    font-weight: 700;
                }
                .invoice-grand-total td {
                    border-top: 2px solid #000;
                    font-size: 1rem;
                }
                .invoice-paper-footer {
                    text-align: center;
                    margin-top: 2rem;
                    padding-top: 1rem;
                    border-top: 1px solid #ccc;
                }
                .invoice-paper-footer p {
                    color: #333;
                    font-size: 0.75rem;
                    margin: 0.2rem 0;
                }
                .status-badge {
                    display: inline-block;
                    padding: 0.2rem 0.8rem;
                    border-radius: 20px;
                    font-size: 0.7rem;
                    font-weight: 700;
                }
                .status-delivered {
                    background: #10b981;
                    color: white;
                }
                .status-pending {
                    background: #f59e0b;
                    color: white;
                }
                .status-processing {
                    background: #3b82f6;
                    color: white;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .text-left { text-align: left; }
                
                /* Print specific */
                @media print {
                    body { padding: 0; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            ${invoiceHTML}
            <div style="text-align:center;margin-top:20px;" class="no-print">
                <button onclick="window.print()" style="padding:10px 30px;background:#1a5c3a;color:white;border:none;border-radius:5px;font-size:16px;cursor:pointer;">🖨️ Print Invoice</button>
                <button onclick="window.close()" style="padding:10px 30px;background:#666;color:white;border:none;border-radius:5px;font-size:16px;cursor:pointer;margin-left:10px;">Close</button>
            </div>
            <script>
                // Auto-print after load
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
};

window.closeInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
};

window.exportOrders = function() {
    const headers = ['Order ID', 'Customer Name', 'Customer Phone', 'Total', 'Status', 'Payment Status', 'Payment Method', 'Delivery Fee', 'Delivery Distance', 'Outsourced', 'Date'];
    const rows = [headers];
    
    allOrders.forEach(order => {
        rows.push([
            order.id,
            order.customer_name || '',
            order.customer_phone || '',
            order.total || 0,
            order.order_status || 'pending',
            order.payment_status || 'pending',
            order.payment_method || 'cod',
            order.delivery_charge || 0,
            order.delivery_distance_km ? order.delivery_distance_km.toFixed(1) + ' km' : 'N/A',
            order.is_outsourced_delivery ? 'Yes' : 'No',
            new Date(order.created_at).toLocaleString()
        ]);
    });
    
    const csvContent = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${allOrders.length} orders`, 'success');
};

window.viewOrderDetails = async function(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) {
        showToast('Order not found', 'error');
        return;
    }
    
    const riderName = await getRiderName(order.rider_id);
    const items = order.items || [];
    const totalAmount = order.total || 0;
    const deliveryCharge = order.delivery_charge || 0;
    const deliveryDistance = order.delivery_distance_km || 0;
    const currentStatus = order.order_status || 'pending';
    
    const content = document.getElementById('orderDetailContent');
    if (content) {
        content.innerHTML = `
            <div class="order-detail-section">
                <h4>Order Information</h4>
                <div class="detail-grid">
                    <div><strong>Order ID:</strong> ${order.id.slice(0,8).toUpperCase()}</div>
                    <div><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</div>
                    <div><strong>Status:</strong> <span class="status-badge ${statusConfig[currentStatus]?.class || 'status-pending'}">${statusConfig[currentStatus]?.label || currentStatus}</span></div>
                    <div><strong>Payment Status:</strong> <span class="status-badge ${paymentStatusConfig[order.payment_status]?.class}">${paymentStatusConfig[order.payment_status]?.label}</span></div>
                    <div><strong>Payment Method:</strong> ${order.payment_method === 'cod' ? 'Cash on Delivery' : (order.payment_method || 'N/A')}</div>
                    <div><strong>Delivery Distance:</strong> ${deliveryDistance > 0 ? deliveryDistance.toFixed(1) + ' km' : 'N/A'}</div>
                    <div><strong>Delivery Charge:</strong> ZMW ${deliveryCharge.toFixed(2)}</div>
                    <div><strong>Subtotal:</strong> ZMW ${(order.subtotal || 0).toFixed(2)}</div>
                    <div><strong>Total Amount:</strong> ZMW ${totalAmount.toFixed(2)}</div>
                    ${order.is_outsourced_delivery ? '<div><strong>Delivery Type:</strong> <span class="outsourced-badge">🚚 Outsourced Courier</span></div>' : ''}
                </div>
            </div>
            
            <div class="order-detail-section">
                <h4>Customer Information</h4>
                <div class="detail-grid">
                    <div><strong>Name:</strong> ${escapeHtml(order.customer_name || 'N/A')}</div>
                    <div><strong>Phone:</strong> ${escapeHtml(order.customer_phone || 'N/A')}</div>
                    <div><strong>Delivery Address:</strong> ${escapeHtml(order.delivery_address || 'N/A')}</div>
                    ${order.delivery_lat && order.delivery_lng ? `<div><strong>Location:</strong> ${order.delivery_lat.toFixed(6)}, ${order.delivery_lng.toFixed(6)}</div>` : ''}
                </div>
            </div>
            
            <div class="order-detail-section">
                <h4>Rider Information</h4>
                <div class="detail-grid">
                    <div><strong>Assigned Rider:</strong> ${riderName}</div>
                    ${order.rider_id ? `<div><button class="small-btn" onclick="openAssignRiderModal('${order.id}')">Change Rider</button></div>` : '<div><button class="small-btn" onclick="openAssignRiderModal(\'${order.id}\')">Assign Rider</button></div>'}
                    ${order.rider_started_at ? `<div><strong>Rider Started:</strong> ${new Date(order.rider_started_at).toLocaleString()}</div>` : ''}
                    ${order.actual_delivery_time ? `<div><strong>Delivered At:</strong> ${new Date(order.actual_delivery_time).toLocaleString()}</div>` : ''}
                </div>
            </div>
            
            <div class="order-detail-section">
                <h4>Order Items</h4>
                <div class="items-table">
                    <div class="items-header">
                        <span>Product</span>
                        <span>Qty</span>
                        <span>Unit Price</span>
                        <span>Total</span>
                    </div>
                    ${items.map(item => `
                        <div class="items-row">
                            <span><strong>${escapeHtml(item.name)}</strong></span>
                            <span>${item.qty || 1}</span>
                            <span>ZMW ${(item.price || 0).toFixed(2)}</span>
                            <span>ZMW ${((item.price || 0) * (item.qty || 1)).toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    openModal('orderDetailModal');
};

/* ==========================================================================
   12. ASSIGN RIDER FUNCTIONS
   ========================================================================== */
async function loadRiders() {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'rider')
            .order('name');
        allRiders = data || [];
        renderRidersTable();
        populateRiderSelect();
    } catch (err) {
        console.error('Error loading riders:', err);
    }
}

function renderRidersTable() {
    const tbody = document.getElementById('ridersList');
    if (!tbody) return;
    
    if (!allRiders?.length) {
        tbody.innerHTML = '<tr><td colspan="5">No riders found</div><\/tr>';
        return;
    }
    
    tbody.innerHTML = allRiders.map(rider => `
        <tr>
            <td>${escapeHtml(rider.name || 'N/A')}</div>
            <td>${rider.email || 'N/A'}</div>
            <td>${rider.phone || 'N/A'}</div>
            <td><span class="status-badge ${rider.status === 'active' ? 'status-delivered' : 'status-pending'}">${rider.status || 'active'}</span></div>
            <td>
                <button class="action-btn edit" onclick="openEditRiderModal('${rider.id}')"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete" onclick="deleteRider('${rider.id}')"><i class="fas fa-trash"></i></button>
             </div>
        </tr>
    `).join('');
}

function populateRiderSelect() {
    const select = document.getElementById('riderSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Select a rider --</option>';
    allRiders.filter(r => r.status !== 'inactive').forEach(rider => {
        const option = document.createElement('option');
        option.value = rider.id;
        option.textContent = `${rider.name} (${rider.phone || 'No phone'})`;
        select.appendChild(option);
    });
}

window.openAssignRiderModal = async function(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    
    document.getElementById('assignOrderId').value = orderId;
    document.getElementById('assignDeliveryAddress').value = order.delivery_address || 'Store Pickup';
    document.getElementById('assignOrderStatus').value = order.order_status || order.status;
    
    await loadRiders();
    openModal('assignRiderModal');
};

window.confirmAssignRider = async function() {
    const orderId = document.getElementById('assignOrderId').value;
    const riderId = document.getElementById('riderSelect').value;
    
    if (!riderId) {
        showToast('Please select a rider', 'warning');
        return;
    }
    
    const order = allOrders.find(o => o.id === orderId);
    const currentStatus = order?.order_status || order?.status;
    
    if (order && (currentStatus === 'awaiting_delivery_confirmation' || currentStatus === 'processing')) {
        const { error: statusError } = await supabase
            .from('orders')
            .update({ order_status: 'ready_for_pickup', updated_at: new Date().toISOString() })
            .eq('id', orderId);
        if (statusError) console.error('Error updating status:', statusError);
    }
    
    const { error } = await supabase
        .from('orders')
        .update({ rider_id: riderId, updated_at: new Date().toISOString() })
        .eq('id', orderId);
    
    if (error) {
        showToast('Error assigning rider: ' + error.message, 'error');
    } else {
        showToast('Rider assigned successfully!', 'success');
        closeModal('assignRiderModal');
        await loadOrders();
        await loadDashboardStats();
    }
};

window.openAddRiderModal = function() {
    document.getElementById('addRiderForm').reset();
    openModal('addRiderModal');
};

window.saveRider = async function(event) {
    event.preventDefault();
    
    const email = document.getElementById('riderEmail').value;
    const password = document.getElementById('riderPassword').value;
    const name = document.getElementById('riderName').value;
    const phone = document.getElementById('riderPhone').value;
    
    const { data, error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name, phone: phone, role: 'rider' } }
    });
    
    if (signUpError) {
        showToast('Error creating rider: ' + signUpError.message, 'error');
        return;
    }
    
    if (data?.user) {
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ role: 'rider', name: name, phone: phone, status: 'active' })
            .eq('id', data.user.id);
        
        if (profileError) {
            showToast('Error updating rider profile: ' + profileError.message, 'error');
        } else {
            showToast('Rider added successfully!', 'success');
            closeModal('addRiderModal');
            await loadRiders();
        }
    }
};

window.openEditRiderModal = function(riderId) {
    const rider = allRiders.find(r => r.id === riderId);
    if (!rider) return;
    
    document.getElementById('editRiderId').value = rider.id;
    document.getElementById('editRiderName').value = rider.name || '';
    document.getElementById('editRiderEmail').value = rider.email || '';
    document.getElementById('editRiderPhone').value = rider.phone || '';
    document.getElementById('editRiderStatus').value = rider.status || 'active';
    
    openModal('editRiderModal');
};

window.updateRider = async function(event) {
    event.preventDefault();
    
    const riderId = document.getElementById('editRiderId').value;
    const name = document.getElementById('editRiderName').value;
    const phone = document.getElementById('editRiderPhone').value;
    const status = document.getElementById('editRiderStatus').value;
    
    const { error } = await supabase
        .from('profiles')
        .update({ name, phone, status, updated_at: new Date().toISOString() })
        .eq('id', riderId);
    
    if (error) {
        showToast('Error updating rider: ' + error.message, 'error');
    } else {
        showToast('Rider updated successfully!', 'success');
        closeModal('editRiderModal');
        await loadRiders();
    }
};

window.deleteRider = async function(riderId) {
    const confirmed = await window.customConfirm(
        'Are you sure you want to delete this rider?',
        'Confirm Delete',
        'Yes, Delete',
        'Cancel'
    );
    
    if (!confirmed) return;
    
    const { error } = await supabase.from('profiles').delete().eq('id', riderId);
    if (error) {
        window.showToast('Error deleting rider: ' + error.message, 'error');
    } else {
        window.showToast('Rider deleted successfully!', 'success');
        await loadRiders();
    }
};

/* ==========================================================================
   13. PRESCRIPTION MANAGEMENT
   ========================================================================== */
async function loadAllMedicines() {
    // Medicines for quotations come from the ERP: all ERP products when signed in
    // with the ERP staff login, otherwise only the products live on the shop.
    try {
        let rows = [];
        if (erpStaffReady) {
            const { data, error } = await erp
                .from('online_admin_products')
                .select('id, name, brand, active_ingredient, sale_price, category, sub_category, shop_category, image_url, description')
                .order('name')
                .limit(5000);
            if (error) throw error;
            rows = (data || []).map(r => ({
                id: r.id, name: r.name, brand: r.brand, active_ingredient: r.active_ingredient,
                price: parseFloat(r.sale_price || 0), category: r.shop_category || r.category,
                sub_category: r.sub_category, image_url: r.image_url, description: r.description
            }));
        } else {
            const { data, error } = await erp
                .from('online_products')
                .select('id, name, brand, active_ingredient, price, category, sub_category, image_url, description')
                .order('name');
            if (error) throw error;
            rows = (data || []).map(r => ({ ...r, price: parseFloat(r.price || 0) }));
        }
        allMedicines = rows;
        return allMedicines;
    } catch (err) {
        console.error('Fatal error loading medicines:', err);
        allMedicines = [];
        return [];
    }
}

async function loadPrescriptions() {
    try {
        const { data } = await supabase
            .from('prescriptions')
            .select('*')
            .order('created_at', { ascending: false });
        allPrescriptions = data || [];
        renderPrescriptionsTable(allPrescriptions);
        updatePrescriptionStats(allPrescriptions);
    } catch (err) { 
        console.error('Error loading prescriptions:', err); 
    }
}

function updatePrescriptionStats(prescriptions) {
    const pendingCount = prescriptions.filter(p => p.status === 'pending').length;
    const quotedCount = prescriptions.filter(p => p.status === 'quotation_sent').length;
    const completedCount = prescriptions.filter(p => p.status === 'completed').length;
    
    const pendingEl = document.getElementById('pendingPrescCount');
    const quotedEl = document.getElementById('quotedPrescCount');
    const completedEl = document.getElementById('completedPrescCount');
    
    if (pendingEl) pendingEl.textContent = pendingCount;
    if (quotedEl) quotedEl.textContent = quotedCount;
    if (completedEl) completedEl.textContent = completedCount;
}

function renderPrescriptionsTable(prescriptions) {
    const tbody = document.getElementById('prescriptionsList');
    if (!tbody) return;
    
    if (!prescriptions?.length) { 
        tbody.innerHTML = '<tr><td colspan="6">No prescriptions found</div><\/tr>'; 
        return; 
    }
    
    tbody.innerHTML = prescriptions.map(p => {
        const statusConfigMap = {
            'pending': { class: 'status-pending', label: 'Pending Review', icon: 'fa-clock' },
            'quotation_sent': { class: 'status-processing', label: 'Quotation Sent', icon: 'fa-file-invoice' },
            'completed': { class: 'status-delivered', label: 'Completed', icon: 'fa-check-circle' }
        };
        const config = statusConfigMap[p.status] || statusConfigMap['pending'];
        
        return `
            <tr>
                <td>${new Date(p.created_at).toLocaleDateString()}</div>
                <td><strong>${p.user_id?.slice(0,8)}</strong>...${p.user_id?.slice(-4)}</div>
                <td>${escapeHtml(p.reference_name || 'Prescription Request')}</div>
                <td><button class="action-btn view" onclick="viewPrescriptionImage('${p.id}')"><i class="fas fa-file-image"></i> View</button></div>
                <td><span class="status-badge ${config.class}"><i class="fas ${config.icon}"></i> ${config.label}</span></div>
                <td>
                    ${p.status === 'pending' ? 
                        `<button class="action-btn edit" onclick="createQuotation('${p.id}')"><i class="fas fa-file-invoice-dollar"></i> Create Quote</button>` : 
                        p.status === 'quotation_sent' ? 
                        `<button class="action-btn view" onclick="viewQuotationDetails('${p.id}')"><i class="fas fa-eye"></i> View Quote</button>` : 
                        `<span class="status-complete"><i class="fas fa-check-circle"></i> Completed</span>`
                    }
                 </div>
            </tr>
        `;
    }).join('');
}

window.filterPrescriptions = function() {
    const searchTerm = document.getElementById('prescriptionSearch')?.value.toLowerCase() || '';
    const status = document.getElementById('prescriptionStatusFilter')?.value || 'all';
    
    let filtered = [...allPrescriptions];
    if (searchTerm) {
        filtered = filtered.filter(p => p.reference_name?.toLowerCase().includes(searchTerm) || p.user_id?.toLowerCase().includes(searchTerm));
    }
    if (status !== 'all') filtered = filtered.filter(p => p.status === status);
    renderPrescriptionsTable(filtered);
};

window.viewPrescriptionImage = async function(id) {
    const prescription = allPrescriptions.find(p => p.id === id);
    if (!prescription) return;
    
    const content = document.getElementById('prescriptionViewContent');
    if (content) {
        content.innerHTML = `
            <div class="prescription-detail">
                <div class="detail-section">
                    <h4>Prescription Information</h4>
                    <p><strong>Reference:</strong> ${escapeHtml(prescription.reference_name || 'Prescription Request')}</p>
                    <p><strong>Date:</strong> ${new Date(prescription.created_at).toLocaleString()}</p>
                    <p><strong>Patient ID:</strong> ${prescription.user_id}</p>
                    <p><strong>Status:</strong> <span class="status-badge status-pending">${prescription.status}</span></p>
                    ${prescription.admin_note ? `<p><strong>Note:</strong> ${escapeHtml(prescription.admin_note)}</p>` : ''}
                </div>
                <div class="detail-section">
                    <h4>Prescription Image</h4>
                    <img id="prescriptionViewImg" alt="Loading prescription..." class="prescription-image" onclick="if (this.getAttribute('src')) window.open(this.src)">
                    <p><small>Click image to view full size</small></p>
                </div>
            </div>
        `;
    }
    
    const modal = document.getElementById('prescriptionViewModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
};

window.closePrescriptionViewModal = function() {
    const modal = document.getElementById('prescriptionViewModal');
    if (modal) { 
        modal.classList.remove('active'); 
        modal.style.display = 'none'; 
    }
};

window.searchMedicines = function(query) {
    const resultsContainer = document.getElementById('medicineSearchResults');
    
    if (medicineSearchTimeout) {
        clearTimeout(medicineSearchTimeout);
    }
    
    if (!query || query.length < 2) { 
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
            resultsContainer.innerHTML = '';
        }
        return; 
    }
    
    medicineSearchTimeout = setTimeout(() => {
        if (!allMedicines || allMedicines.length === 0) {
            loadAllMedicines().then(() => {
                if (allMedicines && allMedicines.length > 0) {
                    performSearch(query, resultsContainer);
                } else if (resultsContainer) {
                    resultsContainer.innerHTML = `
                        <div class="no-results">
                            <i class="fas fa-database"></i>
                            <p>No products found in database.</p>
                            <small>Please add products in the Products tab first.</small>
                        </div>
                    `;
                    resultsContainer.style.display = 'block';
                }
            });
            return;
        }
        
        performSearch(query, resultsContainer);
    }, 300);
};

function performSearch(query, resultsContainer) {
    const searchTerm = query.toLowerCase().trim();
    
    const filtered = allMedicines.filter(medicine => {
        const nameMatch = medicine.name && medicine.name.toLowerCase().includes(searchTerm);
        const ingredientMatch = medicine.active_ingredient && medicine.active_ingredient.toLowerCase().includes(searchTerm);
        const brandMatch = medicine.brand && medicine.brand.toLowerCase().includes(searchTerm);
        return nameMatch || ingredientMatch || brandMatch;
    }).slice(0, 15);
    
    if (resultsContainer) {
        if (filtered.length > 0) {
            resultsContainer.innerHTML = filtered.map(medicine => `
                <div class="search-result-item" onclick="addMedicineToQuotation('${medicine.id}')">
                    <div class="search-result-info">
                        <span class="search-result-name">${escapeHtml(medicine.name)}</span>
                        ${medicine.brand ? `<span class="search-result-brand">${escapeHtml(medicine.brand)}</span>` : ''}
                        ${medicine.active_ingredient ? `<span class="search-result-ingredient">${escapeHtml(medicine.active_ingredient)}</span>` : ''}
                    </div>
                    <div class="search-result-price">ZMW ${(medicine.price || 0).toFixed(2)}</div>
                </div>
            `).join('');
            resultsContainer.style.display = 'block';
        } else { 
            resultsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <p>No medicines found for "${escapeHtml(query)}"</p>
                    <small>Try searching by name, brand, or active ingredient</small>
                </div>
            `; 
            resultsContainer.style.display = 'block'; 
        }
    }
}

window.addMedicineToQuotation = function(productId) {
    const product = allMedicines.find(m => m.id === productId);
    if (!product) {
        console.error('Product not found with ID:', productId);
        showToast('Product not found!', 'error');
        return;
    }
    
    const existingItem = quotationItems.find(item => item.product_id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
        existingItem.total = existingItem.price * existingItem.quantity;
        showToast(`Increased quantity of ${product.name} to ${existingItem.quantity}`, 'info');
    } else {
        quotationItems.push({ 
            product_id: product.id,
            name: product.name,
            price: product.price,
            active_ingredient: product.active_ingredient || '',
            brand: product.brand || '',
            image_url: product.image_url || PLACEHOLDER_IMAGE,
            description: product.description || '',
            dosage_instructions: '', 
            quantity: 1, 
            total: product.price 
        });
        showToast(`Added ${product.name} to quotation`, 'success');
    }
    
    renderQuotationItems();
    
    const searchInput = document.getElementById('medicineSearch');
    if (searchInput) searchInput.value = '';
    
    const resultsContainer = document.getElementById('medicineSearchResults');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
    }
};

function renderQuotationItems() {
    const tbody = document.getElementById('quotationItemsList');
    if (!tbody) return;
    
    if (quotationItems.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No items added yet. Search and add medicines above.<\/tr>';
        updateQuoteTotal();
        return; 
    }
    
    tbody.innerHTML = quotationItems.map((item, index) => `
        <tr>
            <td>
                <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    ${item.brand ? `<br><small>${escapeHtml(item.brand)}</small>` : ''}
                    ${item.active_ingredient ? `<br><small>${escapeHtml(item.active_ingredient)}</small>` : ''}
                </div>
             </div>
            <td>
                <input type="text" placeholder="e.g., Take 1 tablet twice daily" 
                    value="${escapeHtml(item.dosage_instructions)}" 
                    onchange="updateItemDosage(${index}, this.value)">
             </div>
            <td>
                <input type="number" value="${item.quantity}" min="1" 
                    onchange="updateItemQuantity(${index}, this.value)">
             </div>
            <td>
                <input type="number" value="${item.price}" step="0.01" 
                    onchange="updateItemPrice(${index}, this.value)">
             </div>
            <td class="item-total">ZMW ${item.total.toFixed(2)}</div>
            <td>
                <button class="action-btn delete" onclick="removeQuotationItem(${index})">
                    <i class="fas fa-trash"></i>
                </button>
             </div>
        </tr>
    `).join('');
    
    updateQuoteTotal();
}

window.updateItemDosage = function(index, value) { 
    if (quotationItems[index]) {
        quotationItems[index].dosage_instructions = value; 
    }
};

window.updateItemQuantity = function(index, value) { 
    if (!quotationItems[index]) return;
    const qty = parseInt(value) || 1; 
    quotationItems[index].quantity = qty; 
    quotationItems[index].total = quotationItems[index].price * qty; 
    renderQuotationItems(); 
};

window.updateItemPrice = function(index, value) { 
    if (!quotationItems[index]) return;
    const price = parseFloat(value) || 0; 
    quotationItems[index].price = price; 
    quotationItems[index].total = price * quotationItems[index].quantity; 
    renderQuotationItems(); 
};

window.removeQuotationItem = function(index) { 
    quotationItems.splice(index, 1); 
    renderQuotationItems(); 
};

function updateQuoteTotal() {
    const subtotal = quotationItems.reduce((sum, item) => sum + item.total, 0);
    const grandTotalEl = document.getElementById('quoteGrandTotal');
    if (grandTotalEl) {
        grandTotalEl.textContent = `ZMW ${subtotal.toFixed(2)}`;
    }
}

window.createQuotation = async function(prescriptionId) {
    const prescription = allPrescriptions.find(p => p.id === prescriptionId);
    if (!prescription) {
        showToast('Prescription not found!', 'error');
        return;
    }
    
    currentPrescription = prescription;
    quotationItems = [];
    
    if (prescription.quoted_items && prescription.quoted_items.length > 0) {
        quotationItems = prescription.quoted_items.map(item => ({ 
            product_id: item.product_id,
            name: item.name, 
            price: item.price, 
            active_ingredient: item.active_ingredient || '',
            brand: item.brand || '',
            image_url: item.image_url || PLACEHOLDER_IMAGE,
            description: item.description || '',
            dosage_instructions: item.dosage_instructions || '', 
            quantity: item.qty || 1, 
            total: (item.price || 0) * (item.qty || 1) 
        }));
    }
    
    const generalInstructions = document.getElementById('generalInstructions');
    if (generalInstructions) generalInstructions.value = prescription.general_instructions || '';
    
    const adminNote = document.getElementById('adminNote');
    if (adminNote) adminNote.value = prescription.admin_note || '';
    
    const prescriptionInfo = document.getElementById('prescriptionInfo');
    if (prescriptionInfo) {
        prescriptionInfo.innerHTML = `
            <div>
                <div><strong>Patient:</strong> ${prescription.user_id?.slice(0,8)}...${prescription.user_id?.slice(-4)}</div>
                <div><strong>Reference:</strong> ${escapeHtml(prescription.reference_name || 'Prescription Request')}</div>
                <div><strong>Date:</strong> ${new Date(prescription.created_at).toLocaleString()}</div>
                <div><strong>Status:</strong> <span class="status-badge status-pending">${prescription.status}</span></div>
            </div>
        `;
    }
    
    const imagePreviewDiv = document.getElementById('prescriptionImagePreview');
    const prescriptionImg = document.getElementById('prescriptionPreviewImg');
    if (imagePreviewDiv && prescriptionImg && prescription.file_url) {
        imagePreviewDiv.style.display = 'block';
        prescriptionImg.removeAttribute('src');
        const signed = await getPrescriptionFileUrl(prescription.file_url);
        if (signed) prescriptionImg.src = signed;
        else prescriptionImg.alt = 'Could not load this prescription file';
    }
    
    renderQuotationItems();
    
    const modal = document.getElementById('quoteModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
};

window.submitQuotation = async function() {
    if (quotationItems.length === 0) { 
        showToast('Please add at least one medicine to the quotation', 'warning');
        return; 
    }
    
    const generalInstructions = document.getElementById('generalInstructions')?.value || '';
    const adminNote = document.getElementById('adminNote')?.value || '';
    const totalAmount = quotationItems.reduce((sum, item) => sum + item.total, 0);
    
    const quotedItems = quotationItems.map(item => ({ 
        product_id: item.product_id,
        name: item.name,
        price: item.price,
        qty: item.quantity,
        active_ingredient: item.active_ingredient || '',
        brand: item.brand || '',
        image_url: item.image_url || PLACEHOLDER_IMAGE,
        description: item.description || '',
        dosage_instructions: item.dosage_instructions || ''
    }));
    
    console.log('Saving quotation with product IDs:', quotedItems.map(i => ({ product_id: i.product_id, name: i.name, active: i.active_ingredient })));
    
    const { error } = await supabase
        .from('prescriptions')
        .update({
            quoted_items: quotedItems,
            total_amount: totalAmount,
            general_instructions: generalInstructions,
            admin_note: adminNote,
            status: 'quotation_sent',
            quoted_at: new Date().toISOString()
        })
        .eq('id', currentPrescription.id);
    
    if (error) { 
        console.error('Submit quotation error:', error);
        showToast('Error sending quotation: ' + error.message, 'error');
    } else { 
        showToast(`Quotation sent successfully!\n\nTotal: ZMW ${totalAmount.toFixed(2)}`, 'success');
        closeQuoteModal(); 
        await loadPrescriptions(); 
        await loadDashboardStats(); 
    }
};

window.viewQuotationDetails = async function(prescriptionId) {
    const prescription = allPrescriptions.find(p => p.id === prescriptionId);
    if (!prescription) return;
    
    const itemsHtml = (prescription.quoted_items || []).map(item => {
        const imageUrl = item.image_url && item.image_url.trim() !== '' ? item.image_url : PLACEHOLDER_IMAGE;
        
        return `
        <div class="quoted-item">
            <div>
                <img src="${imageUrl}" onerror="this.src='${PLACEHOLDER_IMAGE}'" class="quoted-item-img">
                <div class="quoted-item-details">
                    <div class="quoted-item-name">${escapeHtml(item.name)}</div>
                    ${item.brand ? `<div class="quoted-item-brand">${escapeHtml(item.brand)}</div>` : ''}
                    ${item.active_ingredient ? `<div class="quoted-item-active">Active: ${escapeHtml(item.active_ingredient)}</div>` : ''}
                    ${item.dosage_instructions ? `<div class="quoted-item-dosage">Dosage: ${escapeHtml(item.dosage_instructions)}</div>` : ''}
                    <div class="quoted-item-pricing">
                        <span>Qty: ${item.qty}</span>
                        <span>Price: ZMW ${item.price.toFixed(2)}</span>
                        <span class="quoted-item-total">Total: ZMW ${(item.price * item.qty).toFixed(2)}</span>
                    </div>
                    ${item.product_id ? `<div class="quoted-item-id">Product ID: ${item.product_id.slice(0,8)}...</div>` : ''}
                </div>
            </div>
        </div>
    `}).join('') || '<p class="no-items">No items in quotation</p>';
    
    const content = document.getElementById('prescriptionViewContent');
    if (content) {
        content.innerHTML = `
            <div class="prescription-quote-detail">
                <div class="quote-info-section">
                    <h4>Prescription Information</h4>
                    <div class="quote-info-grid">
                        <div><strong>Reference:</strong> ${escapeHtml(prescription.reference_name || 'Prescription Request')}</div>
                        <div><strong>Date:</strong> ${new Date(prescription.created_at).toLocaleString()}</div>
                        <div><strong>Quoted On:</strong> ${prescription.quoted_at ? new Date(prescription.quoted_at).toLocaleString() : 'N/A'}</div>
                        <div><strong>Status:</strong> <span class="status-badge status-processing">Quotation Sent</span></div>
                    </div>
                </div>
                <div class="quote-items-section">
                    <h4>Quotation Items</h4>
                    <div class="quoted-items-list">${itemsHtml}</div>
                </div>
                <div class="quote-total-section">
                    <h4>Total Amount</h4>
                    <div class="quote-total-amount">ZMW ${prescription.total_amount?.toFixed(2) || '0.00'}</div>
                </div>
                ${prescription.general_instructions ? `<div class="quote-instructions-section"><h4>General Instructions</h4><p>${escapeHtml(prescription.general_instructions)}</p></div>` : ''}
                ${prescription.admin_note ? `<div class="quote-note-section"><h4>Pharmacist Note</h4><p>${escapeHtml(prescription.admin_note)}</p></div>` : ''}
            </div>
        `;
    }
    
    const modal = document.getElementById('prescriptionViewModal');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
};

window.closeQuoteModal = function() {
    const modal = document.getElementById('quoteModal');
    if (modal) { 
        modal.classList.remove('active'); 
        modal.style.display = 'none'; 
    }
    quotationItems = [];
    currentPrescription = null;
    
    const imagePreviewDiv = document.getElementById('prescriptionImagePreview');
    if (imagePreviewDiv) imagePreviewDiv.style.display = 'none';
    
    const searchInput = document.getElementById('medicineSearch');
    if (searchInput) searchInput.value = '';
    
    const searchResults = document.getElementById('medicineSearchResults');
    if (searchResults) {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
    }
};

/* ==========================================================================
   14. USER MANAGEMENT
   ========================================================================== */
async function loadUsers() {
    try {
        const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        allUsers = data || [];
        renderUsersTable(allUsers);
    } catch (err) { console.error('Error loading users:', err); }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersList');
    if (!tbody) return;
    if (!users?.length) { tbody.innerHTML = '<tr><td colspan="6">No users found<\/tr>'; return; }
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${escapeHtml(user.name || 'N/A')}</div>
            <td>${user.email || user.id?.slice(0,8)}</div>
            <td>${user.phone || 'N/A'}</div>
            <td><select onchange="updateUserRole('${user.id}', this.value)" class="role-select">
                <option value="member" ${user.role === 'member' ? 'selected' : ''}>Member</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="rider" ${user.role === 'rider' ? 'selected' : ''}>Rider</option>
            </select></div>
            <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</div>
            <td>${user.role !== 'admin' ? `<button class="action-btn delete" onclick="deleteUser('${user.id}')"><i class="fas fa-trash"></i></button>` : ''}</div>
        </tr>
    `).join('');
}

window.filterUsers = function() {
    const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';
    let filtered = [...allUsers];
    if (searchTerm) filtered = filtered.filter(u => u.name?.toLowerCase().includes(searchTerm) || u.email?.toLowerCase().includes(searchTerm));
    renderUsersTable(filtered);
};

window.updateUserRole = async function(userId, newRole) {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) alert('Error updating role');
    else await loadUsers();
};

window.deleteUser = async function(userId) {
    const confirmed = await window.customConfirm(
        'Delete this user?',
        'Confirm Delete',
        'Yes, Delete',
        'Cancel'
    );
    
    if (!confirmed) return;
    
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) {
        window.showToast('Error deleting user: ' + error.message, 'error');
    } else {
        window.showToast('User deleted successfully!', 'success');
        await loadUsers();
        await loadDashboardStats();
    }
};

/* ==========================================================================
   15. UTILITIES
   ========================================================================== */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
}

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        if (!document.querySelector('.modal.active, .modal-overlay-custom[style*="flex"]')) {
            document.body.classList.remove('modal-open');
        }
    }
};

function printOrderInvoice() {
    const invoiceContent = document.getElementById('orderDetailContent');
    if (!invoiceContent) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html><html><head><title>Order Invoice</title>
        <style>body{font-family:sans-serif;padding:40px} table{width:100%;border-collapse:collapse} th,td{padding:12px;border-bottom:1px solid #ccc} .text-center{text-align:center} .text-right{text-align:right} .grand-total-row{background:#f5f5f5}</style>
        </head><body>${invoiceContent.innerHTML}<div style="text-align:center;margin-top:20px"><button onclick="window.print()">Print</button></div></body></html>
    `);
    printWindow.document.close();
}
window.printOrderInvoice = printOrderInvoice;

window.handleLogout = async function() {
    await supabase.auth.signOut();
    window.location.href = '../home/index.html';
};

window.onclick = function(event) {
    document.querySelectorAll('.modal').forEach(modal => { 
        if (event.target === modal) { 
            modal.classList.remove('active'); 
            modal.style.display = 'none'; 
        } 
    });
};

// Start the admin panel
checkAdminAccess();

/* ==========================================================================
   THIS WEEK'S OFFERS  (saved in the SHOP database, table weekly_offers)
   ========================================================================== */
let offersList = [];

function offerPriceText(normal, pct) {
    const n = Number(normal || 0);
    const p = Number(pct || 0);
    if (!(n > 0) || !(p > 0)) return '';
    const after = p >= 100 ? 0 : Math.round(n * (1 - p / 100) * 100) / 100;
    return p >= 100 ? `Normal ZMW ${n.toFixed(2)} → FREE` : `Normal ZMW ${n.toFixed(2)} → offer ZMW ${after.toFixed(2)}`;
}

function offerStatus(o) {
    const now = Date.now();
    if (!o.is_active) return badge('Off', '#f3f4f6', '#6b7280');
    if (new Date(o.ends_at).getTime() < now) return badge('Ended', '#fee2e2', '#991b1b');
    if (new Date(o.starts_at).getTime() > now) return badge('Scheduled', '#fef3c7', '#92400e');
    return badge('Live', '#dcfce7', '#166534');
}

window.loadOffers = async function() {
    const tbody = document.getElementById('offersList');
    if (!tbody) return;
    try {
        const { data, error } = await supabase.from('weekly_offers').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        offersList = data || [];
        renderOffers();
    } catch (err) {
        console.error('Offers load error:', err);
        const missing = /weekly_offers|relation|schema cache/i.test(err.message || '');
        tbody.innerHTML = `<tr><td colspan="8">${missing
            ? 'The offers table is not set up yet. Run the file <b>online_shop_weekly_offers_SHOP_database.sql</b> once in the shop Supabase SQL Editor, then press Refresh.'
            : 'Could not load offers: ' + escapeHtml(err.message || '')}</td></tr>`;
    }
};

function renderOffers() {
    const tbody = document.getElementById('offersList');
    if (!tbody) return;
    if (!offersList.length) { tbody.innerHTML = '<tr><td colspan="8">No offers yet. Press "New Offer" to add one.</td></tr>'; return; }
    const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    tbody.innerHTML = offersList.map(o => {
        const conds = [];
        const cat = o.required_category ? String(o.required_category).replace(/_/g, ' ') : '';
        if (o.min_purchase) conds.push(`Spend ZMW ${Number(o.min_purchase).toFixed(2)}+${cat ? ' on ' + escapeHtml(cat) : ''}`);
        else if (cat) conds.push(`Buy any ${escapeHtml(cat)} item`);
        if (o.first_purchase_only) conds.push('First order only');
        if (o.max_qty_per_order) conds.push(`Max ${o.max_qty_per_order} at offer price`);
        const img = o.image_url ? `<img src="${escapeHtml(o.image_url)}" class="product-img" onerror="this.src='${PLACEHOLDER_IMAGE}'">` : '<span style="color:#888;">No image</span>';
        return `<tr>
            <td>${img}</td>
            <td><b>${escapeHtml(o.title)}</b></td>
            <td>${escapeHtml(o.product_name || o.product_id)}</td>
            <td>${Number(o.discount_percent) >= 100 ? '<b>FREE</b>' : Number(o.discount_percent) + '% off'}</td>
            <td>${conds.length ? conds.join('<br>') : '<span style="color:#888;">None</span>'}</td>
            <td>${fmt(o.starts_at)} - ${fmt(o.ends_at)}</td>
            <td>${offerStatus(o)}</td>
            <td>
                <button class="action-btn edit" title="Edit" onclick="openOfferForm('${o.id}')"><i class="fas fa-edit"></i></button>
                <button class="action-btn" title="${o.is_active ? 'Switch off' : 'Switch on'}" onclick="toggleOffer('${o.id}')"><i class="fas ${o.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
                <button class="action-btn delete" title="Delete" onclick="deleteOffer('${o.id}')"><i class="fas fa-trash"></i></button>
            </td></tr>`;
    }).join('');
}

function liveProductsForOffers() {
    return (allProducts || []).filter(p => p.show_online).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

window.filterOfferProducts = function(keepValue) {
    const term = (document.getElementById('offerProductSearch')?.value || '').toLowerCase();
    const sel = document.getElementById('offerProduct');
    if (!sel) return;
    const current = keepValue || sel.value;
    let list = liveProductsForOffers().filter(p => !term || (p.name || '').toLowerCase().includes(term) || (p.brand || '').toLowerCase().includes(term));
    if (current && !list.some(p => String(p.id) === String(current))) {
        const keep = liveProductsForOffers().find(p => String(p.id) === String(current));
        if (keep) list = [keep, ...list];
    }
    sel.innerHTML = '<option value="">- Choose a product -</option>' + list.slice(0, 300).map(p =>
        `<option value="${p.id}">${escapeHtml(p.name)}${p.brand ? ' (' + escapeHtml(p.brand) + ')' : ''} - ZMW ${Number(p.sale_price || 0).toFixed(2)}</option>`).join('');
    if (current) sel.value = current;
    updateOfferPreview();
};

window.updateOfferPreview = function() {
    const el = document.getElementById('offerPricePreview');
    if (!el) return;
    const id = document.getElementById('offerProduct')?.value;
    const p = (allProducts || []).find(x => String(x.id) === String(id));
    el.textContent = p ? offerPriceText(p.sale_price, document.getElementById('offerDiscount')?.value) : '';
};

function fillOfferCategories(selected) {
    const sel = document.getElementById('offerCategory');
    if (!sel) return;
    const cats = [...new Set(liveProductsForOffers().map(p => p.shop_category || p.category).filter(Boolean))].sort();
    if (selected && !cats.includes(selected)) cats.push(selected);
    sel.innerHTML = '<option value="">Any category</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(String(c).replace(/_/g, ' '))}</option>`).join('');
    sel.value = selected || '';
}

const dayInput = (d) => { const x = new Date(d); const m = String(x.getMonth() + 1).padStart(2, '0'); const dd = String(x.getDate()).padStart(2, '0'); return `${x.getFullYear()}-${m}-${dd}`; };

window.openOfferForm = async function(id) {
    const card = document.getElementById('offerFormCard');
    if (!card) return;
    // the product list comes from the ERP, so make sure the ERP login is done
    if (!(allProducts || []).length) await loadProducts(true);
    const o = id ? offersList.find(x => x.id === id) : null;
    offerUploadPromise = null;
    document.getElementById('offerForm').reset();
    document.getElementById('offerId').value = o ? o.id : '';
    document.getElementById('offerFormTitle').textContent = o ? 'Edit offer' : 'New offer';
    document.getElementById('offerProductSearch').value = '';
    fillOfferCategories(o ? o.required_category : '');
    window.filterOfferProducts(o ? o.product_id : '');
    document.getElementById('offerTitle').value = o ? o.title : '';
    document.getElementById('offerDiscount').value = o ? Number(o.discount_percent) : '';
    document.getElementById('offerMinPurchase').value = o && o.min_purchase ? Number(o.min_purchase) : '';
    document.getElementById('offerMaxQty').value = o ? (o.max_qty_per_order || '') : 1;
    document.getElementById('offerFirstOnly').checked = !!(o && o.first_purchase_only);
    document.getElementById('offerActive').checked = o ? !!o.is_active : true;
    const today = new Date(); const week = new Date(Date.now() + 6 * 86400000);
    document.getElementById('offerStart').value = o ? dayInput(o.starts_at) : dayInput(today);
    document.getElementById('offerEnd').value = o ? dayInput(o.ends_at) : dayInput(week);
    document.getElementById('offerImageUrl').value = o ? (o.image_url || '') : '';
    const prev = document.getElementById('offerImagePreview');
    prev.src = o && o.image_url ? o.image_url : '';
    prev.style.display = o && o.image_url ? 'block' : 'none';
    document.getElementById('offerImageStatus').textContent = 'Use a picture made for this offer (not the product photo)';
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.closeOfferForm = function() {
    const card = document.getElementById('offerFormCard');
    if (card) card.style.display = 'none';
};

let offerUploadPromise = null;   // the picture upload that is still running (Save waits for it)

/* Shrinks a big photo (e.g. 800 KB+) to a web-sized JPEG so it uploads in a moment. */
function shrinkOfferImage(file, maxSide = 1200) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob && blob.size < file.size ? blob : file); }, 'image/jpeg', 0.85);
            } catch (e) { URL.revokeObjectURL(url); resolve(file); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

window.uploadOfferImage = function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const status = document.getElementById('offerImageStatus');
    const saveBtn = document.getElementById('offerSaveBtn');
    if (!/^image\//i.test(file.type)) { status.textContent = 'Please choose a picture (PNG, JPG, WEBP or GIF).'; input.value = ''; return; }
    if (file.size > 15 * 1024 * 1024) { status.textContent = 'Image is bigger than 15 MB. Please use a smaller one.'; input.value = ''; return; }

    status.textContent = 'Uploading picture... please wait before saving';
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Uploading picture...'; }

    offerUploadPromise = (async () => {
        try {
            const blob = await shrinkOfferImage(file);
            const isGif = /gif/i.test(file.type) && blob === file;
            const type = blob === file ? (isGif ? 'image/gif' : (file.type || 'image/jpeg')) : 'image/jpeg';
            const ext = type === 'image/gif' ? 'gif' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
            const path = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error } = await supabase.storage.from('offer-images').upload(path, blob, { contentType: type, upsert: false });
            if (error) throw error;
            const { data } = supabase.storage.from('offer-images').getPublicUrl(path);
            document.getElementById('offerImageUrl').value = data.publicUrl;
            const prev = document.getElementById('offerImagePreview');
            prev.src = data.publicUrl; prev.style.display = 'block';
            status.textContent = 'Picture uploaded. You can save the offer now.';
            return true;
        } catch (err) {
            console.error('Offer image upload failed:', err);
            const m = String(err.message || err);
            status.textContent = /bucket not found|not found/i.test(m)
                ? 'Upload failed: the offer-images storage is not set up yet.'
                : /row-level security|policy|unauthorized|403/i.test(m)
                    ? 'Upload failed: permission denied. Make sure you are logged in as admin.'
                    : 'Upload failed: ' + m;
            input.value = '';
            return false;
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save offer'; }
        }
    })();
};

window.saveOffer = async function(event) {
    event.preventDefault();
    const btn = document.getElementById('offerSaveBtn');
    if (offerUploadPromise) { const ok = await offerUploadPromise; offerUploadPromise = null; if (!ok) { window.showToast('The picture did not upload. Please choose it again.', 'warning', 'Picture Missing'); return; } }
    const productId = document.getElementById('offerProduct').value;
    const product = (allProducts || []).find(p => String(p.id) === String(productId));
    const pct = parseFloat(document.getElementById('offerDiscount').value);
    const startStr = document.getElementById('offerStart').value;
    const endStr = document.getElementById('offerEnd').value;
    const minPurchase = parseFloat(document.getElementById('offerMinPurchase').value);
    const maxQty = parseInt(document.getElementById('offerMaxQty').value, 10);

    if (!product) { window.showToast('Please choose a product for this offer.', 'warning', 'Missing Product'); return; }
    if (!(pct > 0 && pct <= 100)) { window.showToast('Discount must be between 1 and 100.', 'warning', 'Invalid Discount'); return; }
    const starts = new Date(startStr + 'T00:00:00');
    const ends = new Date(endStr + 'T23:59:59');
    if (!(ends > starts)) { window.showToast('The end date must be after the start date.', 'warning', 'Invalid Dates'); return; }

    const row = {
        title: document.getElementById('offerTitle').value.trim(),
        product_id: String(product.id),
        product_name: product.name,
        discount_percent: pct,
        image_url: document.getElementById('offerImageUrl').value || null,
        min_purchase: minPurchase > 0 ? minPurchase : null,
        first_purchase_only: !!document.getElementById('offerFirstOnly').checked,
        required_category: document.getElementById('offerCategory').value || null,
        max_qty_per_order: maxQty > 0 ? maxQty : null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        is_active: !!document.getElementById('offerActive').checked,
        updated_at: new Date().toISOString()
    };
    if (!row.title) { window.showToast('Please give the offer a title.', 'warning', 'Missing Title'); return; }

    btn.disabled = true;
    const id = document.getElementById('offerId').value;
    const { error } = id
        ? await supabase.from('weekly_offers').update(row).eq('id', id)
        : await supabase.from('weekly_offers').insert(row);
    btn.disabled = false;
    if (error) { window.showToast('Could not save the offer: ' + error.message, 'error', 'Save Failed'); return; }
    window.showToast('Offer saved.', 'success', 'Saved');
    closeOfferForm();
    await loadOffers();
};

window.toggleOffer = async function(id) {
    const o = offersList.find(x => x.id === id);
    if (!o) return;
    const { error } = await supabase.from('weekly_offers').update({ is_active: !o.is_active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
    await loadOffers();
};

window.deleteOffer = async function(id) {
    const o = offersList.find(x => x.id === id);
    if (!o || !confirm(`Delete the offer "${o.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('weekly_offers').delete().eq('id', id);
    if (error) { window.showToast('Error: ' + error.message, 'error'); return; }
    await loadOffers();
};