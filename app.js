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

// Real-time listeners
let productsUnsubscribe  = null;
let customersUnsubscribe = null;
let ordersUnsubscribe    = null;

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

    productsUnsubscribe = db.collection('products')
        .where('userId', '==', currentUser.email)
        .onSnapshot(snapshot => {
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const activeId = getActiveViewId();
            if (activeId === 'view-products') loadProducts();
            if (activeId === 'view-billing') { renderBillingGrid(); renderCart(); }
            checkAlerts();
        });

    customersUnsubscribe = db.collection('customers')
        .where('userId', '==', currentUser.email)
        .onSnapshot(snapshot => {
            customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (getActiveViewId() === 'view-udhaar') renderCustomers();
            checkAlerts();
        });

    ordersUnsubscribe = db.collection('orders')
        .where('userId', '==', currentUser.email)
        .onSnapshot(snapshot => {
            orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const activeId = getActiveViewId();
            if (activeId === 'view-dashboard') loadDashboard();
            if (activeId === 'view-analytics') loadAnalytics();
        });
}

function removeFirebaseListeners() {
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

        const userData = {
            name, shop, mobile, email, password,
            qrCode,
            createdAt: new Date().toISOString()
        };

        await db.collection('users').doc(email).set(userData);

        pendingSignupQRFile = null;
        document.getElementById('signup-qr-preview').classList.add('d-none');
        document.getElementById('signup-form').reset();
        alert("✅ Signup successful! Please login.");
        document.getElementById('show-login').click();

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
        if (email === 'admin@shop.com' && password === 'admin123') {
            window.location.href = 'admin.html';
            return;
        }
        // ────────────────────────────────────────────────────

        const doc = await db.collection('users').doc(email).get();
        if (doc.exists) {
            const fbUser = doc.data();

            // Block check
            if (fbUser.status === 'blocked') {
                alert('❌ Your account has been blocked. Please contact support.');
                return;
            }

            if (fbUser.password === password) {
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
    showAuth();
}

// ============================================================
// VIEW NAVIGATION
// ============================================================
function showAuth() {
    document.getElementById('auth-section').classList.remove('d-none');
    document.getElementById('app-section').classList.add('d-none');
}

function showApp() {
    document.getElementById('auth-section').classList.add('d-none');
    document.getElementById('app-section').classList.remove('d-none');
    document.getElementById('display-user-name').innerText = currentUser.name.split(' ')[0];
    document.getElementById('display-shop-name').innerText = currentUser.shop;
    loadDashboard();
    checkSubscription(); // ← expiry check on every login
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

    document.querySelectorAll('.bottom-nav-item[data-target]').forEach(b =>
        b.classList.toggle('active', b.getAttribute('data-target') === target));

    if (target === 'dashboard') loadDashboard();
    else if (target === 'products') loadProducts();
    else if (target === 'billing')  loadBilling();
    else if (target === 'analytics') loadAnalytics();
    else if (target === 'profile')  loadProfile();
    else if (target === 'udhaar')   renderCustomers();
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

    // Mobile logout
    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', () => {
            if (confirm('Logout karna chahte hain?')) doLogout();
        });
    }

    // Search / filter listeners
    document.getElementById('billing-search').addEventListener('input', e => renderBillingGrid(e.target.value));
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

        await db.collection('products').add({
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
        db.collection('products').doc(id).delete().catch(err => alert("Error: " + err.message));
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

        await db.collection('products').doc(id).update(updatedFields);
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

        await db.collection('products').doc(id).update({ batches });

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
function loadBilling() { renderBillingGrid(); renderCart(); }

function renderBillingGrid(search = '') {
    const grid = document.getElementById('billing-products-grid');
    grid.innerHTML = '';

    const keywords = search.toLowerCase().split(/\s+/).filter(k => k.length > 0);
    const filtered = products.filter(p => {
        if (keywords.length === 0) return true;
        return keywords.every(kw =>
            p.name.toLowerCase().includes(kw) ||
            (p.rack  && p.rack.toLowerCase().includes(kw)) ||
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

        card.innerHTML = `
            ${imgHTML}
            <div class="fw-semibold mb-1">${p.name}</div>
            <div class="price">₹${parseFloat(p.selling_price).toFixed(2)}</div>
            <div class="small ${stock < 5 ? 'text-danger fw-bold' : 'text-success'} mt-1">${stock} ${t('in_stock') || 'in stock'}</div>
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
    let orderTotalProfit  = 0;
    let orderTotalRevenue = 0;
    let orderItems        = [];
    let receiptItemsHTML  = '';
    const customerMobile  = document.getElementById('customer-mobile').value.trim();
    const customerName    = document.getElementById('customer-name').value.trim();

    // FIFO stock deduction & build order items
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

        // FIFO
        const batches = [...product.batches].sort((a, b) => {
            const dA = a.expiry ? new Date(a.expiry) : new Date('9999-12-31');
            const dB = b.expiry ? new Date(b.expiry) : new Date('9999-12-31');
            return dA - dB;
        });
        let remaining = cartItem.qty;
        for (let i = 0; i < batches.length; i++) {
            if (remaining <= 0) break;
            if (batches[i].qty >= remaining) { batches[i].qty -= remaining; remaining = 0; }
            else { remaining -= batches[i].qty; batches[i].qty = 0; }
        }
        const updatedBatches = batches.filter(b => b.qty > 0);
        batchUpdates.push({ id: cartItem.id, batches: updatedBatches });
    });

    try {
        // Update batches in Firestore
        await Promise.all(batchUpdates.map(u =>
            db.collection('products').doc(u.id).update({ batches: u.batches })
        ));

        // Save order
        await db.collection('orders').add({
            userId:        currentUser.email,
            date:          new Date().toISOString(),
            items:         orderItems,
            totalRevenue:  orderTotalRevenue,
            totalProfit:   orderTotalProfit,
            paymentMethod: selectedPaymentMethod,
            customerName:  customerName || null,
            customerMobile: customerMobile || null
        });

        // Udhaar handling
        if (selectedPaymentMethod === 'udhaar') {
            const now = new Date().toISOString();
            const acc = customers.find(a => a.mobile === customerMobile);
            if (!acc) {
                await db.collection('customers').add({
                    userId: currentUser.email,
                    mobile: customerMobile,
                    customerName: customerName,
                    total_due: orderTotalRevenue,
                    lastPaymentDate: null,
                    history: [{ date: now, amount: orderTotalRevenue, type: 'debt' }]
                });
            } else {
                await db.collection('customers').doc(acc.id).update({
                    customerName: customerName,
                    total_due: firebase.firestore.FieldValue.increment(orderTotalRevenue),
                    history: firebase.firestore.FieldValue.arrayUnion({ date: now, amount: orderTotalRevenue, type: 'debt' })
                });
            }
        }

    } catch (err) {
        alert("Checkout error: " + err.message);
        console.error(err);
        return;
    }

    // Prepare receipt
    document.getElementById('receipt-shop-name').innerText = currentUser.shop;
    document.getElementById('receipt-items').innerHTML     = receiptItemsHTML;
    document.getElementById('receipt-total').innerText     = orderTotalRevenue.toFixed(2);

    window.latestOrderData = { mobile: customerMobile, total: orderTotalRevenue };

    // Reset cart & payment state
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

    // Always render subscription UI with latest data
    loadSubscriptionUI();
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

        await db.collection('customers').doc(acc.id).update({
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
// SUBSCRIPTION SYSTEM
// ============================================================

const PLANS = {
    monthly: { label: 'Monthly', price: 99,  days: 30  },
    yearly:  { label: 'Yearly',  price: 999, days: 365 }
};

function getDaysLeft(planEnd) {
    if (!planEnd) return null;
    return Math.ceil((new Date(planEnd) - new Date()) / (1000 * 60 * 60 * 24));
}

async function checkSubscription() {
    try {
        const doc = await db.collection('users').doc(currentUser.email).get();
        if (!doc.exists) return;
        const data = doc.data();
        currentUser.subscriptionPlan = data.subscriptionPlan || 'free';
        currentUser.planStart        = data.planStart || null;
        currentUser.planEnd          = data.planEnd   || null;
        currentUser.pricePaid        = data.pricePaid || 0;
        saveCurrentUser();

        const daysLeft = getDaysLeft(data.planEnd);
        const plan     = data.subscriptionPlan;
        if (plan && plan !== 'free' && data.planEnd) {
            if (daysLeft !== null && daysLeft <= 0)  showExpiredOverlay(plan);
            else if (daysLeft !== null && daysLeft <= 2) showExpiryBanner(daysLeft);
        }
    } catch (err) { console.error('checkSubscription:', err); }
}

function showExpiredOverlay(planName) {
    document.getElementById('sub-expired-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'sub-expired-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = '<div style="background:#1a1d27;border:1px solid #ff4d6d;border-radius:20px;max-width:400px;width:100%;padding:36px 28px;text-align:center;">'
        + '<div style="font-size:3rem;margin-bottom:14px;">&#x23F0;</div>'
        + '<h4 style="color:#ff4d6d;font-weight:800;margin-bottom:8px;">Plan Expired</h4>'
        + '<p style="color:#8b90b0;font-size:0.9rem;margin-bottom:24px;">Your <strong style="color:#eef0fb;">' + planName + '</strong> plan has expired. Renew to continue.</p>'
        + '<button onclick="navigateTo(\'profile\');document.getElementById(\'sub-expired-overlay\').remove();" style="background:linear-gradient(135deg,#6c63ff,#a78bfa);color:#fff;border:none;border-radius:12px;padding:14px 24px;font-size:0.95rem;font-weight:700;cursor:pointer;width:100%;margin-bottom:10px;">&#x1F504; Renew Plan</button>'
        + '<button onclick="document.getElementById(\'sub-expired-overlay\').remove();" style="background:rgba(139,144,176,0.1);color:#8b90b0;border:1px solid #2e3250;border-radius:12px;padding:10px;font-size:0.82rem;cursor:pointer;width:100%;">Continue (Limited)</button>'
        + '</div>';
    document.body.appendChild(ov);
}

function showExpiryBanner(daysLeft) {
    if (document.getElementById('expiry-warning-banner')) return;
    const b = document.createElement('div');
    b.id = 'expiry-warning-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:5000;background:linear-gradient(90deg,#ff4d6d,#ff7b6b);color:#fff;text-align:center;padding:10px 20px;font-size:0.87rem;font-weight:600;font-family:Outfit,sans-serif;display:flex;align-items:center;justify-content:center;gap:12px;';
    b.innerHTML = '<span>&#9888;&#65039; Plan expires in <strong>' + daysLeft + ' day' + (daysLeft!==1?'s':'') + '</strong>. Renew!</span>'
        + '<button onclick="navigateTo(\'profile\')" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:8px;padding:4px 14px;font-size:0.82rem;cursor:pointer;font-weight:700;">Renew</button>'
        + '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:1.1rem;cursor:pointer;">&#x2715;</button>';
    document.body.prepend(b);
}

async function buyPlan(planType) {
    const plan = PLANS[planType];
    if (!plan) return;
    if (!confirm('Activate ' + plan.label + ' Plan for \u20B9' + plan.price + '?\n(' + plan.days + ' days access)')) return;

    const now = new Date(), end = new Date();
    end.setDate(end.getDate() + plan.days);

    const data = {
        subscriptionPlan: planType,
        planStart: now.toISOString(),
        planEnd:   end.toISOString(),
        pricePaid: plan.price
    };

    try {
        await db.collection('users').doc(currentUser.email).set(data, { merge: true });
        Object.assign(currentUser, data);
        saveCurrentUser();
        document.getElementById('expiry-warning-banner')?.remove();
        document.getElementById('sub-expired-overlay')?.remove();
        loadSubscriptionUI();
        alert('\u2705 ' + plan.label + ' Plan activated!\nExpires: ' + end.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}));
    } catch (err) {
        console.error('buyPlan:', err);
        alert('Activation failed: ' + err.message);
    }
}

async function activateTrial(email) {
    const now = new Date(), end = new Date();
    end.setDate(end.getDate() + 30);
    await db.collection('users').doc(email).set({
        subscriptionPlan:'trial', planStart:now.toISOString(), planEnd:end.toISOString(), pricePaid:0
    }, { merge: true });
}

function loadSubscriptionUI() {
    const wrap = document.getElementById('subscription-ui-wrap');
    if (!wrap) return;

    const plan     = currentUser.subscriptionPlan || 'free';
    const daysLeft = getDaysLeft(currentUser.planEnd);
    const fmt      = function(iso){ return iso ? new Date(iso).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '\u2014'; };

    var expStyle, expText;
    if (!currentUser.planEnd || plan === 'free') { expStyle='background:rgba(139,144,176,0.15);color:#8b90b0;'; expText='FREE'; }
    else if (daysLeft <= 0)  { expStyle='background:rgba(255,77,109,0.15);color:#ff4d6d;';  expText='EXPIRED'; }
    else if (daysLeft <= 2)  { expStyle='background:rgba(255,77,109,0.12);color:#ff4d6d;';  expText=daysLeft+'d left'; }
    else if (daysLeft <= 7)  { expStyle='background:rgba(255,209,102,0.15);color:#ffd166;'; expText=daysLeft+' days left'; }
    else                     { expStyle='background:rgba(0,208,132,0.12);color:#00d084;';   expText=daysLeft+' days left'; }

    var rows = [['Plan',plan.charAt(0).toUpperCase()+plan.slice(1)],['Paid','\u20B9'+(currentUser.pricePaid||0)],['Started',fmt(currentUser.planStart)],['Expires',fmt(currentUser.planEnd)]];
    var grid = rows.map(function(r){ return '<div style="background:rgba(0,0,0,0.2);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:0.68rem;color:#8b90b0;margin-bottom:3px;text-transform:uppercase;letter-spacing:1px;">'+r[0]+'</div><div style="font-weight:700;font-size:0.87rem;">'+r[1]+'</div></div>'; }).join('');

    wrap.innerHTML = '<div style="background:rgba(108,99,255,0.06);border:1px solid rgba(108,99,255,0.18);border-radius:16px;padding:20px;margin-bottom:16px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'
        + '<span style="font-weight:700;font-size:0.95rem;">&#x1F4CB; Subscription</span>'
        + '<span style="padding:4px 12px;border-radius:20px;font-size:0.72rem;font-weight:700;'+expStyle+'">'+expText+'</span>'
        + '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+grid+'</div></div>'
        + '<div style="font-size:0.72rem;font-weight:700;letter-spacing:1px;color:#8b90b0;text-transform:uppercase;margin-bottom:10px;">Choose a Plan</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + '<div onclick="buyPlan(\'monthly\')" style="border:2px solid '+(plan==='monthly'?'#6c63ff':'rgba(46,50,80,0.8)')+';border-radius:14px;padding:18px;background:'+(plan==='monthly'?'rgba(108,99,255,0.1)':'transparent')+';cursor:pointer;">'
        + '<div style="font-size:1.5rem;margin-bottom:8px;">&#x1F4C5;</div><div style="font-weight:700;margin-bottom:4px;">Monthly</div>'
        + '<div style="font-size:1.5rem;font-weight:800;color:#6c63ff;margin-bottom:4px;">\u20B999</div>'
        + '<div style="font-size:0.72rem;color:#8b90b0;">30 days</div>'
        + (plan==='monthly'?'<div style="margin-top:8px;color:#6c63ff;font-size:0.72rem;font-weight:700;">\u2713 ACTIVE</div>':'')
        + '</div>'
        + '<div onclick="buyPlan(\'yearly\')" style="border:2px solid '+(plan==='yearly'?'#ffd166':'rgba(255,209,102,0.25)')+';border-radius:14px;padding:18px;background:'+(plan==='yearly'?'rgba(255,209,102,0.07)':'rgba(255,209,102,0.02)')+';cursor:pointer;position:relative;">'
        + '<div style="position:absolute;top:-10px;right:10px;background:#ffd166;color:#1a1d27;font-size:0.62rem;font-weight:800;padding:2px 10px;border-radius:20px;">SAVE 20%</div>'
        + '<div style="font-size:1.5rem;margin-bottom:8px;">&#x1F451;</div><div style="font-weight:700;margin-bottom:4px;">Yearly</div>'
        + '<div style="font-size:1.5rem;font-weight:800;color:#ffd166;margin-bottom:4px;">\u20B9999</div>'
        + '<div style="font-size:0.72rem;color:#8b90b0;">365 days</div>'
        + (plan==='yearly'?'<div style="margin-top:8px;color:#ffd166;font-size:0.72rem;font-weight:700;">\u2713 ACTIVE</div>':'')
        + '</div></div>';
}
