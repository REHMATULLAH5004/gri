// back_button.js - Final Version for Mobile App (Dynamic Import)

// Navigation stack - store page names and full URLs
let navigationStack = [];

// Capacitor App reference - will be loaded dynamically
let CapacitorApp = null;

// Try to load Capacitor App dynamically
async function loadCapacitorApp() {
    try {
        // Only attempt to load if Capacitor is available
        if (window.Capacitor && Capacitor.isNativePlatform()) {
            // Dynamic import for Capacitor App
            const module = await import('@capacitor/app');
            CapacitorApp = module.App;
            console.log('✅ Capacitor App loaded successfully');
        } else {
            console.log('ℹ️ Capacitor App not available (web mode)');
        }
    } catch (e) {
        console.log('ℹ️ Capacitor App not available:', e.message);
        CapacitorApp = null;
    }
}

// Add current page to stack with full URL
function pushNavigationState(page, url) {
    // Avoid duplicates - check if last entry is same
    const last = navigationStack[navigationStack.length - 1];
    if (last && last.page === page && last.url === url) {
        return;
    }
    
    navigationStack.push({
        page: page,
        url: url || window.location.href
    });
    if (navigationStack.length > 20) {
        navigationStack.shift();
    }
    console.log('📚 Navigation stack:', navigationStack.map(item => item.page + ' (' + item.url.split('?')[0] + ')').join(' → '));
}

// Get current page name and URL
function getCurrentPageInfo() {
    const path = window.location.pathname;
    const url = window.location.href;
    let page = 'unknown';
    
    // Pages now live in their own folders (pages/<name>/index.html), so the
    // page is recognised by its folder instead of by its old flat file name.
    if (path.includes('/pages/home/') || path === '/' || path === '' || /\/index\.html$/.test(path) && !path.includes('/pages/')) page = 'home';
    else if (path.includes('/pages/admin/')) page = 'admin';
    else if (path.includes('/pages/product-detail/')) page = 'product-detail';
    else if (path.includes('/pages/products/')) page = 'product';
    else if (path.includes('/pages/cart/')) page = 'cart';
    else if (path.includes('/pages/checkout/')) page = 'checkout';
    
    return { page, url };
}

// Show exit confirmation for Home page
function showExitConfirmation() {
    if (typeof window.customConfirm === 'function') {
        window.customConfirm(
            'Are you sure you want to exit the app?',
            'Exit App',
            'Yes, Exit',
            'Cancel'
        ).then((confirmed) => {
            if (confirmed) {
                if (window.Capacitor && Capacitor.isNativePlatform() && CapacitorApp) {
                    CapacitorApp.exitApp();
                } else {
                    window.close();
                }
            }
        });
    } else {
        // Fallback
        if (confirm('Are you sure you want to exit the app?')) {
            if (window.Capacitor && Capacitor.isNativePlatform() && CapacitorApp) {
                CapacitorApp.exitApp();
            } else {
                window.close();
            }
        }
    }
}

// Go back in navigation
function goBack() {
    const currentPage = getCurrentPageInfo();
    
    // If on Home page, show exit confirmation
    if (currentPage.page === 'home' || navigationStack.length <= 1) {
        showExitConfirmation();
        return;
    }
    
    if (navigationStack.length > 1) {
        // Remove current page from stack
        navigationStack.pop();
        
        // Get the previous page info
        const previousPage = navigationStack[navigationStack.length - 1];
        console.log('⬅️ Going back to:', previousPage.page, previousPage.url);
        
        // Special handling for product page - preserve query params
        if (previousPage.page === 'product') {
            // Navigate to the exact URL stored in stack (includes query params)
            if (previousPage.url && previousPage.url !== window.location.href) {
                window.location.href = previousPage.url;
            } else {
                window.history.back();
            }
            return;
        }
        
        // Navigate to the previous page URL
        if (previousPage.url && previousPage.url !== window.location.href) {
            window.location.href = previousPage.url;
        } else {
            // Fallback: go back in history
            window.history.back();
        }
    } else {
        showExitConfirmation();
    }
}

// Handle back action
function handleBackAction() {
    console.log('⬅️ Back action triggered');
    
    // 1. Check if any modal is open - close it first
    const openModals = document.querySelectorAll('.modal.active, .modal-overlay-custom.active, .floating-panel:not(.hidden)');
    if (openModals.length > 0) {
        const lastModal = openModals[openModals.length - 1];
        console.log('📱 Closing modal:', lastModal.id);
        
        // Handle floating panel (Quotes)
        if (lastModal.id === 'floatingPrescList') {
            if (typeof window.togglePrescList === 'function') {
                window.togglePrescList();
            }
            return;
        }
        
        // Handle regular modals
        if (lastModal.id && typeof window.closeModal === 'function') {
            window.closeModal(lastModal.id);
            return;
        }
        
        // Fallback: find any visible modal
        const anyModal = document.querySelector('.modal.active, .modal-overlay-custom.active');
        if (anyModal && anyModal.id && typeof window.closeModal === 'function') {
            window.closeModal(anyModal.id);
            return;
        }
        return;
    }

    // 2. Check notification overlay
    const notificationOverlay = document.getElementById('customNotificationOverlay');
    if (notificationOverlay && notificationOverlay.classList.contains('active')) {
        if (typeof window.closeCustomNotification === 'function') {
            window.closeCustomNotification();
            return;
        }
    }

    // 3. Navigate back using stack
    goBack();
}

// Initialize back button
function initBackButton() {
    const currentInfo = getCurrentPageInfo();
    
    // Clear stack if it's the first page load
    if (navigationStack.length === 0) {
        pushNavigationState(currentInfo.page, currentInfo.url);
    } else {
        const last = navigationStack[navigationStack.length - 1];
        if (last.page !== currentInfo.page || last.url !== currentInfo.url) {
            pushNavigationState(currentInfo.page, currentInfo.url);
        }
    }

    // Capacitor Native Back Button
    if (window.Capacitor && Capacitor.isNativePlatform()) {
        if (CapacitorApp) {
            CapacitorApp.addListener('backButton', () => {
                console.log('📱 Native back button pressed');
                handleBackAction();
            });
            console.log('✅ Capacitor back button listener registered');
        } else {
            console.log('⚠️ Capacitor App not loaded, back button may not work natively');
        }
    }

    // Browser Popstate (Web)
    window.addEventListener('popstate', (event) => {
        console.log('🌐 Browser back button pressed');
        const currentInfo = getCurrentPageInfo();
        if (navigationStack.length > 0 && navigationStack[navigationStack.length - 1].page !== currentInfo.page) {
            pushNavigationState(currentInfo.page, currentInfo.url);
        }
    });

    // Keyboard Escape/Backspace (Desktop)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || event.key === 'Backspace') {
            const target = event.target;
            if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
                event.preventDefault();
                handleBackAction();
            }
        }
    });
}

// Update navigation on page load
function updateNavigationState() {
    const currentInfo = getCurrentPageInfo();
    const last = navigationStack[navigationStack.length - 1];
    
    if (!last || last.page !== currentInfo.page || last.url !== currentInfo.url) {
        pushNavigationState(currentInfo.page, currentInfo.url);
    }
    console.log('📍 Current page:', currentInfo.page);
    console.log('📚 Full stack:', navigationStack.map(item => item.page + ' (' + item.url.split('?')[0] + ')').join(' → '));
}

// Track all link clicks
document.addEventListener('click', function(event) {
    const link = event.target.closest('a[href]');
    if (link) {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
            let destination = 'unknown';
            
            // Links are relative now (e.g. ../cart/index.html), so work out
            // where they really point before deciding which page they are.
            let resolvedPath = '';
            try { resolvedPath = new URL(href, window.location.href).pathname; } catch (e) { resolvedPath = href; }
            
            // Check if it's a product link with query params
            if (resolvedPath.includes('/pages/products/') && href.includes('?')) {
                destination = 'product';
            } else if (resolvedPath.includes('/pages/home/') || href === '/') {
                destination = 'home';
            } else if (resolvedPath.includes('/pages/admin/')) {
                destination = 'admin';
            } else if (resolvedPath.includes('/pages/product-detail/')) {
                destination = 'product-detail';
            } else if (resolvedPath.includes('/pages/products/')) {
                destination = 'product';
            } else if (resolvedPath.includes('/pages/cart/')) {
                destination = 'cart';
            } else if (resolvedPath.includes('/pages/checkout/')) {
                destination = 'checkout';
            }
            
            if (destination !== 'unknown') {
                let fullUrl = href;
                if (!href.startsWith('http')) {
                    // resolve against the current page (links are relative to it)
                    try { fullUrl = new URL(href, window.location.href).href; }
                    catch (e) { fullUrl = window.location.origin + '/' + href.replace(/^\//, ''); }
                }
                pushNavigationState(destination, fullUrl);
                console.log('🔗 Navigating to:', destination, fullUrl);
            }
        }
    }
});

// Handle page navigation from home page dropdown links
document.addEventListener('click', function(event) {
    const element = event.target.closest('[onclick]');
    if (element) {
        const onclick = element.getAttribute('onclick');
        if (onclick && onclick.includes('navigateToProductView')) {
            const match = onclick.match(/navigateToProductView\(['"]([^'"]+)['"]\)/);
            if (match) {
                const queryString = match[1];
                const fullUrl = new URL('../products/index.html?' + queryString, window.location.href).href;
                setTimeout(function() {
                    pushNavigationState('product', fullUrl);
                    console.log('🔗 Navigated to product via dropdown:', fullUrl);
                }, 100);
            }
        }
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    // Load Capacitor App dynamically
    await loadCapacitorApp();
    initBackButton();
    updateNavigationState();
    console.log('✅ Back button initialized for Capacitor');
});

// Make all functions available globally (for products.js and other files)
window.pushNavigationState = pushNavigationState;
window.getCurrentPageInfo = getCurrentPageInfo;
window.updateNavigationState = updateNavigationState;
window.goBack = goBack;
window.handleBackAction = handleBackAction;

console.log('✅ Back button functions exported to window');