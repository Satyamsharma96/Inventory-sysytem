// ============================================================
// FIREBASE CONFIG & INIT
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyBMKl0ioeR2-2BqtTveHe4TYT3Qoam_09A",
    authDomain: "inventoryapp-3fd49.firebaseapp.com",
    projectId: "inventoryapp-3fd49",
    storageBucket: "inventoryapp-3fd49.firebasestorage.app",
    messagingSenderId: "810298304296",
    appId: "1:810298304296:web:720e7ca0f4f048b4f4d21d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── USER-BASED DATA ISOLATION HELPER ──
const userDb = (collectionName) => {
    if (!currentUser || !currentUser.email) {
        throw new Error("User not authenticated. Please logout and login again.");
    }
    return db.collection('users').doc(currentUser.email).collection(collectionName);
};

// ============================================================
// CLOUDINARY CONFIG
// ============================================================
const CLOUDINARY_CLOUD_NAME   = "dgv5lo9jf";
const CLOUDINARY_UPLOAD_PRESET = "app_uploads";

/**
 * Upload a File object to Cloudinary and return the secure URL.
 * @param {File} file - The image file to upload
 * @returns {Promise<string>} secure_url from Cloudinary
 */
async function uploadToCloudinary(file) {
    // Guard: file must exist
    if (!file) {
        console.error('uploadToCloudinary: no file provided');
        throw new Error('No file selected for upload.');
    }
    console.log('Uploading to Cloudinary:', file.name, file.type, file.size, 'bytes');

    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
        const res  = await fetch(url, { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok) {
            // Log full Cloudinary error for easier debugging
            console.error('Cloudinary Error Response:', data);
            throw new Error(data.error?.message || `Upload failed (HTTP ${res.status})`);
        }

        if (!data.secure_url) throw new Error('Cloudinary did not return a URL.');

        console.log('Cloudinary upload success:', data.secure_url);
        return data.secure_url;

    } catch (err) {
        console.error('Upload Failed:', err);
        throw err; // re-throw so callers can show proper error messages
    }
}

// ============================================================
// APP STATE
// ============================================================
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;

let products  = [];
let orders    = [];
let customers = [];
let cart      = [];
let activePlans = []; // State for dynamic plans

// Real-time listeners
let productsUnsubscribe  = null;
let customersUnsubscribe = null;
let ordersUnsubscribe    = null;
let userDocUnsubscribe  = null;

// Chart instances
let pieChart = null;
let barChart = null;

// ============================================================
// HELPERS
// ============================================================
function saveCurrentUser() {
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
}

function getProductStock(product) {
    if (!product || !product.batches) return 0;
    return product.batches.reduce((sum, b) => sum + (parseInt(b.qty) || 0), 0);
}

/** Safe image src: returns fallback if src is empty/null */
function safeImgSrc(src, fallback = 'qr_placeholder.png') {
    return src && src.trim() ? src : fallback;
}

// ============================================================
// FIREBASE REAL-TIME LISTENERS
// ============================================================
function initFirebaseListeners() {
    if (!currentUser) return;

    // Remove existing listeners if any
    removeFirebaseListeners();

    productsUnsubscribe = userDb('products')
        .onSnapshot(snapshot => {
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const activeId = getActiveViewId();
            if (activeId === 'view-products') loadProducts();
            if (activeId === 'view-billing') { renderBillingGrid(); renderCart(); }
            checkAlerts();
        });

    customersUnsubscribe = userDb('customers')
        .onSnapshot(snapshot => {
            customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (getActiveViewId() === 'view-udhaar') renderCustomers();
            checkAlerts();
        });

    ordersUnsubscribe = userDb('orders')
        .onSnapshot(snapshot => {
            orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const activeId = getActiveViewId();
            if (activeId === 'view-dashboard') loadDashboard();
            if (activeId === 'view-analytics') loadAnalytics();
        });

    // Listen to user doc to react to admin approvals or plan changes
    userDocUnsubscribe = db.collection('users').doc(currentUser.email).onSnapshot(doc => {
        if (!doc.exists) return;
        // Merge into local state and re-render UI based on Firestore
        currentUser = { ...currentUser, ...doc.data() };
        saveCurrentUser();
        loadSubscriptionUI();
        if (typeof loadDashboard === 'function') loadDashboard();
    });
}

function removeFirebaseListeners() {
    if (productsUnsubscribe)  productsUnsubscribe();
    if (customersUnsubscribe) customersUnsubscribe();
    if (ordersUnsubscribe)    ordersUnsubscribe();
    if (userDocUnsubscribe)   userDocUnsubscribe();
    productsUnsubscribe  = null;
    customersUnsubscribe = null;
    ordersUnsubscribe    = null;
    userDocUnsubscribe   = null;
}

// Remove only data listeners (products/customers/orders) but keep user doc listener active
function removeDataListeners() {
    if (productsUnsubscribe)  productsUnsubscribe();
    if (customersUnsubscribe) customersUnsubscribe();
    if (ordersUnsubscribe)    ordersUnsubscribe();
    productsUnsubscribe  = null;
    customersUnsubscribe = null;
    ordersUnsubscribe    = null;
}

function getActiveViewId() {
    const el = document.querySelector('.app-view:not(.d-none)');
    return el ? el.id : '';
}

// ============================================================
// DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    applyLanguage();

    // Language toggle buttons
    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            currentLang = currentLang === 'en' ? 'hi' : 'en';
            localStorage.setItem('appLang', currentLang);
            applyLanguage();
            if (currentUser) {
                const vid = getActiveViewId();
                if (vid === 'view-dashboard') loadDashboard();
                if (vid === 'view-products')  loadProducts();
                if (vid === 'view-billing')   loadBilling();
                if (vid === 'view-analytics') loadAnalytics();
            }
        });
    });

    if (currentUser) { showApp(); initFirebaseListeners(); }
    else showAuth();

    attachEventListeners();
});

// ============================================================
// AUTH — SHOW / HIDE CARDS
// ============================================================
document.getElementById('show-signup').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('login-card').classList.add('d-none');
    document.getElementById('signup-card').classList.remove('d-none');
});

document.getElementById('show-login').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('signup-card').classList.add('d-none');
    document.getElementById('login-card').classList.remove('d-none');
});

// ============================================================
// SIGNUP — QR preview (local only for preview; uploads on submit)
// ============================================================
let pendingSignupQRFile = null;

document.getElementById('signup-qr').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    pendingSignupQRFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
        const preview = document.getElementById('signup-qr-preview');
        preview.src = ev.target.result;
        preview.classList.remove('d-none');
    };
    reader.readAsDataURL(file);
});

document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault();

    const name     = document.getElementById('signup-name').value.trim();
    const shop     = document.getElementById('signup-shop').value.trim();
    const mobile   = document.getElementById('signup-mobile').value.trim();
    const email    = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    const btn = document.querySelector('#signup-form button[type="submit"]');
    btn.disabled  = true;
    btn.innerText = 'Saving...';

    try {
        // Check duplicate
        const doc = await db.collection('users').doc(email).get();
        if (doc.exists) {
            alert("Email already registered! Please login.");
            return;
        }

        // Upload QR to Cloudinary (if file selected)
        let qrCode = null;
        if (pendingSignupQRFile) {
            btn.innerText = 'Uploading QR...';
            qrCode = await uploadToCloudinary(pendingSignupQRFile);
        }

        const planStart = new Date();
        const planEnd = new Date();
        planEnd.setDate(planEnd.getDate() + 30);

        const newUser = {
            name, shop, mobile, email, password,
            qrCode,
            plan:    'none',
            status:  'pending',
            shopName: shop,
            planStart: null,
            planEnd:   null,
            createdAt: new Date().toISOString()
        };

        // Save to Firestore
        await db.collection('users').doc(email).set(newUser, { merge: true });

        // Save to localStorage
        let users = JSON.parse(localStorage.getItem('users')) || [];
        users.push(newUser);
        localStorage.setItem('users', JSON.stringify(users));

        pendingSignupQRFile = null;
        document.getElementById('signup-qr-preview').classList.add('d-none');
        document.getElementById('signup-form').reset();

        // Auto-login the newly created user but keep status pending
        currentUser = newUser;
        saveCurrentUser();
        // Initialize app UI for the new user (dashboard will show pending state)
        showApp();
        initFirebaseListeners();
        await validateSubscription();
        loadDashboard();
        // Inform the user
        alert('✅ Signup successful!\n\nWaiting for admin approval. You have been signed in and redirected to the dashboard.');

    } catch (err) {
        alert("Signup error: " + err.message);
        console.error(err);
    } finally {
        btn.disabled  = false;
        btn.innerText = 'Complete Signup';
    }
});

// ============================================================
// LOGIN
// ============================================================
document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const btn = document.querySelector('#login-form button[type="submit"]');
    btn.disabled  = true;
    btn.innerText = 'Logging in...';

    try {
        // ── Admin shortcut ──────────────────────────────────
        if (email === 'admin@shop.com') {
            if (password === '123456') {
                sessionStorage.setItem('admin_auth', 'true');
                window.location.href = 'admin.html';
                return;
            } else {
                alert('❌ Invalid admin password');
                btn.disabled  = false;
                btn.innerText = 'Login to Dashboard';
                return;
            }
        }
        // ────────────────────────────────────────────────────

        const doc = await db.collection('users').doc(email).get();
        if (doc.exists) {
            const fbUser = doc.data();

            // ── Status Check ──────────────────────────────────
            const status = fbUser.status || 'pending';

            if (status === 'rejected' || fbUser.status === 'blocked') {
                alert('❌ Your account has been blocked or rejected.\nPlease contact the admin.');
                return;
            }

            if (status === 'pending') {
                alert('⏳ Your account is pending approval.\nPlease wait for admin to approve your account.\n\nContact: admin@shop.com');
                return;
            }
            // ─────────────────────────────────────────────────

            if (fbUser.password === password) {
                if (email === "admin@shop.com") {
                    sessionStorage.setItem("admin_auth", "true");
                    window.location.href = "admin.html";
                    return;
                }
                currentUser = fbUser;
                saveCurrentUser();
                showApp();
                initFirebaseListeners();
            } else {
                alert('Invalid email or password!');
            }
        } else {
            alert("No account found with this email. Please sign up.");
        }
    } catch (err) {
        alert("Login error: " + err.message);
        console.error(err);
    } finally {
        btn.disabled  = false;
        btn.innerText = 'Login to Dashboard';
    }
});

// ============================================================
// LOGOUT
// ============================================================
document.getElementById('logout-btn').addEventListener('click', () => {
    doLogout();
});

function doLogout() {
    currentUser = null;
    saveCurrentUser();
    removeFirebaseListeners();
    cart = [];
    selectedPaymentMethod = null;
    sessionStorage.removeItem("admin_auth");
    showAuth();
}

// ============================================================
// VIEW NAVIGATION
// ============================================================
function showAuth() {
    document.getElementById('auth-section').classList.remove('d-none');
    document.getElementById('app-section').classList.add('d-none');
}

async function showApp() {
    document.getElementById('auth-section').classList.add('d-none');
    document.getElementById('app-section').classList.remove('d-none');
    document.getElementById('display-user-name').innerText = currentUser.name.split(' ')[0];
    document.getElementById('display-shop-name').innerText = currentUser.shop;
    
    // Check Admin Tab visibility
    const adminBtn = document.getElementById('mobile-admin-btn');
    if (adminBtn) {
        if (currentUser.email === 'admin@shop.com' || currentUser.email === 'admin') {
            adminBtn.classList.remove('d-none');
        } else {
            adminBtn.classList.add('d-none');
        }
    }

    // Hide scroll hint on first scroll
    const navInner = document.getElementById('bottom-nav-inner');
    const navHint = document.getElementById('nav-swipe-hint');
    if (navInner && navHint) {
        // Show hint briefly
        setTimeout(() => navHint.style.opacity = '1', 1000);
        navInner.addEventListener('touchstart', () => navHint.style.opacity = '0', { once: true });
        navInner.addEventListener('scroll', () => navHint.style.opacity = '0', { once: true });
    }

    // Check if migration is needed
    if (!currentUser.migrationsDone) {
        await runDataMigration();
    }

    await validateSubscription();
    loadDashboard();
}

// Subscription validation implemented later in file (single source of truth)

/** ── DATA MIGRATION HELPER ── **/
async function runDataMigration() {
    console.log('Starting data migration to isolated structure...');
    const email = currentUser.email;
    const collections = ['products', 'orders', 'customers'];
    
    for (const coll of collections) {
        const snap = await db.collection(coll).where('userId', '==', email).get();
        if (snap.empty) continue;
        
        const batch = db.batch();
        snap.forEach(doc => {
            const data = doc.data();
            const newRef = userDb(coll).doc(doc.id);
            batch.set(newRef, data);
        });
        await batch.commit();
        console.log(`Migrated ${snap.size} documents in ${coll}`);
    }
    
    await db.collection('users').doc(email).update({ migrationsDone: true });
    currentUser.migrationsDone = true;
    saveCurrentUser();
}

function navigateTo(target) {
    const titles = {
        dashboard: 'Dashboard',
        products:  'Products Inventory',
        billing:   'Point of Sale',
        analytics: 'Data Analytics',
        profile:   'Profile Settings',
        udhaar:    'Udhaar Ledger'
    };

    document.querySelectorAll('.app-view').forEach(v => v.classList.add('d-none'));
    const targetView = document.getElementById('view-' + target);
    if (targetView) targetView.classList.remove('d-none');

    document.getElementById('page-title').innerText = titles[target] || target;

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(l =>
        l.classList.toggle('active', l.getAttribute('data-target') === target));

    document.querySelectorAll('.bottom-nav-item[data-target]').forEach(b => {
        if (b.getAttribute('data-target') === target) {
            b.classList.add('active');
            try { b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch(e){}
        } else {
            b.classList.remove('active');
        }
    });

    if (target === 'dashboard') loadDashboard();
    else if (target === 'products') loadProducts();
    else if (target === 'billing')  loadBilling();
    else if (target === 'analytics') loadAnalytics();
    else if (target === 'profile')  loadProfile();
    else if (target === 'udhaar')   renderCustomers();
    else if (target === 'admin')    window.location.href = 'admin.html';
}

function attachEventListeners() {
    // Sidebar links
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(link.getAttribute('data-target'));
        });
    });

    // Bottom nav buttons
    document.querySelectorAll('.bottom-nav-item[data-target]').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-target')));
    });

    // Header / mobile logout
    const headerLogoutBtn = document.getElementById('header-logout-btn');
    if (headerLogoutBtn) {
        headerLogoutBtn.addEventListener('click', () => {
            if (confirm('Logout karna chahte hain?')) doLogout();
        });
    }

    // Search / filter listeners
    document.getElementById('billing-search').addEventListener('input', applyBillingFilters);
    document.getElementById('inventory-search').addEventListener('input', loadProducts);

    const rackFilter = document.getElementById('rack-filter');
    if (rackFilter) rackFilter.addEventListener('change', loadProducts);

    const uSearch = document.getElementById('udhaar-search');
    if (uSearch) uSearch.addEventListener('input', renderCustomers);
}

// ============================================================
// DASHBOARD & ALERTS
// ============================================================
function loadDashboard() {
    let totalSales  = 0;
    let totalProfit = 0;
    let productCounts = {};

    orders.forEach(order => {
        totalSales  += (order.totalRevenue || 0);
        totalProfit += (order.totalProfit  || 0);
        (order.items || []).forEach(item => {
            productCounts[item.productId] = (productCounts[item.productId] || 0) + item.qty;
        });
    });

    let topProductId = null, maxNum = 0;
    for (let pid in productCounts) {
        if (productCounts[pid] > maxNum) { maxNum = productCounts[pid]; topProductId = pid; }
    }

    let topProdName = t('no_data') || '-';
    if (topProductId) {
        const p = products.find(prod => prod.id === topProductId);
        if (p) topProdName = p.name;
    }

    document.getElementById('stat-sales').innerText     = totalSales.toFixed(2);
    document.getElementById('stat-profit').innerText    = totalProfit.toFixed(2);
    document.getElementById('stat-top-product').innerText = topProdName;
    document.getElementById('stat-total-products').innerText = products.length;

    checkAlerts();
}

function checkAlerts() {
    const lowStockList = document.getElementById('low-stock-list');
    const expiryList   = document.getElementById('expiry-alert-list');
    if (!lowStockList || !expiryList) return;

    lowStockList.innerHTML = '';
    expiryList.innerHTML   = '';

    let lowStockCount = 0, expiryCount = 0;
    const today = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    products.forEach(p => {
        const stock = getProductStock(p);

        if (stock < 5) {
            lowStockCount++;
            lowStockList.innerHTML += `<li class="list-group-item d-flex justify-content-between px-0">
                <span>${p.name}</span>
                <span class="badge bg-danger rounded-pill">${stock} ${t('left_stock') || 'left'}</span>
            </li>`;
        }

        if (p.batches) {
            p.batches.forEach(b => {
                if (!b.expiry) return;
                const exp = new Date(b.expiry);
                if (exp <= threeDaysFromNow && b.qty > 0) {
                    expiryCount++;
                    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                    const dayText  = diffDays < 0 ? (t('expired') || 'Expired') : (diffDays === 0 ? (t('today') || 'Today') : (t('in_days', { x: diffDays }) || `in ${diffDays}d`));
                    expiryList.innerHTML += `<li class="list-group-item d-flex justify-content-between px-0">
                        <span>${p.name} (Qty: ${b.qty})</span>
                        <span class="badge bg-warning text-dark rounded-pill">${dayText}</span>
                    </li>`;
                }
            });
        }
    });

    if (lowStockCount === 0) lowStockList.innerHTML = `<li class="list-group-item text-muted text-center border-0">${t('all_good') || 'All good!'}</li>`;
    if (expiryCount   === 0) expiryList.innerHTML   = `<li class="list-group-item text-muted text-center border-0">${t('no_items_expiring') || 'No items expiring soon'}</li>`;

    // Udhaar reminders
    const udhaarList = document.getElementById('udhaar-reminder-list');
    if (udhaarList) {
        udhaarList.innerHTML = '';
        let udhaarAlerts = 0;

        customers.forEach(acc => {
            const due = parseFloat((acc.total_due !== undefined) ? acc.total_due : (acc.totalDue || 0)) || 0;
            if (due > 0) {
                udhaarAlerts++;
                let daysText = t('never_paid') || 'Never paid';
                if (acc.lastPaymentDate) {
                    const diff = Math.floor((new Date() - new Date(acc.lastPaymentDate)) / (1000 * 60 * 60 * 24));
                    daysText = diff === 0 ? (t('today_paid') || 'Paid today') : (t('days_since', { days: diff }) || `${diff} days ago`);
                }
                udhaarList.innerHTML += `<li class="list-group-item d-flex flex-column px-0 border-bottom-0">
                    <div class="d-flex justify-content-between text-danger fw-bold">
                        <span>${acc.customerName} ka ₹${due.toFixed(2)} pending hai</span>
                    </div>
                    <small class="text-muted"><i class="fas fa-history"></i> ${daysText}</small>
                </li>`;
            } else if (due === 0 && acc.history && acc.history.length > 0) {
                udhaarAlerts++;
                udhaarList.innerHTML += `<li class="list-group-item px-0 text-success fw-bold border-bottom-0">
                    <i class="fas fa-check-circle"></i> All dues cleared for ${acc.customerName}
                </li>`;
            }
        });

        if (udhaarAlerts === 0) {
            udhaarList.innerHTML = `<li class="list-group-item text-muted text-center border-0">${t('no_data') || 'No data'}</li>`;
        }
    }
}

// ============================================================
// PRODUCT MANAGEMENT
// ============================================================
function loadProducts() {
    const searchInput = document.getElementById('inventory-search');
    const rackInput   = document.getElementById('rack-filter');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
    const rackQuery   = rackInput   ? rackInput.value   : 'all';

    const tbody = document.getElementById('product-list-body');
    tbody.innerHTML = '';

    // Populate rack filter dropdown
    if (rackInput) {
        const existingRacks = Array.from(new Set(products.map(p => p.rack ? p.rack.trim() : '').filter(r => r !== '')));
        rackInput.innerHTML = `<option value="all">${t('all_racks') || 'All Racks'}</option>`;
        existingRacks.forEach(r => {
            rackInput.innerHTML += `<option value="${r}" ${rackQuery === r ? 'selected' : ''}>${r}</option>`;
        });
    }

    const filtered = products.filter(p => {
        const matchRack = rackQuery === 'all' || (p.rack && p.rack.trim() === rackQuery);
        if (!searchQuery) return matchRack;
        const kws = searchQuery.split(/\s+/).filter(k => k.length > 0);
        const matchText = kws.every(kw =>
            p.name.toLowerCase().includes(kw) ||
            (p.purchase_price && p.purchase_price.toString().includes(kw)) ||
            (p.selling_price  && p.selling_price.toString().includes(kw))  ||
            (p.rack  && p.rack.toLowerCase().includes(kw)) ||
            (p.side  && p.side.toLowerCase().includes(kw)) ||
            (p.shelf && p.shelf.toLowerCase().includes(kw))
        );
        return matchText && matchRack;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4"><i class="fas fa-box-open fa-2x mb-2 d-block opacity-25"></i>No products found</td></tr>`;
        return;
    }

    filtered.forEach(p => {
        const stock = getProductStock(p);
        let locHTML = '';
        if (p.rack || p.side || p.shelf) {
            locHTML = `<br><small class="text-muted"><i class="fas fa-map-marker-alt"></i> ${t('location_txt') || 'Loc'}: ${p.rack || ''} ${p.side ? '- ' + p.side : ''} ${p.shelf ? '- ' + p.shelf : ''}</small>`;
        }

        // Product image thumbnail
        const imgHTML = p.imageUrl
            ? `<img src="${p.imageUrl}" alt="${p.name}" class="rounded me-2" style="width:38px;height:38px;object-fit:cover;flex-shrink:0;" onerror="this.src='qr_placeholder.png'">`
            : `<span class="me-2 text-muted" style="width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;background:#f0f0f0;border-radius:8px;flex-shrink:0;"><i class="fas fa-image"></i></span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    ${imgHTML}
                    <div>
                        <div class="fw-semibold">${p.name}</div>${locHTML}
                    </div>
                </div>
            </td>
            <td>
                <small class="text-muted d-block">P: ₹${parseFloat(p.purchase_price).toFixed(2)}</small>
                <div class="fw-bold">S: ₹${parseFloat(p.selling_price).toFixed(2)}</div>
            </td>
            <td>
                <span class="badge ${stock < 5 ? (stock === 0 ? 'bg-danger' : 'bg-warning text-dark') : 'bg-success'} rounded-pill px-3 py-2">
                    ${stock} ${t('units') || 'units'}
                </span>
            </td>
            <td>
                <small class="text-muted">${(p.batches || []).length} ${t('batch_text') || 'batches'}</small>
            </td>
            <td class="text-end text-nowrap">
                <button class="btn btn-secondary btn-quick-action ms-1" onclick="openEditProduct('${p.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-primary btn-quick-action ms-1" onclick="openQuickAddBatch('${p.id}', '${p.name.replace(/'/g, "\\'")}')" title="Add Stock"><i class="fas fa-plus"></i></button>
                <button class="btn btn-warning btn-quick-action ms-1" onclick="quickReduceStock('${p.id}')" title="Reduce Stock"><i class="fas fa-minus"></i></button>
                <button class="btn btn-light text-danger btn-quick-action ms-2" onclick="deleteProduct('${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ---- Add Product ----
document.getElementById('add-product-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!checkPlanAccess()) return;

    const name    = document.getElementById('prd-name').value.trim();
    const pPrice  = parseFloat(document.getElementById('prd-purchase').value);
    const sPrice  = parseFloat(document.getElementById('prd-selling').value);
    const rack    = document.getElementById('prd-rack').value.trim();
    const side    = document.getElementById('prd-side').value;
    const shelf   = document.getElementById('prd-shelf').value;

    const btn = document.querySelector('#add-product-form button[type="submit"]');
    btn.disabled  = true;
    btn.innerText = 'Saving...';

    try {
        // Handle optional product image
        let imageUrl = null;
        const imgInput = document.getElementById('prd-image');
        if (imgInput && imgInput.files[0]) {
            btn.innerText = 'Uploading image...';
            imageUrl = await uploadToCloudinary(imgInput.files[0]);
        }

        await userDb('products').add({
            userId: currentUser.email,
            name,
            purchase_price: pPrice,
            selling_price: sPrice,
            rack, side, shelf,
            imageUrl,
            batches: []
        });

        bootstrap.Modal.getInstance(document.getElementById('addProductModal')).hide();
        document.getElementById('add-product-form').reset();
        if (imgInput) imgInput.value = '';
        // Clear image preview if exists
        const prevEl = document.getElementById('prd-image-preview');
        if (prevEl) { prevEl.src = ''; prevEl.classList.add('d-none'); }

    } catch (err) {
        alert("Error adding product: " + err.message);
        console.error(err);
    } finally {
        btn.disabled  = false;
        btn.innerText = 'Register Product';
    }
});

// ---- Delete Product ----
function deleteProduct(id) {
    if (confirm("Are you sure you want to delete this product?")) {
        userDb('products').doc(id).delete().catch(err => alert("Error: " + err.message));
    }
}

// ---- Edit Product ----
function openEditProduct(id) {
    const product = products.find(p => String(p.id) === String(id));
    if (!product) return;

    document.getElementById('edit-prd-id').value       = id;
    document.getElementById('edit-prd-name').value     = product.name;
    document.getElementById('edit-prd-purchase').value = product.purchase_price;
    document.getElementById('edit-prd-selling').value  = product.selling_price;
    document.getElementById('edit-prd-rack').value     = product.rack  || '';
    document.getElementById('edit-prd-side').value     = product.side  || '';
    document.getElementById('edit-prd-shelf').value    = product.shelf || '';

    // Show existing image preview
    const editPreview = document.getElementById('edit-prd-image-preview');
    if (editPreview) {
        if (product.imageUrl) {
            editPreview.src = product.imageUrl;
            editPreview.classList.remove('d-none');
            editPreview.onerror = () => { editPreview.src = 'qr_placeholder.png'; };
        } else {
            editPreview.classList.add('d-none');
        }
    }

    new bootstrap.Modal(document.getElementById('editProductModal')).show();
}

document.getElementById('edit-product-form').addEventListener('submit', async e => {
    e.preventDefault();

    const id      = document.getElementById('edit-prd-id').value;
    const product = products.find(p => p.id === id);
    if (!product) return;

    const btn = document.querySelector('#edit-product-form button[type="submit"]');
    btn.disabled  = true;
    btn.innerText = 'Saving...';

    try {
        const updatedFields = {
            name:           document.getElementById('edit-prd-name').value.trim(),
            purchase_price: parseFloat(document.getElementById('edit-prd-purchase').value),
            selling_price:  parseFloat(document.getElementById('edit-prd-selling').value),
            rack:           document.getElementById('edit-prd-rack').value.trim(),
            side:           document.getElementById('edit-prd-side').value,
            shelf:          document.getElementById('edit-prd-shelf').value
        };

        // Upload new image if selected
        const imgInput = document.getElementById('edit-prd-image');
        if (imgInput && imgInput.files[0]) {
            btn.innerText = 'Uploading image...';
            updatedFields.imageUrl = await uploadToCloudinary(imgInput.files[0]);
        }

        await userDb('products').doc(id).update(updatedFields);
        bootstrap.Modal.getInstance(document.getElementById('editProductModal')).hide();

    } catch (err) {
        alert("Error updating product: " + err.message);
        console.error(err);
    } finally {
        btn.disabled  = false;
        btn.innerText = 'Save Changes';
    }
});

// ============================================================
// BATCH MANAGEMENT
// ============================================================
function openQuickAddBatch(id, name) {
    document.getElementById('add-stock-name').innerText    = name;
    document.getElementById('quick-stock-id').value        = id;
    document.getElementById('quick-add-batch-form').reset();
    new bootstrap.Modal(document.getElementById('addBatchModal')).show();
}

document.getElementById('quick-add-batch-form').addEventListener('submit', async e => {
    e.preventDefault();

    const id         = document.getElementById('quick-stock-id').value;
    const qty        = parseInt(document.getElementById('quick-qty').value);
    const expiryRaw  = document.getElementById('quick-expiry').value;
    const expiry     = expiryRaw ? expiryRaw : null;

    const btn = document.querySelector('#quick-add-batch-form button[type="submit"]');
    btn.disabled  = true;
    btn.innerText = 'Saving...';

    try {
        const product = products.find(p => p.id === id);
        if (!product) throw new Error("Product not found.");

        const batches = [...(product.batches || [])];
        batches.push({ qty, expiry });

        await userDb('products').doc(id).update({ batches });

        bootstrap.Modal.getInstance(document.getElementById('addBatchModal')).hide();
        document.getElementById('quick-add-batch-form').reset();

    } catch (err) {
        alert("Error updating stock: " + err.message);
        console.error(err);
    } finally {
        btn.disabled  = false;
        btn.innerText = '+ Add Stock';
    }
});

function quickReduceStock(id) {
    const product = products.find(p => String(p.id) === String(id));
    if (!product) return;

    const stock = getProductStock(product);
    if (stock <= 0) { alert("No stock available to reduce!"); return; }

    const reduceAmt = parseInt(prompt(`How many units of "${product.name}" to discard/reduce?`));
    if (isNaN(reduceAmt) || reduceAmt <= 0) return;
    if (reduceAmt > stock) { alert("Can't reduce more than available stock!"); return; }

    // FIFO deduct
    const batches = [...(product.batches || [])];
    batches.sort((a, b) => {
        const dA = a.expiry ? new Date(a.expiry) : new Date('9999-12-31');
        const dB = b.expiry ? new Date(b.expiry) : new Date('9999-12-31');
        return dA - dB;
    });

    let remaining = reduceAmt;
    for (let i = 0; i < batches.length; i++) {
        if (remaining <= 0) break;
        if (batches[i].qty >= remaining) {
            batches[i].qty -= remaining;
            remaining = 0;
        } else {
            remaining -= batches[i].qty;
            batches[i].qty = 0;
        }
    }
    const updatedBatches = batches.filter(b => b.qty > 0);
    db.collection('products').doc(id).update({ batches: updatedBatches })
        .catch(err => alert("Error: " + err.message));
}

// ============================================================
// BILLING LOGIC
// ============================================================
function loadBilling() {
    populateRackFilter();
    renderBillingGrid();
    renderCart();
}

// Populate rack dropdown from products
function populateRackFilter() {
    const select = document.getElementById('billing-rack-filter');
    if (!select) return;

    // Get unique rack values
    const racks = [...new Set(
        products
            .map(p => (p.rack || p.shelf || '').trim())
            .filter(r => r.length > 0)
    )].sort();

    // Rebuild options
    select.innerHTML = '<option value="">🗂️ All Racks</option>';
    racks.forEach(rack => {
        const opt = document.createElement('option');
        opt.value = rack;
        opt.textContent = '📦 ' + rack;
        select.appendChild(opt);
    });
}

// Apply both search + rack filter together
function applyBillingFilters() {
    const search = (document.getElementById('billing-search')?.value || '').trim();
    const rack   = (document.getElementById('billing-rack-filter')?.value || '').trim();
    renderBillingGrid(search, rack);
}

function renderBillingGrid(search = '', rackFilter = '') {
    const grid = document.getElementById('billing-products-grid');
    grid.innerHTML = '';

    const keywords = search.toLowerCase().split(/\s+/).filter(k => k.length > 0);

    const filtered = products.filter(p => {
        // Rack filter
        if (rackFilter) {
            const productRack = (p.rack || p.shelf || '').trim();
            if (productRack.toLowerCase() !== rackFilter.toLowerCase()) return false;
        }
        // Keyword search
        if (keywords.length === 0) return true;
        return keywords.every(kw =>
            p.name.toLowerCase().includes(kw) ||
            (p.rack  && p.rack.toLowerCase().includes(kw)) ||
            (p.shelf && p.shelf.toLowerCase().includes(kw)) ||
            (p.selling_price && p.selling_price.toString().includes(kw))
        );
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-12 text-center text-muted py-4"><i class="fas fa-search fa-2x mb-2 d-block opacity-25"></i>No products found</div>`;
        return;
    }

    filtered.forEach(p => {
        const stock = getProductStock(p);
        const card  = document.createElement('div');
        card.className = `product-item-card ${stock === 0 ? 'opacity-50' : ''}`;
        card.onclick   = () => { if (stock > 0) addToCart(p); };

        const imgHTML = p.imageUrl
            ? `<img src="${p.imageUrl}" alt="${p.name}" class="rounded mb-2" style="width:60px;height:60px;object-fit:cover;" onerror="this.style.display='none'">`
            : '';

        const rackBadge = (p.rack || p.shelf)
            ? `<div class="small text-muted mt-1" style="font-size:0.68rem;"><i class="fas fa-map-marker-alt me-1"></i>${p.rack || p.shelf}</div>`
            : '';

        card.innerHTML = `
            ${imgHTML}
            <div class="fw-semibold mb-1">${p.name}</div>
            <div class="price">₹${parseFloat(p.selling_price).toFixed(2)}</div>
            <div class="small ${stock < 5 ? 'text-danger fw-bold' : 'text-success'} mt-1">${stock} ${t('in_stock') || 'in stock'}</div>
            ${rackBadge}
        `;
        grid.appendChild(card);
    });
}


function addToCart(product) {
    const existing = cart.find(i => i.id === product.id);
    const maxStock = getProductStock(product);
    if (existing) {
        if (existing.qty < maxStock) existing.qty++;
        else alert('Not enough stock available!');
    } else {
        if (maxStock > 0) cart.push({ ...product, qty: 1 });
    }
    renderCart();
}

function updateCartQty(id, change) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    const maxStock = getProductStock(products.find(p => p.id === id));
    item.qty += change;
    if (item.qty <= 0)       cart = cart.filter(i => i.id !== id);
    else if (item.qty > maxStock) { item.qty = maxStock; alert('Stock limit reached!'); }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    container.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        container.innerHTML = `<div class="text-center text-muted mt-5"><i class="fas fa-shopping-cart fs-1 mb-3 opacity-25 d-block"></i><p>${t('cart_empty') || 'Cart is empty'}</p></div>`;
        document.getElementById('checkout-btn').disabled = true;
    } else {
        document.getElementById('checkout-btn').disabled = false;
        cart.forEach(item => {
            const itemTotal = parseFloat(item.selling_price) * item.qty;
            total += itemTotal;

            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="flex-grow-1">
                    <div class="fw-semibold">${item.name}</div>
                    <div class="text-muted small">₹${parseFloat(item.selling_price).toFixed(2)}</div>
                </div>
                <div class="qty-control me-3">
                    <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)"><i class="fas fa-minus"></i></button>
                    <span class="fw-bold px-2">${item.qty}</span>
                    <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)"><i class="fas fa-plus"></i></button>
                </div>
                <div class="fw-bold text-end" style="min-width:60px;">₹${itemTotal.toFixed(2)}</div>
            `;
            container.appendChild(div);
        });
    }

    document.getElementById('cart-subtotal').innerText = total.toFixed(2);
    document.getElementById('cart-total').innerText    = total.toFixed(2);
    const qrAmt = document.getElementById('qr-amount');
    if (qrAmt) qrAmt.innerText = total.toFixed(2);
}

// Payment method selection
let selectedPaymentMethod = null;

document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        // Update active button styling
        document.querySelectorAll('.payment-btn').forEach(b => {
            b.classList.remove('btn-success', 'btn-primary', 'btn-warning');
            b.classList.add(
                b.dataset.method === 'cash'   ? 'btn-outline-success' :
                b.dataset.method === 'online' ? 'btn-outline-primary'  :
                'btn-outline-warning'
            );
        });
        btn.classList.remove('btn-outline-success', 'btn-outline-primary', 'btn-outline-warning');
        if (btn.dataset.method === 'cash')   btn.classList.add('btn-success');
        if (btn.dataset.method === 'online') btn.classList.add('btn-primary');
        if (btn.dataset.method === 'udhaar') btn.classList.add('btn-warning');

        selectedPaymentMethod = btn.dataset.method;

        // ✅ Online selected → fetch QR from Firestore and open modal immediately
        if (btn.dataset.method === 'online') {
            if (cart.length === 0) {
                alert('Cart empty hai! Pehle products add karo.');
                return;
            }
            // Update amount in modal
            const total = cart.reduce((sum, item) => sum + parseFloat(item.selling_price) * item.qty, 0);
            const qrAmtEl = document.getElementById('qr-amount');
            if (qrAmtEl) qrAmtEl.innerText = total.toFixed(2);

            // Show loading state in modal, then fetch QR
            await loadLatestQR();
            new bootstrap.Modal(document.getElementById('paymentModal')).show();
        }
    });
});

// Fetch latest QR code from Firestore (always fresh, never stale from localStorage)
async function loadLatestQR() {
    const imgEl = document.getElementById('qr-image');
    imgEl.src = 'qr_placeholder.png'; // show placeholder while loading

    try {
        const doc = await db.collection('users').doc(currentUser.email).get();

        if (!doc.exists) {
            console.warn('loadLatestQR: No user document found in Firestore for', currentUser.email);
            imgEl.src = 'qr_placeholder.png';
            return;
        }

        const data   = doc.data();
        const qrCode = data.qrCode;

        console.log('loadLatestQR → Firestore qrCode value:', qrCode);

        if (qrCode && qrCode.startsWith('http')) {
            // Valid Cloudinary URL — show it
            currentUser.qrCode = qrCode;
            saveCurrentUser();
            imgEl.src = qrCode;
            imgEl.onerror = () => {
                console.error('QR image failed to load from URL:', qrCode);
                imgEl.src = 'qr_placeholder.png';
            };
        } else {
            console.warn('loadLatestQR: qrCode is empty or invalid:', qrCode);
            imgEl.src = 'qr_placeholder.png';
        }

    } catch (err) {
        console.error('QR fetch error:', err);
        imgEl.src = 'qr_placeholder.png';
    }
}

document.getElementById('checkout-btn').addEventListener('click', async () => {
    if (!selectedPaymentMethod) { alert('Please select a payment method.'); return; }

    if (selectedPaymentMethod === 'udhaar') {
        const cmobile = document.getElementById('customer-mobile').value.trim();
        const cname   = document.getElementById('customer-name').value.trim();
        if (!cmobile || !cname) { alert(t('select_cust_first') || 'Please enter customer name and mobile.'); return; }
    }

    if (selectedPaymentMethod === 'online') {
        // Always fetch latest QR from Firestore before showing modal
        await loadLatestQR();
        new bootstrap.Modal(document.getElementById('paymentModal')).show();
    } else {
        processCheckout();
    }
});

document.getElementById('confirm-online-payment').addEventListener('click', () => processCheckout());

async function processCheckout() {
    // 0. Strict Validation
    if (!currentUser || !currentUser.email) {
        alert("Session expired. Please login again.");
        window.location.reload();
        return;
    }
    if (!selectedPaymentMethod) {
        alert('Please select a payment method.');
        return;
    }

    // Note: Billing checkout is allowed even if user has no active plan (payments should be permitted).

    // 1. Declare all required variables
    let orderTotalRevenue = 0;
    let orderTotalProfit  = 0;
    let receiptItemsHTML  = '';
    let orderItems        = [];
    const customerName   = (document.getElementById('customer-name')?.value || '').trim();
    const customerMobile = (document.getElementById('customer-mobile')?.value || '').trim();

    // 2. Calculate totals and build order items + deducted batches
    const batchUpdates = [];
    cart.forEach(cartItem => {
        const product = products.find(p => p.id === cartItem.id);
        if (!product || !product.batches) return;

        const itemRevenue = parseFloat(cartItem.selling_price) * cartItem.qty;
        const itemProfit  = (parseFloat(cartItem.selling_price) - parseFloat(cartItem.purchase_price)) * cartItem.qty;
        orderTotalRevenue += itemRevenue;
        orderTotalProfit  += itemProfit;

        receiptItemsHTML += `<tr><td>${cartItem.name}</td><td>${cartItem.qty}</td><td class="text-end">₹${itemRevenue.toFixed(2)}</td></tr>`;

        orderItems.push({
            productId:    cartItem.id,
            productName:  cartItem.name,
            qty:          cartItem.qty,
            purchasePrice: cartItem.purchase_price,
            sellingPrice:  cartItem.selling_price
        });

        // FIFO Batch Logic
        const batches = [...product.batches].sort((a, b) => {
            const dA = a.expiry ? new Date(a.expiry) : new Date('9999-12-31');
            const dB = b.expiry ? new Date(b.expiry) : new Date('9999-12-31');
            return dA - dB;
        });

        let remaining = cartItem.qty;
        for (let i = 0; i < batches.length; i++) {
            if (remaining <= 0) break;
            if (batches[i].qty >= remaining) {
                batches[i].qty -= remaining;
                remaining = 0;
            } else {
                remaining -= batches[i].qty;
                batches[i].qty = 0;
            }
        }
        batchUpdates.push({ id: cartItem.id, batches: batches.filter(b => b.qty > 0) });
    });

    try {
        const batchMod = db.batch();


        // 2. Queue batch updates for products
        batchUpdates.forEach(u => {
            batchMod.update(userDb('products').doc(u.id), { batches: u.batches });
        });

        // 3. Queue Order save
        const orderRef = userDb('orders').doc();
        batchMod.set(orderRef, {
            userId:        currentUser.email,
            date:          new Date().toISOString(),
            items:         orderItems,
            totalRevenue:  orderTotalRevenue,
            totalProfit:   orderTotalProfit,
            paymentMethod: selectedPaymentMethod,
            customerName:  customerName || null,
            customerMobile: customerMobile || null
        });

        // 4. Queue Udhaar handling
        if (selectedPaymentMethod === 'udhaar') {
            const now = new Date().toISOString();
            const acc = customers.find(a => a.mobile === customerMobile);
            if (!acc) {
                const newCustRef = userDb('customers').doc();
                batchMod.set(newCustRef, {
                    userId: currentUser.email,
                    mobile: customerMobile,
                    customerName: customerName,
                    total_due: orderTotalRevenue,
                    lastPaymentDate: null,
                    history: [{ date: now, amount: orderTotalRevenue, type: 'debt', orderId: orderRef.id }]
                });
            } else {
                const custRef = userDb('customers').doc(acc.id);
                // Safe FieldValue access
                const FieldValue = firebase.firestore.FieldValue;
                batchMod.update(custRef, {
                    customerName: customerName,
                    total_due: FieldValue.increment(orderTotalRevenue),
                    history: FieldValue.arrayUnion({ date: now, amount: orderTotalRevenue, type: 'debt', orderId: orderRef.id })
                });
            }
        }

        // Execute all updates atomically
        await batchMod.commit();

    } catch (err) {
        alert("Checkout error: " + err.message);
        console.error(err);
        return;
    }

    // Success: Prepare receipt and reset
    document.getElementById('receipt-shop-name').innerText = currentUser.shop;
    document.getElementById('receipt-items').innerHTML     = receiptItemsHTML;
    document.getElementById('receipt-total').innerText     = orderTotalRevenue.toFixed(2);

    window.latestOrderData = { mobile: customerMobile, total: orderTotalRevenue };

    cart = [];
    selectedPaymentMethod = null;
    document.querySelectorAll('.payment-btn').forEach(b => {
        b.classList.remove('btn-success', 'btn-primary', 'btn-warning');
        if (b.dataset.method === 'cash')   b.classList.add('btn-outline-success');
        if (b.dataset.method === 'online') b.classList.add('btn-outline-primary');
        if (b.dataset.method === 'udhaar') b.classList.add('btn-outline-warning');
    });
    
    renderCart();
    renderBillingGrid();
    document.getElementById('customer-name').value   = '';
    document.getElementById('customer-mobile').value = '';

    new bootstrap.Modal(document.getElementById('checkoutSuccessModal')).show();
}

// Success modal actions
document.getElementById('btn-print-bill').addEventListener('click', () => window.print());

document.getElementById('btn-send-sms').addEventListener('click', () => {
    const msg     = `Thank you for shopping!\nTotal Amount: ₹${window.latestOrderData.total.toFixed(2)}\nVisit again!`;
    const encoded = encodeURIComponent(msg);
    const href    = window.latestOrderData.mobile ? `sms:${window.latestOrderData.mobile}?body=${encoded}` : `sms:?body=${encoded}`;
    window.location.href = href;
});

// ============================================================
// ANALYTICS
// ============================================================
function loadAnalytics() {
    let productCounts = {};
    let monthlySales  = {};

    orders.forEach(order => {
        (order.items || []).forEach(item => {
            productCounts[item.productId] = (productCounts[item.productId] || 0) + item.qty;
        });
        const d   = new Date(order.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlySales[key]) monthlySales[key] = 0;
        monthlySales[key] += (order.totalRevenue || 0);
    });

    const topLabels = [], topData = [];
    const bgColors  = ['#4361ee', '#4cc9f0', '#3f37c9', '#4caf50', '#ff9800', '#f44336'];

    for (let pid in productCounts) {
        const p = products.find(x => x.id === pid);
        topLabels.push(p ? p.name : 'Unknown');
        topData.push(productCounts[pid]);
    }

    const monthKeys = Object.keys(monthlySales).sort();
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const barLabels  = monthKeys.map(k => { const p = k.split('-'); return `${monthNames[parseInt(p[1])-1]} ${p[0]}`; });
    const barData    = monthKeys.map(k => monthlySales[k]);

    if (pieChart) pieChart.destroy();
    if (barChart) barChart.destroy();

    const ctxPie = document.getElementById('topProductsChart').getContext('2d');
    pieChart = new Chart(ctxPie, {
        type: 'pie',
        data: {
            labels: topLabels.length > 0 ? topLabels : [t('no_data') || 'No data'],
            datasets: [{ data: topData.length > 0 ? topData : [1], backgroundColor: topData.length > 0 ? bgColors : ['#e0e0e0'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });

    const ctxBar = document.getElementById('monthlySalesChart').getContext('2d');
    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: barLabels.length > 0 ? barLabels : [t('no_data') || 'No data'],
            datasets: [{
                label: 'Revenue (₹)',
                data: barData.length > 0 ? barData : [0],
                backgroundColor: 'rgba(67,97,238,0.7)',
                borderColor: 'rgba(67,97,238,1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

// ============================================================
// PROFILE MANAGEMENT
// ============================================================
async function loadProfile() {
    document.getElementById('profile-name').value   = currentUser.name   || '';
    document.getElementById('profile-shop').value   = currentUser.shop   || '';
    document.getElementById('profile-mobile').value = currentUser.mobile || '';

    const preview = document.getElementById('profile-qr-preview');
    // Show cached version first (instant)
    preview.src = safeImgSrc(currentUser.qrCode);
    preview.onerror = () => { preview.src = 'qr_placeholder.png'; };

    // Then fetch fresh from Firestore so QR + subscription are always up-to-date
    try {
        const doc = await db.collection('users').doc(currentUser.email).get();
        if (doc.exists) {
            const d = doc.data();

            // Sync QR
            if (d.qrCode) {
                currentUser.qrCode = d.qrCode;
                preview.src = d.qrCode;
                preview.onerror = () => { preview.src = 'qr_placeholder.png'; };
            }

            // Sync subscription fields
            currentUser.subscriptionPlan = d.subscriptionPlan || 'free';
            currentUser.planStart        = d.planStart || null;
            currentUser.planEnd          = d.planEnd   || null;
            currentUser.pricePaid        = d.pricePaid || 0;
            saveCurrentUser();
        }
    } catch (err) {
        console.warn('Could not refresh profile from Firestore:', err);
    }

    // Fetch latest active plans from Firestore, which will then automatically render the Subscription UI
    if (typeof loadActivePlans === 'function') {
        loadActivePlans();
    } else {
        loadSubscriptionUI();
    }
}

// QR local preview for profile
document.getElementById('profile-qr').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const preview = document.getElementById('profile-qr-preview');
        preview.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();

    const btn = document.querySelector('#profile-form button[type="submit"]');
    btn.disabled  = true;
    btn.innerText = 'Saving...';

    try {
        const newName   = document.getElementById('profile-name').value.trim();
        const newShop   = document.getElementById('profile-shop').value.trim();
        const newMobile = document.getElementById('profile-mobile').value.trim();

        let qrCode = currentUser.qrCode || null;

        // Upload new QR to Cloudinary if file selected
        const qrInput = document.getElementById('profile-qr');
        if (qrInput && qrInput.files[0]) {
            btn.innerText = 'Uploading QR...';
            qrCode = await uploadToCloudinary(qrInput.files[0]);
        }

        const updatedData = {
            name:   newName,
            shop:   newShop,
            mobile: newMobile,
            qrCode: qrCode || '',
            email:  currentUser.email   // keep email field in sync
        };

        // Use set+merge so it creates the doc if it doesn't exist yet
        await db.collection('users').doc(currentUser.email).set(updatedData, { merge: true });

        // Update local state
        currentUser = { ...currentUser, ...updatedData };
        saveCurrentUser();

        // Update header / sidebar
        document.getElementById('display-user-name').innerText = newName.split(' ')[0];
        document.getElementById('display-shop-name').innerText = newShop;

        // ✅ Update QR preview to show real Cloudinary URL (not the temporary local blob)
        const qrPreview = document.getElementById('profile-qr-preview');
        const qrStatus  = document.getElementById('qr-save-status');

        if (qrCode && qrCode.startsWith('http')) {
            // Show actual Cloudinary image
            qrPreview.src = qrCode;
            qrPreview.onerror = () => { qrPreview.src = 'qr_placeholder.png'; };

            // Show a green status badge with the URL so user can confirm
            if (qrStatus) {
                qrStatus.innerHTML = `
                    <span class="badge bg-success px-3 py-2">
                        ✅ QR Uploaded to Cloudinary
                    </span>
                    <br>
                    <a href="${qrCode}" target="_blank" class="text-muted text-break" style="font-size:0.7rem; word-break:break-all;">
                        ${qrCode.substring(0, 60)}...
                    </a>`;
            }
            console.log('✅ QR Code saved to Firestore:', qrCode);
        } else {
            if (qrStatus) {
                qrStatus.innerHTML = `<span class="badge bg-warning text-dark">⚠️ No QR uploaded</span>`;
            }
        }

        // Reset file input
        if (qrInput) qrInput.value = '';

        alert('✅ Profile updated! QR code is now live in payment modal.');

    } catch (err) {
        alert("Profile update error: " + err.message);
        console.error(err);
    } finally {
        btn.disabled  = false;
        btn.innerText = 'Save Profile Config';
    }
});

// ============================================================
// UDHAAR MANAGEMENT
// ============================================================
function renderCustomers() {
    const activeList  = document.getElementById('active-udhaar-list');
    const clearedList = document.getElementById('cleared-udhaar-list');
    if (!activeList || !clearedList) return;

    activeList.innerHTML  = '';
    clearedList.innerHTML = '';

    const searchInput = document.getElementById('udhaar-search');
    const sq = searchInput ? searchInput.value.toLowerCase() : '';

    let filtered = customers;
    if (sq) {
        filtered = customers.filter(a =>
            (a.customerName || '').toLowerCase().includes(sq) ||
            (a.mobile || '').includes(sq)
        );
    }

    if (filtered.length === 0) {
        activeList.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4"><i class="fas fa-book fa-2x mb-2 d-block opacity-25"></i>No udhaar records found</td></tr>`;
        return;
    }

    filtered.forEach(acc => {
        let lastPaidTxt = '-';
        if (acc.lastPaymentDate) {
            const diff = Math.floor((new Date() - new Date(acc.lastPaymentDate)) / (1000 * 60 * 60 * 24));
            lastPaidTxt = diff === 0 ? (t('today') || 'Today') : `${diff} ${t('days_ago') || 'days ago'}`;
        }

        const histBtn  = `<button class="btn btn-sm btn-outline-secondary ms-1" onclick="openUdhaarHistory('${acc.mobile}')"><i class="fas fa-list"></i> ${t('history') || 'History'}</button>`;
        const dueAmount = parseFloat((acc.total_due !== undefined) ? acc.total_due : (acc.totalDue || 0)) || 0;

        if (dueAmount > 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold">${acc.customerName || acc.name || 'Unknown'}</td>
                <td>${acc.mobile || '-'}</td>
                <td class="text-danger fw-bold">₹${dueAmount.toFixed(2)}</td>
                <td class="text-muted"><small>${lastPaidTxt}</small></td>
                <td class="text-end text-nowrap">
                    <button class="btn btn-sm btn-success" onclick="openUdhaarPayment('${acc.mobile}')"><i class="fas fa-rupee-sign"></i> ${t('add_payment') || 'Pay'}</button>
                    ${histBtn}
                </td>
            `;
            activeList.appendChild(tr);

        } else if (acc.history && acc.history.length > 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold">${acc.customerName || acc.name || 'Unknown'}</td>
                <td>${acc.mobile || '-'}</td>
                <td class="text-success fw-bold"><i class="fas fa-check"></i> ${t('cleared_txt') || 'Cleared'}</td>
                <td class="text-end text-nowrap">${histBtn}</td>
            `;
            clearedList.appendChild(tr);
        }
    });
}

function openUdhaarPayment(mobile) {
    const acc = customers.find(a => a.mobile === mobile);
    if (!acc) return;

    const displayName = acc.customerName || acc.name || 'Unknown';
    document.getElementById('u-pay-name').innerText = displayName;
    document.getElementById('u-pay-mobile').value   = acc.mobile;

    let totalDue = parseFloat((acc.total_due !== undefined) ? acc.total_due : (acc.totalDue || 0)) || 0;
    totalDue = Math.round(totalDue * 100) / 100; // round to 2 dp

    document.getElementById('u-pay-amount').innerText         = totalDue.toFixed(2);
    document.getElementById('u-pay-input').value              = totalDue.toFixed(2);
    document.getElementById('u-pay-input').setAttribute('max', totalDue.toFixed(2));

    const stlBtn = document.getElementById('btn-pay-full');
    stlBtn.innerText = `Full Settle (₹${totalDue.toFixed(2)})`;

    stlBtn.onclick = () => {
        document.getElementById('u-pay-input').value = totalDue.toFixed(2);
        if (confirm(`Confirm Full Settlement of ₹${totalDue.toFixed(2)}?`)) {
            const saveBtn = document.querySelector('#udhaar-pay-form button[type="submit"]');
            if (saveBtn) saveBtn.click();
        }
    };

    const modalEl = document.getElementById('udhaarPaymentModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl);
    modal.show();
}

document.getElementById('udhaar-pay-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!checkPlanAccess()) return;

    const mobile = document.getElementById('u-pay-mobile').value;
    const amt    = parseFloat(document.getElementById('u-pay-input').value);
    const acc    = customers.find(a => a.mobile === mobile);
    if (!acc) return;

    let totalDue = parseFloat((acc.total_due !== undefined) ? acc.total_due : (acc.totalDue || 0)) || 0;
    totalDue = Math.round(totalDue * 100) / 100;

    if (isNaN(amt) || amt <= 0 || amt > (totalDue + 0.01)) {
        alert("Invalid amount! Cannot exceed total due of ₹" + totalDue.toFixed(2));
        return;
    }

    const btn = document.querySelector('#udhaar-pay-form button[type="submit"]');
    btn.disabled  = true;
    btn.innerText = 'Saving...';

    const now = new Date().toISOString();

    try {
        // Compute new total exactly (avoid floating-point drift)
        const newDue = Math.max(0, Math.round((totalDue - amt) * 100) / 100);

        await userDb('customers').doc(acc.id).update({
            total_due:        newDue,
            lastPaymentDate:  now,
            history: firebase.firestore.FieldValue.arrayUnion({ date: now, amount: amt, type: 'payment' })
        });

        // Close modal
        const modalEl = document.getElementById('udhaarPaymentModal');
        const modal   = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

    } catch (err) {
        alert("Payment Error: " + err.message);
        console.error(err);
    } finally {
        btn.disabled  = false;
        btn.innerText = 'Save Payment';
    }
});

function openUdhaarHistory(mobile) {
    const acc = customers.find(a => a.mobile === mobile);
    if (!acc) return;

    const list = document.getElementById('udhaar-history-list');
    list.innerHTML = '';

    if (!acc.history || acc.history.length === 0) {
        list.innerHTML = `<div class="text-muted text-center p-3">${t('no_data') || 'No records'}</div>`;
    } else {
        const hist = [...acc.history].sort((a, b) => new Date(b.date) - new Date(a.date));
        hist.forEach(h => {
            const isPay  = h.type === 'payment';
            const icon   = isPay ? 'fa-arrow-down text-success' : 'fa-arrow-up text-danger';
            const sign   = isPay ? '-' : '+';
            const color  = isPay ? 'text-success' : 'text-danger';
            const dStr   = new Date(h.date).toLocaleString();
            list.innerHTML += `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <i class="fas ${icon} me-2"></i>
                        <strong>${isPay ? (t('record_payment') || 'Payment') : (t('udhaar_btn') || 'Udhaar')}</strong>
                        <br><small class="text-muted">${dStr}</small>
                    </div>
                    <div class="fw-bold ${color}">${sign}₹${h.amount.toFixed(2)}</div>
                </div>
            `;
        });
    }
    new bootstrap.Modal(document.getElementById('udhaarHistoryModal')).show();
}

// ============================================================
// SUBSCRIPTION SYSTEM — COMPLETE
// ============================================================

// PLAN_CONFIG is now dynamic via loadActivePlans()
let PLAN_CONFIG = {}; 

const RAZORPAY_KEY_ID = "rzp_live_RKGta71P3BwQyD";

let selectedPlanType  = 'monthly';
let appliedCoupon     = null;
let checkoutBasePrice = 0;

// --- Development: Mock data toggle and sample users for testing ---
// Default disabled. Enable via Ctrl+Shift+M or URL ?mock=true for development only.
let USE_MOCK_PLANS = false;
const MOCK_USERS = {
    'mock_free@local': {
        email: 'mock_free@local', name: 'Free Shop', shop: 'Free Shop', status: 'approved',
        plan: 'free', subscriptionPlan: 'free', planStart: new Date().toISOString(),
        planEnd: new Date(new Date().setDate(new Date().getDate()+30)).toISOString(),
        pricePaid: 0
    },
    'mock_monthly@local': {
        email: 'mock_monthly@local', name: 'Monthly Shop', shop: 'Monthly Shop', status: 'approved',
        plan: 'monthly', subscriptionPlan: 'monthly', planStart: new Date().toISOString(),
        planEnd: new Date(new Date().setDate(new Date().getDate()+30)).toISOString(),
        pricePaid: 99
    },
    'mock_yearly@local': {
        email: 'mock_yearly@local', name: 'Yearly Shop', shop: 'Yearly Shop', status: 'approved',
        plan: 'yearly', subscriptionPlan: 'yearly', planStart: new Date().toISOString(),
        planEnd: new Date(new Date().setFullYear(new Date().getFullYear()+1)).toISOString(),
        pricePaid: 999
    },
    'mock_pending@local': {
        email: 'mock_pending@local', name: 'Pending Shop', shop: 'Pending Shop', status: 'pending',
        plan: 'none', subscriptionPlan: 'none', planStart: null, planEnd: null
    },
    'mock_expired@local': {
        email: 'mock_expired@local', name: 'Expired Shop', shop: 'Expired Shop', status: 'approved',
        plan: 'monthly', subscriptionPlan: 'monthly', planStart: new Date(new Date().setDate(new Date().getDate()-60)).toISOString(),
        planEnd: new Date(new Date().setDate(new Date().getDate()-30)).toISOString(),
        pricePaid: 99
    }
};

function isMockEnabled() {
    if (window._mockEnabledFlag) return true;
    try { if (new URLSearchParams(window.location.search).get('mock') === 'true') return true; } catch(e){}
    return USE_MOCK_PLANS;
}

function seedMockSelector() {
    if (!isMockEnabled()) return;
    const wrap = document.getElementById('subscription-ui-wrap');
    if (!wrap) return;
    // avoid duplicate
    if (document.getElementById('mock-user-select')) return;

    const selWrap = document.createElement('div');
    selWrap.className = 'mb-3';
    selWrap.innerHTML = `
        <label class="form-label small text-muted">Dev: Choose mock user</label>
        <select id="mock-user-select" class="form-select form-select-sm">
            <option value="mock_free@local">Free — active</option>
            <option value="mock_monthly@local">Monthly — active</option>
            <option value="mock_yearly@local">Yearly — active</option>
            <option value="mock_pending@local">Pending — approval</option>
            <option value="mock_expired@local">Expired</option>
        </select>
        `;
    wrap.prepend(selWrap);

    document.getElementById('mock-user-select').addEventListener('change', e => {
        const key = e.target.value;
        // swap currentUser for testing (local only)
        currentUser = MOCK_USERS[key];
        saveCurrentUser();
        // refresh UI
        validateSubscription();
        loadDashboard();
    });
}

// Toggle mock mode via secret key or programmatically
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        window._mockEnabledFlag = !window._mockEnabledFlag;
        alert('Mock mode ' + (window._mockEnabledFlag ? 'ENABLED' : 'DISABLED') + '. Refreshing UI...');
        validateSubscription();
        loadDashboard();
    }
});

// ── Helper: format date ──
function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

// ── Helper: days left ──
function getDaysLeft(planEnd) {
    if (!planEnd) return null;
    return Math.ceil((new Date(planEnd) - new Date()) / (1000 * 60 * 60 * 24));
}

// ── Helper: is plan currently active? ──
function isPlanActive() {
    if (!currentUser) return false;
    const plan = currentUser.plan || currentUser.subscriptionPlan || '';
    const end  = currentUser.planEnd;
    // No plan at all
    if (!plan || plan === 'none' || plan === '') return false;
    // Has a plan but no end date — treat as active (old accounts / grandfathered)
    if (!end) return true;
    // Has end date — check if not expired
    const daysLeft = getDaysLeft(end);
    return daysLeft > 0;
}

// ── validateSubscription (called on app load) ──
async function validateSubscription() {
    if (!currentUser) return;
    try {
        let data = null;
        // Support mock mode for testing (enabled via Ctrl+Shift+M or ?mock=true)
        if (isMockEnabled() && MOCK_USERS[currentUser.email]) {
            data = MOCK_USERS[currentUser.email];
        } else {
            const doc  = await db.collection('users').doc(currentUser.email).get();
            if (!doc.exists) return;
            data = doc.data();
        }

        // Sync to localStorage
        currentUser = { ...currentUser, ...data };
        saveCurrentUser();

        const plan     = currentUser.plan || currentUser.subscriptionPlan || '';
        const planEnd  = currentUser.planEnd ? new Date(currentUser.planEnd) : null;
        const today    = new Date();
        const daysLeft = planEnd ? Math.ceil((planEnd - today) / (1000 * 60 * 60 * 24)) : null;

        // If admin approved and user had requested a plan, auto-activate the requested plan safely
        if (currentUser.status === 'approved' && currentUser.requestedPlan) {
            try {
                const req = currentUser.requestedPlan;
                // Only auto-activate if user currently has no active plan
                const existingPlan = currentUser.plan || currentUser.subscriptionPlan;
                if ((!existingPlan || existingPlan === 'none') && req === 'free') {
                    const now = new Date();
                    const end = new Date(); end.setDate(end.getDate() + 30);
                    const data = {
                        plan: 'free', subscriptionPlan: 'free', planStart: now.toISOString(), planEnd: end.toISOString(), pricePaid: 0,
                        freePlanUsed: true,
                        requestedPlan: firebase.firestore.FieldValue.delete()
                    };
                    await db.collection('users').doc(currentUser.email).set(data, { merge: true });
                    Object.assign(currentUser, data);
                    saveCurrentUser();
                    alert('🎉 Your requested Free Trial has been activated. Enjoy 30 days!');
                }
            } catch (err) {
                console.error('Auto-activate requested plan failed:', err);
            }
        }

        // Pending approval -> show pending banner but keep dashboard visible
        if (currentUser.status === 'pending') {
            showPlanPendingBanner();
        } else {
            removePlanPendingBanner();
        }

        // Case A: Pending user with no plan -> block with overlay (force plan selection)
        if (currentUser.status === 'pending' && (!plan || plan === 'none')) {
            document.getElementById('expired-overlay').classList.add('d-none');
            showNoPlanOverlay(); // Fixed overlay that forces plan selection
            // Keep user document listener active so admin approvals are received in realtime
            removeDataListeners();
            seedMockSelector();
            return;
        }

        // Approved users with no plan can still access dashboard to select a plan
        if (currentUser.status === 'approved') {
            closePlanOverlay();
            initFirebaseListeners();
        } else if (!plan || plan === 'none') {
            // Other statuses with no plan: block
            showNoPlanOverlay();
            removeDataListeners();
            return;
        }

        // Case B: Plan expired -> BLOCK BILLING/MODIFICATIONS (banner + block billing/udhaar)
        if (planEnd && daysLeft !== null && daysLeft <= 0) {
            showPlanExpiredBanner();
        } else {
            document.getElementById('expiry-expired-banner')?.remove();
        }

        initFirebaseListeners();

        // 2-day warning banner
        if (planEnd && daysLeft !== null && daysLeft > 0 && daysLeft <= 2) {
            showPlanExpiryBanner(daysLeft);
        }

        // Add dev selector if mock mode
        seedMockSelector();

    } catch (err) { console.error('validateSubscription error:', err); }
}

// ── Show no-plan overlay ──
function showNoPlanOverlay() {
    const el = document.getElementById('no-plan-overlay');
    if (!el) return;
    el.style.display = 'flex';
    el.classList.remove('d-none');
}

// ── Close no-plan overlay ──
function closePlanOverlay() {
    const el = document.getElementById('no-plan-overlay');
    if (!el) return;
    el.style.display = 'none';
    el.classList.add('d-none');
}

// ── Show expiry warning banner ──
function showPlanExpiryBanner(daysLeft) {
    if (document.getElementById('expiry-warning-banner')) return;
    const b = document.createElement('div');
    b.id = 'expiry-warning-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:7000;background:linear-gradient(90deg,#f59e0b,#d97706);color:#fff;text-align:center;padding:10px 16px;font-size:0.86rem;font-weight:600;font-family:Outfit,sans-serif;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;box-shadow:0 4px 12px rgba(0,0,0,0.1);';
    b.innerHTML = `<span>⚠️ Your plan expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>. Renew to avoid interruption!</span>`
        + `<button onclick="this.parentElement.remove()" style="background:#fff;border:none;color:#d97706;border-radius:8px;padding:4px 14px;font-size:0.81rem;cursor:pointer;font-weight:800;">DISMISS</button>`;
    document.body.prepend(b);
}

function showPlanExpiredBanner() {
    if (document.getElementById('expiry-expired-banner')) return;
    const b = document.createElement('div');
    b.id = 'expiry-expired-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:7000;background:linear-gradient(90deg,#ef4444,#b91c1c);color:#fff;text-align:center;padding:12px 16px;font-size:0.88rem;font-weight:600;font-family:Outfit,sans-serif;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;box-shadow:0 4px 15px rgba(0,0,0,0.2);';
    b.innerHTML = `<span>🛑 <strong>Plan Expired!</strong> Billing and Udhaar features are currently locked.</span>`
        + `<button onclick="this.parentElement.remove()" style="background:#fff;border:none;color:#ef4444;border-radius:8px;padding:5px 16px;font-size:0.85rem;cursor:pointer;font-weight:800;box-shadow:0 2px 4px rgba(0,0,0,0.1);">DISMISS</button>`;
    document.body.prepend(b);
}

function showPlanPendingBanner() {
    if (document.getElementById('expiry-pending-banner')) return;
    const b = document.createElement('div');
    b.id = 'expiry-pending-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:7000;background:linear-gradient(90deg,#f59e0b,#d97706);color:#1a1d2e;text-align:center;padding:12px 16px;font-size:0.88rem;font-weight:700;font-family:Outfit,sans-serif;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;box-shadow:0 4px 15px rgba(0,0,0,0.1);';
    b.innerHTML = `<span>⏳ Waiting for Admin Approval — some features are locked.</span>`
        + `<button onclick="this.parentElement.remove()" style="background:#fff;border:none;color:#d97706;border-radius:8px;padding:5px 12px;font-size:0.85rem;cursor:pointer;font-weight:700;margin-left:8px;">DISMISS</button>`;
    document.body.prepend(b);
}

function removePlanPendingBanner() {
    const el = document.getElementById('expiry-pending-banner');
    if (el) el.remove();
}

// ── loadDashboard — add renderPlanSection call ──
// (We patch loadDashboard at the end to call renderPlanSection)
const _origLoadDashboard = loadDashboard;
// Override
window.loadDashboard = function() {
    _origLoadDashboard();
    if (typeof loadActivePlans === 'function') loadActivePlans();
};

// ── Load Active Plans from Firestore ──
async function loadActivePlans() {
    try {
        const snap = await db.collection('plans').where('isActive', '==', true).orderBy('createdAt', 'asc').get();
        activePlans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Populate PLAN_CONFIG for backward compatibility in some logic
        PLAN_CONFIG = {
            free: { label: 'Free', price: 0, days: 30 }
        };
        activePlans.forEach(p => {
            PLAN_CONFIG[p.id] = { label: p.name, price: p.price, days: p.durationDays };
        });

        loadSubscriptionUI();
    } catch (err) {
        console.error('loadActivePlans error:', err);
    }
}

// ── Render Plan Section (Subscription UI) ──
function loadSubscriptionUI() {
    const wrap = document.getElementById('subscription-ui-wrap');
    if (!wrap) return;

    const currentPlanId = currentUser?.plan || currentUser?.subscriptionPlan || 'none';
    const daysLeft = getDaysLeft(currentUser?.planEnd);
    const planEnd  = currentUser?.planEnd;
    const planStart = currentUser?.planStart;

    // Expiry/Status logic
    let expiryHTML = '';
    if (daysLeft !== null && daysLeft > 0) {
        const color = daysLeft <= 2 ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : '#22c55e';
        expiryHTML = `<span style="color:${color};font-weight:700;font-size:0.82rem;">${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</span>`;
    } else if (daysLeft !== null && daysLeft <= 0 && currentPlanId !== 'none') {
        expiryHTML = `<span style="color:#ef4444;font-weight:700;font-size:0.82rem;">Expired</span>`;
    }

    let statusBarHTML = '';
    if (currentPlanId && currentPlanId !== 'none') {
        const planLabel = PLAN_CONFIG[currentPlanId]?.label || currentPlanId;
        const statusText = (currentUser.status === 'pending') ? 'Waiting for Admin Approval' : (daysLeft !== null && daysLeft <= 0) ? 'Your Plan Has Expired' : 'Your Plan is Active';
        const badgeColor = (currentUser.status === 'pending') ? '#f59e0b' : (daysLeft !== null && daysLeft <= 0) ? '#ef4444' : '#10b981';
        const daysLeftHTML = daysLeft !== null ? `<div style="font-weight:800;font-size:0.95rem;color:#111">${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</div>` : '';
        statusBarHTML = `
        <div class="plan-status-bar mb-3 d-flex justify-content-between align-items-center" style="gap:12px;">
            <div>
                <div style="font-size:0.75rem;opacity:0.8;margin-bottom:3px;">Current Plan</div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-weight:800;font-size:1.05rem;">${planLabel}</span>
                    <span style="background:${badgeColor};color:#fff;padding:6px 10px;border-radius:999px;font-weight:700;font-size:0.78rem;">${statusText}</span>
                    ${daysLeftHTML}
                </div>
            </div>
            <div class="plan-dates text-end" style="font-size:0.85rem;color:#6b7280;">
                ${planStart ? `<div>Start<br><span style="font-weight:700;color:#111">${fmtDate(planStart)}</span></div>` : ''}
                ${planEnd ? `<div>End<br><span style="font-weight:700;color:#111">${fmtDate(planEnd)}</span></div>` : ''}
            </div>
        </div>`;
    }

    // Dynamic Cards
    const isFreeActive = currentPlanId === 'free' || currentPlanId === 'trial';
    
    let cardsHTML = `
        <!-- FREE PLAN (Always Top) -->
        <div class="plan-card-item ${isFreeActive ? 'active-plan' : ''}">
            <span class="plan-card-icon">🎁</span>
            <div class="plan-card-name">Free Trial (30 Days)</div>
            <div class="plan-card-price">₹0</div>
            <div class="plan-card-duration">30 Days</div>
            ${isFreeActive ? `<div class="plan-active-label">✓ Active</div>${expiryHTML ? `<div class="plan-expires-warning">${expiryHTML}</div>` : ''}` : `<button class="plan-card-btn free-btn" onclick="handleStartFree(this)">Start Free Trial</button>`}
        </div>
    `;

    // Static Standard Plans (Fallback if no dynamic plans found, ensuring Monthly/Yearly always show)
    if (!activePlans || activePlans.length === 0) {
        cardsHTML += `
            <div class="plan-card-item ${currentPlanId === 'monthly' ? 'active-plan' : ''}">
                <span class="plan-card-icon">💎</span>
                <div class="plan-card-name">Monthly Plan</div>
                <div class="plan-card-price">₹99</div>
                <div class="plan-card-duration">30 Days Access</div>
                ${currentPlanId === 'monthly' ? `<div class="plan-active-label">✓ Active</div>${expiryHTML ? `<div class="plan-expires-warning">${expiryHTML}</div>` : ''}` : `<button class="plan-card-btn monthly-btn" onclick="handleUpgrade(this,'monthly')">Upgrade Plan</button>`}
            </div>
            <div class="plan-card-item yearly-plan ${currentPlanId === 'yearly' ? 'active-plan' : ''}">
                <div class="plan-save-badge">SAVE</div>
                <span class="plan-card-icon">👑</span>
                <div class="plan-card-name">Yearly Plan</div>
                <div class="plan-card-price">₹999</div>
                <div class="plan-card-duration">365 Days Access</div>
                ${currentPlanId === 'yearly' ? `<div class="plan-active-label">✓ Active Plan</div>${expiryHTML ? `<div class="plan-expires-warning">${expiryHTML}</div>` : ''}` : `<button class="plan-card-btn yearly-btn" style="background: linear-gradient(135deg, #f6d365, #fda085); color:#1a1d2e;" onclick="openPlanCheckoutModal('yearly')">Buy Now</button>`}
            </div>
        `;
    }

    // Dynamic Paid Plans
    activePlans.forEach(p => {
        const isActive = currentPlanId === p.id || currentPlanId === p.name;
        cardsHTML += `
            <div class="plan-card-item ${isActive ? 'active-plan' : ''}">
                <span class="plan-card-icon">💎</span>
                <div class="plan-card-name">${p.name}</div>
                <div class="plan-card-price">₹${p.price}</div>
                <div class="plan-card-duration">${p.durationDays} Days</div>
                ${isActive ? 
                    `<div class="plan-active-label">✓ Active</div>${expiryHTML ? `<div class="plan-expires-warning">${expiryHTML}</div>` : ''}` : 
                    `<button class="plan-card-btn monthly-btn" onclick="handleUpgrade(this,'${p.id}')">Upgrade Plan</button>`
                }
            </div>
        `;
    });

    wrap.innerHTML = `
    ${statusBarHTML}
    <div style="font-size:0.72rem;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">
        ${currentPlanId && currentPlanId !== 'none' ? '🔄 Renew or Switch Plan' : '🚀 Select a Plan to Get Started'}
    </div>
    <div class="plan-cards-grid">
        ${cardsHTML}
    </div>`;
}

// Button handlers: add loading state and disable when active
function handleStartFree(btn) {
    if (!btn) return;
    btn.disabled = true; const prev = btn.innerText; btn.innerText = 'Processing...';
    activateFreePlan().finally(() => { btn.disabled = false; btn.innerText = prev; });
}

function handleUpgrade(btn, planId) {
    if (!btn) return;
    btn.disabled = true; const prev = btn.innerText; btn.innerText = 'Processing...';
    // Open checkout (keeps modal logic unchanged)
    setTimeout(() => {
        openPlanCheckoutModal(planId);
        btn.disabled = false; btn.innerText = prev;
    }, 300);
}

// ── Activate Free Plan ──
async function activateFreePlan() {
    if (!currentUser) return;

    // Check if already had a plan or used free trial
    const existingPlan = currentUser.plan || currentUser.subscriptionPlan;
    if (currentUser.freePlanUsed || existingPlan === 'free' || existingPlan === 'trial') {
        alert('You have already enjoyed the Free Trial! Please upgrade to a Premium plan to continue.');
        return;
    }
    if (existingPlan && existingPlan !== 'none') {
        if (!confirm('Warning: You are switching to a Free plan, which will replace your current plan. Proceed?')) return;
    }
    // If user is pending approval, only register a request for free plan (do not activate yet)
    if (currentUser.status === 'pending') {
        try {
            await db.collection('users').doc(currentUser.email).set({ requestedPlan: 'free' }, { merge: true });
            alert('✅ Your request for the Free Trial has been submitted. Waiting for admin approval.');
            // reflect locally
            currentUser.requestedPlan = 'free';
            saveCurrentUser();
            loadSubscriptionUI();
            return;
        } catch (err) {
            alert('Error requesting free plan: ' + err.message);
            console.error(err);
            return;
        }
    }

    // For approved users, activate immediately
    const now = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 30);

    const data = {
        plan:             'free',
        subscriptionPlan: 'free',
        planStart:        now.toISOString(),
        planEnd:          end.toISOString(),
        pricePaid:        0,
        freePlanUsed:     true,
        requestedPlan:    firebase.firestore.FieldValue.delete()
    };

    try {
        await db.collection('users').doc(currentUser.email).set(data, { merge: true });
        Object.assign(currentUser, data);
        alert('🎉 Welcome! Your Free Trial has started.\nExpires: ' + fmtDate(end.toISOString()));
        loadSubscriptionUI();
        if(document.getElementById('plan-section')) loadDashboard();
        // Remove expiry banner if showing
        document.getElementById('expiry-warning-banner')?.remove();
    } catch (err) {
        alert('Error activating free plan: ' + err.message);
        console.error(err);
    }
}

// ── Open Plan Checkout Modal ──
function openPlanCheckoutModal(planId) {
    const plan = activePlans.find(p => p.id === planId);
    if (!plan && planId !== 'monthly' && planId !== 'yearly') return;

    selectedPlanType  = planId;
    appliedCoupon     = null;
    
    // Support legacy and dynamic
    const pLabel = plan ? plan.name : (planId === 'yearly' ? 'Yearly' : 'Monthly');
    const pDays  = plan ? plan.durationDays : (planId === 'yearly' ? 365 : 30);
    checkoutBasePrice = plan ? plan.price : (planId === 'yearly' ? 999 : 1);

    document.getElementById('checkout-modal-title').innerText    = pLabel + ' Plan';
    document.getElementById('checkout-modal-subtitle').innerText = `${pDays} days access`;
    document.getElementById('checkout-base-price').innerText     = '₹' + checkoutBasePrice;
    document.getElementById('checkout-final-price').innerText    = '₹' + checkoutBasePrice;
    document.getElementById('plan-coupon-input').value           = '';
    document.getElementById('plan-coupon-status').innerHTML      = '';
    document.getElementById('checkout-discount-row').style.display = 'none';

    new bootstrap.Modal(document.getElementById('planCheckoutModal')).show();
}

// ── Validate and Apply Coupon ──
async function validatePlanCoupon() {
    const code = document.getElementById('plan-coupon-input').value.toUpperCase().trim();
    if (!code) return;

    const btn    = document.getElementById('plan-coupon-btn');
    const status = document.getElementById('plan-coupon-status');
    btn.disabled = true;
    status.innerHTML = '<span class="text-muted">Validating...</span>';

    try {
        const snap = await db.collection('coupons').where('code', '==', code).get();
        if (snap.empty) throw new Error('Invalid or expired coupon code.');

        const cpnDoc = snap.docs[0];
        const cpn    = cpnDoc.data();
        cpn.id       = cpnDoc.id;

        // Check expiry
        if (cpn.validTill && new Date(cpn.validTill) < new Date()) throw new Error('This coupon has expired.');

        // Check usage limit
        if (cpn.maxUsage && (cpn.usedCount || 0) >= cpn.maxUsage) throw new Error('Coupon usage limit reached.');

        appliedCoupon = cpn;
        updateCheckoutPrice();
        status.innerHTML = `<span class="text-success fw-bold"><i class="fas fa-check-circle me-1"></i>Coupon applied!</span>`;

    } catch (err) {
        appliedCoupon = null;
        updateCheckoutPrice();
        status.innerHTML = `<span class="text-danger"><i class="fas fa-times-circle me-1"></i>${err.message}</span>`;
    } finally {
        btn.disabled = false;
    }
}

// ── Update Checkout Price After Coupon ──
function updateCheckoutPrice() {
    let finalPrice = checkoutBasePrice;
    const discRow  = document.getElementById('checkout-discount-row');

    if (appliedCoupon) {
        let discount = 0;
        if (appliedCoupon.discountType === 'percent') {
            discount = checkoutBasePrice * (appliedCoupon.discountValue / 100);
        } else {
            discount = appliedCoupon.discountValue;
        }
        finalPrice = Math.max(0, checkoutBasePrice - discount);
        discRow.style.display = '';
        document.getElementById('checkout-discount-amt').innerText = '-₹' + discount.toFixed(2);
    } else {
        discRow.style.display = 'none';
    }

    document.getElementById('checkout-final-price').innerText = '₹' + finalPrice.toFixed(2);
}

// ── Init Razorpay Payment ──
function initPlanRazorpay() {
    const finalAmt = parseFloat(document.getElementById('checkout-final-price').innerText.replace('₹', ''));
    if (isNaN(finalAmt) || finalAmt < 1) {
        alert('Invalid amount. Please try again.');
        return;
    }

    const plan = activePlans.find(p => p.id === selectedPlanType);
    const pLabel = plan ? plan.name : (selectedPlanType === 'yearly' ? 'Yearly' : 'Monthly');
    const pDays  = plan ? plan.durationDays : (selectedPlanType === 'yearly' ? 365 : 30);

    const options = {
        key:         RAZORPAY_KEY_ID,
        amount:      Math.round(finalAmt * 100), // paise
        currency:    'INR',
        name:        currentUser.shop || 'ShopApp',
        description: `${pLabel} Plan — ${pDays} days`,
        image:       'https://cdn-icons-png.flaticon.com/512/3643/3643948.png',
        handler:     async function(response) {
            await handlePlanPaymentSuccess(response, finalAmt, pDays);
        },
        prefill: {
            name:    currentUser.name  || '',
            email:   currentUser.email || '',
            contact: currentUser.mobile || ''
        },
        notes: {
            userEmail: currentUser.email,
            planType:  selectedPlanType
        },
        theme: { color: '#4361ee' }
    };

    const rzp = new Razorpay(options);
    rzp.open();
}

// ── Handle Razorpay Payment Success ──
async function handlePlanPaymentSuccess(response, amountPaid, durationDays) {
    const today  = new Date();
    const newEnd = new Date();
    newEnd.setDate(today.getDate() + durationDays);

    const data = {
        plan:                 selectedPlanType,
        subscriptionPlan:     selectedPlanType,
        planStart:            today.toISOString(),
        planEnd:              newEnd.toISOString(),
        pricePaid:            amountPaid,
        amountPaid:           amountPaid,
        razorpay_payment_id:  response.razorpay_payment_id || '',
        updatedAt:            new Date().toISOString()
    };

    try {
        await db.collection('users').doc(currentUser.email).set(data, { merge: true });

        // Increment coupon usage
        if (appliedCoupon?.id) {
            await db.collection('coupons').doc(appliedCoupon.id).update({
                usedCount: firebase.firestore.FieldValue.increment(1)
            });
        }

        // Update local state
        Object.assign(currentUser, data);
        saveCurrentUser();
        appliedCoupon = null;

        // Close modal
        const modalEl   = document.getElementById('planCheckoutModal');
        const modalInst = bootstrap.Modal.getInstance(modalEl);
        if (modalInst) modalInst.hide();

        // Remove expiry banner
        document.getElementById('expiry-warning-banner')?.remove();
        document.getElementById('expired-overlay')?.classList.add('d-none');
        document.getElementById('app-section')?.classList.remove('d-none');

        const planName = PLAN_CONFIG[selectedPlanType]?.label || selectedPlanType;
        alert(`🎉 Payment Successful!\n${planName} Plan activated!\nExpires: ${fmtDate(newEnd.toISOString())}`);

        // Re-init listeners if they were removed
        initFirebaseListeners();
        renderPlanSection();

    } catch (err) {
        console.error('handlePlanPaymentSuccess:', err);
        alert('Payment was successful but account update failed.\nPayment ID: ' + (response.razorpay_payment_id || 'N/A') + '\nPlease contact support.');
    }
}

// ── openUpgradeUI (backward compat — used on expired overlay button) ──
function openUpgradeUI() {
    document.getElementById('expired-overlay').classList.add('d-none');
    document.getElementById('app-section').classList.remove('d-none');
}

// ── Guard: Billing / Udhaar restriction ──
function checkPlanAccess() {
    if (!currentUser) {
        alert("Please login first.");
        return false;
    }

    // Allow access ONLY when: status === "approved", plan exists, current date <= planEnd
    if (currentUser.status === 'approved') {
        const plan = currentUser.plan || currentUser.subscriptionPlan;
        const daysLeft = getDaysLeft(currentUser.planEnd);
        if (plan && plan !== 'none' && daysLeft !== null && daysLeft > 0) {
            return true;
        }
    }

    // For all other cases: return false, show message only, DO NOT redirect
    alert("Action restricted. Please wait for admin approval and ensure you have an active premium plan.");
    return false;
}

// Central check used across the app for gating features
function checkPlanRestrictions() {
    return checkPlanAccess();
}

// Backward compatible alias used in some places
function renderPlanSection() { loadSubscriptionUI(); }

// ── Patch "Add New Product" button to check plan ──
document.addEventListener('DOMContentLoaded', () => {
    // Guard add product modal
    const addProdBtn = document.querySelector('[data-bs-target="#addProductModal"]');
    if (addProdBtn) {
        addProdBtn.addEventListener('click', function(e) {
            if (!checkPlanAccess()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    }

    // Guard billing nav
    document.querySelectorAll('[data-target="billing"]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (!checkPlanAccess()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    });

    // Guard udhaar nav
    document.querySelectorAll('[data-target="udhaar"]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (!checkPlanAccess()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    });
});

// ── End of app.js ──

// ---------- Development helper: simulate signup -> request free -> admin approve (local simulation) ----------
async function runSignupApprovalSimulation() {
    // Create a test user object (simulate signup)
    const email = 'auto_test_user+' + Date.now() + '@local';
    const now = new Date();
    const userDoc = {
        email,
        name: 'Auto Test',
        shop: 'Auto Shop',
        mobile: '9999999999',
        password: 'test1234',
        status: 'pending',
        plan: 'none',
        subscriptionPlan: 'none',
        planStart: null,
        planEnd: null,
        createdAt: now.toISOString()
    };

    // Step 1: simulate saving user to Firestore (mock)
    // NOTE: This function runs locally and does not touch real Firestore unless you call the write lines below.
    console.log('Simulated signup user:', userDoc);

    // Step 2: user requests free trial
    userDoc.requestedPlan = 'free';
    // simulate pending state remains
    console.log('Simulated requested free trial:', { email: userDoc.email, status: userDoc.status, requestedPlan: userDoc.requestedPlan });

    // Step 3: simulate admin approval
    // If you want to perform real writes, uncomment the Firestore operations below. By default we only simulate.
    const approvedAt = new Date();
    const planStart = approvedAt.toISOString();
    const planEndDate = new Date(approvedAt);
    planEndDate.setDate(planEndDate.getDate() + 30);

    // Apply approval locally
    userDoc.status = 'approved';
    userDoc.plan = 'free';
    userDoc.subscriptionPlan = 'free';
    userDoc.planStart = planStart;
    userDoc.planEnd = planEndDate.toISOString();
    delete userDoc.requestedPlan;

    // If you want to write to Firestore (CAUTION: will modify your DB), you can run the following in browser console
    // db.collection('users').doc(userDoc.email).set(userDoc, { merge: true });

    console.log('Simulated final user doc (Firestore format):', userDoc);
    return userDoc;
}

