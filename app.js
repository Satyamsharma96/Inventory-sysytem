// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBMKl0ioeR2-2BqtTveHe4TYT3Qoam_09A",
    authDomain: "inventoryapp-3fd49.firebaseapp.com",
    projectId: "inventoryapp-3fd49",
    storageBucket: "inventoryapp-3fd49.firebasestorage.app",
    messagingSenderId: "810298304296",
    appId: "1:810298304296:web:720e7ca0f4f048b4f4d21d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firestore DB
const db = firebase.firestore();


// Data Initialization
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let users = JSON.parse(localStorage.getItem('users')) || [];

let products = [];
let orders = [];
let customers = [];
let cart = [];

function saveUsers() { localStorage.setItem('users', JSON.stringify(users)); }
function saveCurrentUser() { localStorage.setItem('currentUser', JSON.stringify(currentUser)); }

function getProductStock(product) {
    if (!product.batches) return 0;
    return product.batches.reduce((sum, b) => sum + parseInt(b.qty), 0);
}

// Real-time snapshot listeners
let productsUnsubscribe = null;
let customersUnsubscribe = null;
let ordersUnsubscribe = null;

function initFirebaseListeners() {
    if (!currentUser) return;
    productsUnsubscribe = db.collection('products').where('userId', '==', currentUser.email).onSnapshot(snapshot => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeView = document.querySelector('.app-view:not(.d-none)');
        if (activeView && activeView.id === 'view-products') loadProducts();
        if (activeView && activeView.id === 'view-billing') { renderBillingGrid(); renderCart(); }
        checkAlerts();
    });

    customersUnsubscribe = db.collection('customers').where('userId', '==', currentUser.email).onSnapshot(snapshot => {
        customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeView = document.querySelector('.app-view:not(.d-none)');
        if (activeView && activeView.id === 'view-udhaar') renderCustomers();
        checkAlerts();
    });

    ordersUnsubscribe = db.collection('orders').where('userId', '==', currentUser.email).onSnapshot(snapshot => {
        orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeView = document.querySelector('.app-view:not(.d-none)');
        if (activeView && activeView.id === 'view-dashboard') loadDashboard();
        if (activeView && activeView.id === 'view-analytics') loadAnalytics();
    });
}

function removeFirebaseListeners() {
    if (productsUnsubscribe) productsUnsubscribe();
    if (customersUnsubscribe) customersUnsubscribe();
    if (ordersUnsubscribe) ordersUnsubscribe();
}

// Chart Instances
let pieChart = null;
let barChart = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    applyLanguage();
    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            currentLang = currentLang === 'en' ? 'hi' : 'en';
            localStorage.setItem('appLang', currentLang);
            applyLanguage();
            if (currentUser) {
                // Refresh dynamically drawn views
                const activeView = document.querySelector('.app-view:not(.d-none)').id;
                if (activeView === 'view-dashboard') loadDashboard();
                if (activeView === 'view-products') loadProducts();
                if (activeView === 'view-billing') loadBilling();
                if (activeView === 'view-analytics') loadAnalytics();
            }
        });
    });

    if (users.length === 0) {
        users.push({
            name: "Admin User",
            shop: "SuperMart",
            mobile: "9876543210",
            email: "admin@shop.com",
            password: "password123"
        });
        saveUsers();
    }
    if (currentUser) { showApp(); initFirebaseListeners(); }
    else showAuth();

    attachEventListeners();
});

// Auth Logic
document.getElementById('show-signup').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-card').classList.add('d-none'); document.getElementById('signup-card').classList.remove('d-none'); });
document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signup-card').classList.add('d-none'); document.getElementById('login-card').classList.remove('d-none'); });

let pendingSignupQR = null;
document.getElementById('signup-qr').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            pendingSignupQR = event.target.result;
            const preview = document.getElementById('signup-qr-preview');
            preview.src = pendingSignupQR;
            preview.classList.remove('d-none');
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const shop = document.getElementById('signup-shop').value;
    const mobile = document.getElementById('signup-mobile').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    if (users.find(u => u.email === email)) { alert("Email already registered!"); return; }
    users.push({ name, shop, mobile, email, password, qrCode: pendingSignupQR });
    saveUsers();
    alert("Signup successful! Please login.");
    document.getElementById('show-login').click();
});

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const user = users.find(u => u.email === email && u.password === password);
    if (user) { currentUser = user; saveCurrentUser(); showApp(); initFirebaseListeners(); }
    else alert("Invalid email or password!");
});

document.getElementById('logout-btn').addEventListener('click', () => {
    currentUser = null; saveCurrentUser(); removeFirebaseListeners(); showAuth();
});

// View Navigation
function showAuth() { document.getElementById('auth-section').classList.remove('d-none'); document.getElementById('app-section').classList.add('d-none'); }
function showApp() {
    document.getElementById('auth-section').classList.add('d-none');
    document.getElementById('app-section').classList.remove('d-none');
    document.getElementById('display-user-name').innerText = currentUser.name.split(' ')[0];
    document.getElementById('display-shop-name').innerText = currentUser.shop;
    loadDashboard();
}

function attachEventListeners() {
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const target = link.getAttribute('data-target');
            document.querySelectorAll('.app-view').forEach(v => v.classList.add('d-none'));

            const titles = { dashboard: 'Dashboard', products: 'Products Inventory', billing: 'Point of Sale', analytics: 'Data Analytics', profile: 'Profile Settings', udhaar: 'Udhaar Ledger' };
            document.getElementById('page-title').innerText = titles[target];
            if (document.getElementById('view-' + target)) {
                document.getElementById('view-' + target).classList.remove('d-none');
            }

            if (target === 'dashboard') loadDashboard();
            else if (target === 'products') loadProducts();
            else if (target === 'billing') loadBilling();
            else if (target === 'analytics') loadAnalytics();
            else if (target === 'profile') loadProfile();
            else if (target === 'udhaar') renderCustomers();
        });
    });

    document.getElementById('billing-search').addEventListener('input', (e) => renderBillingGrid(e.target.value));
    document.getElementById('inventory-search').addEventListener('input', loadProducts);
    const rackFilter = document.getElementById('rack-filter');
    if (rackFilter) rackFilter.addEventListener('change', loadProducts);

    const uSearch = document.getElementById('udhaar-search');
    if (uSearch) uSearch.addEventListener('input', renderCustomers);
}

// ----------------------------------------------------
// DASHBOARD & ALERTS
// ----------------------------------------------------
function loadDashboard() {
    let totalSales = 0;
    let totalProfit = 0;
    let productCounts = {};

    orders.forEach(order => {
        totalSales += order.totalRevenue;
        totalProfit += order.totalProfit;
        order.items.forEach(item => {
            productCounts[item.productId] = (productCounts[item.productId] || 0) + item.qty;
        });
    });

    let topProductId = null;
    let maxNum = 0;
    for (let pid in productCounts) {
        if (productCounts[pid] > maxNum) { maxNum = productCounts[pid]; topProductId = pid; }
    }

    let topProdName = t('no_data');
    if (topProductId) {
        let p = products.find(prod => prod.id == topProductId);
        if (p) topProdName = p.name;
    }

    document.getElementById('stat-sales').innerText = totalSales.toFixed(2);
    document.getElementById('stat-profit').innerText = totalProfit.toFixed(2);
    document.getElementById('stat-top-product').innerText = topProdName;
    document.getElementById('stat-total-products').innerText = products.length;

    checkAlerts();
}

function checkAlerts() {
    const lowStockList = document.getElementById('low-stock-list');
    const expiryList = document.getElementById('expiry-alert-list');
    lowStockList.innerHTML = '';
    expiryList.innerHTML = '';

    let lowStockCount = 0;
    let expiryCount = 0;

    let today = new Date();
    let threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    products.forEach(p => {
        let stock = getProductStock(p);

        // Low Stock Rule: < 5
        if (stock < 5) {
            lowStockCount++;
            lowStockList.innerHTML += `<li class="list-group-item d-flex justify-content-between px-0">
                <span>${p.name}</span>
                <span class="badge bg-danger rounded-pill">${stock} ${t('left_stock')}</span>
            </li>`;
        }

        // Expiry Rule: <= 3 days
        if (p.batches) {
            p.batches.forEach(b => {
                let exp = new Date(b.expiry);
                if (exp <= threeDaysFromNow && b.qty > 0) {
                    expiryCount++;
                    let diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                    let dayText = diffDays < 0 ? t('expired') : (diffDays === 0 ? t('today') : t('in_days', { x: diffDays }));
                    expiryList.innerHTML += `<li class="list-group-item d-flex justify-content-between px-0">
                        <span>${p.name} (Qty: ${b.qty})</span>
                        <span class="badge bg-warning text-dark rounded-pill">${dayText}</span>
                    </li>`;
                }
            });
        }
    });

    if (lowStockCount === 0) lowStockList.innerHTML = `<li class="list-group-item text-muted text-center border-0">${t('all_good') || 'All good!'}</li>`;
    if (expiryCount === 0) expiryList.innerHTML = `<li class="list-group-item text-muted text-center border-0">${t('no_items_expiring') || 'No items expiring soon'}</li>`;

    const udhaarList = document.getElementById('udhaar-reminder-list');
    if (udhaarList) {
        udhaarList.innerHTML = '';
        let udhaarAlerts = 0;

        customers.forEach(acc => {
            if (((acc.total_due !== undefined) ? acc.total_due : acc.totalDue) > 0) {
                udhaarAlerts++;
                let daysText = t('never_paid');
                if (acc.lastPaymentDate) {
                    let diff = Math.floor((new Date() - new Date(acc.lastPaymentDate)) / (1000 * 60 * 60 * 24));
                    daysText = diff === 0 ? t('today_paid') : t('days_since', { days: diff });
                }
                udhaarList.innerHTML += `<li class="list-group-item d-flex flex-column px-0 justify-content-center border-bottom-0">
                    <div class="d-flex justify-content-between text-danger fw-bold">
                        <span>${acc.customerName} ka ₹${((acc.total_due !== undefined) ? acc.total_due : acc.totalDue).toFixed(2)} pending hai</span>
                    </div>
                    <small class="text-muted"><i class="fas fa-history"></i> ${daysText}</small>
                </li>`;
            } else if (((acc.total_due !== undefined) ? acc.total_due : acc.totalDue) === 0 && acc.history.length > 0) {
                udhaarAlerts++;
                udhaarList.innerHTML += `<li class="list-group-item px-0 text-success fw-bold border-bottom-0">
                    <i class="fas fa-check-circle"></i> All dues cleared for ${acc.customerName}
                </li>`;
            }
        });
        if (udhaarAlerts === 0) udhaarList.innerHTML = `<li class="list-group-item text-muted text-center border-0">${t('no_data')}</li>`;
    }
}

// ----------------------------------------------------
// PRODUCT MANAGEMENT
// ----------------------------------------------------
function loadProducts() {
    const searchInput = document.getElementById('inventory-search');
    const rackInput = document.getElementById('rack-filter');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
    const rackQuery = rackInput ? rackInput.value : 'all';

    const tbody = document.getElementById('product-list-body');
    tbody.innerHTML = '';

    if (rackInput) {
        const existingRacks = Array.from(new Set(products.map(p => p.rack ? p.rack.trim() : '').filter(r => r !== '')));
        rackInput.innerHTML = `<option value="all" data-i18n="all_racks">${t('all_racks') || 'All Racks'}</option>`;
        existingRacks.forEach(r => {
            const selected = (rackQuery === r) ? 'selected' : '';
            rackInput.innerHTML += `<option value="${r}" ${selected}>${r}</option>`;
        });
    }

    const filtered = products.filter(p => {
        let matchRack = (rackQuery === 'all') || (p.rack && p.rack.trim() === rackQuery);
        if (!searchQuery) return matchRack;

        const keywords = searchQuery.split(/\s+/).filter(k => k.length > 0);
        let matchText = keywords.every(kw => {
            return (
                p.name.toLowerCase().includes(kw) ||
                (p.purchase_price && p.purchase_price.toString().includes(kw)) ||
                (p.selling_price && p.selling_price.toString().includes(kw)) ||
                (p.rack && p.rack.toLowerCase().includes(kw)) ||
                (p.side && p.side.toLowerCase().includes(kw)) ||
                (p.shelf && p.shelf.toLowerCase().includes(kw))
            );
        });

        return matchText && matchRack;
    });

    filtered.forEach(p => {
        const stock = getProductStock(p);
        let locHTML = '';
        if (p.rack || p.side || p.shelf) {
            locHTML = `<br><small class="text-muted"><i class="fas fa-map-marker-alt"></i> ${t('location_txt')}: ${p.rack || ''} ${p.side ? '- ' + t(p.side.toLowerCase()) : ''} ${p.shelf ? '- ' + t(p.shelf.toLowerCase()) : ''}</small>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="fw-semibold">${p.name}</div>${locHTML}</td>
            <td>
                <small class="text-muted d-block">P: ₹${parseFloat(p.purchase_price).toFixed(2)}</small>
                <div class="fw-bold">S: ₹${parseFloat(p.selling_price).toFixed(2)}</div>
            </td>
            <td>
                <span class="badge ${stock < 5 ? (stock === 0 ? 'bg-danger' : 'bg-warning text-dark') : 'bg-success'} rounded-pill px-3 py-2">
                    ${stock} ${t('units')}
                </span>
            </td>
            <td>
                <small class="text-muted">${(p.batches || []).length} ${t('batch_text')}</small>
            </td>
            <td class="text-end text-nowrap">
                <button class="btn btn-secondary btn-quick-action ms-1" onclick="openEditProduct('${p.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-primary btn-quick-action ms-1" onclick="openQuickAddBatch('${p.id}', '${p.name.replace("'", "\'")}')" title="Add Stock"><i class="fas fa-plus"></i></button>
                <button class="btn btn-warning btn-quick-action ms-1" onclick="quickReduceStock('${p.id}')" title="Reduce Stock"><i class="fas fa-minus"></i></button>
                <button class="btn btn-light text-danger btn-quick-action ms-2" onclick="deleteProduct('${p.id}')" title="Delete Product"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('add-product-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('prd-name').value;
    const pPrice = parseFloat(document.getElementById('prd-purchase').value);
    const sPrice = parseFloat(document.getElementById('prd-selling').value);
    const rack = document.getElementById('prd-rack').value;
    const side = document.getElementById('prd-side').value;
    const shelf = document.getElementById('prd-shelf').value;

    db.collection('products').add({
        userId: currentUser.email,
        name,
        purchase_price: pPrice,
        selling_price: sPrice,
        rack,
        side,
        shelf,
        batches: []
    }).then(() => {
        bootstrap.Modal.getInstance(document.getElementById('addProductModal')).hide();
        document.getElementById('add-product-form').reset();
    }).catch(err => {
        alert("Error adding product: " + err.message);
    });
});

function deleteProduct(id) {
    if (confirm("Are you sure you want to delete this product?")) {
        db.collection('products').doc(id).delete();
    }
}


function openEditProduct(id) {
    const product = products.find(p => String(p.id) === String(id));
    if (!product) return;
    document.getElementById('edit-prd-id').value = id;
    document.getElementById('edit-prd-name').value = product.name;
    document.getElementById('edit-prd-purchase').value = product.purchase_price;
    document.getElementById('edit-prd-selling').value = product.selling_price;
    document.getElementById('edit-prd-rack').value = product.rack || '';
    document.getElementById('edit-prd-side').value = product.side || '';
    document.getElementById('edit-prd-shelf').value = product.shelf || '';
    new bootstrap.Modal(document.getElementById('editProductModal')).show();
}

document.getElementById('edit-product-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-prd-id').value;
    const product = products.find(p => p.id === id);
    if (product) {
        product.name = document.getElementById('edit-prd-name').value;
        product.purchase_price = parseFloat(document.getElementById('edit-prd-purchase').value);
        product.selling_price = parseFloat(document.getElementById('edit-prd-selling').value);
        product.rack = document.getElementById('edit-prd-rack').value;
        product.side = document.getElementById('edit-prd-side').value;
        product.shelf = document.getElementById('edit-prd-shelf').value;
        bootstrap.Modal.getInstance(document.getElementById('editProductModal')).hide();
        loadProducts();
    }
});

// ----------------------------------------------------
// BATCH: EASY ENTRY / REDUCE LOGIC
// ----------------------------------------------------
function openQuickAddBatch(id, name) {
    document.getElementById('add-stock-name').innerText = name;
    document.getElementById('quick-stock-id').value = id;
    new bootstrap.Modal(document.getElementById('addBatchModal')).show();
}

document.getElementById('quick-add-batch-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('quick-stock-id').value;
    const qty = parseInt(document.getElementById('quick-qty').value);
    const expiry = document.getElementById('quick-expiry').value;

    const product = products.find(p => p.id === id);
    if (!product.batches) product.batches = [];
    product.batches.push({ qty, expiry });

    db.collection('products').doc(id).update({ batches: product.batches }).then(() => {
        bootstrap.Modal.getInstance(document.getElementById('addBatchModal')).hide();
        document.getElementById('quick-add-batch-form').reset();
    }).catch(err => {
        alert("Error updating stock: " + err.message);
    });
});

function quickReduceStock(id) {
    const product = products.find(p => String(p.id) === String(id));
    let stock = getProductStock(product);
    if (stock <= 0) { alert("No stock available to reduce!"); return; }

    let reduceAmt = parseInt(prompt(`How many units of ${product.name} to discard/reduce?`));
    if (isNaN(reduceAmt) || reduceAmt <= 0) return;
    if (reduceAmt > stock) { alert("Can't reduce more than available stock!"); return; }

    // FIFO Deduct without recording an order (since it's a discard/correction)
    product.batches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    let remainingToDeduct = reduceAmt;
    for (let i = 0; i < product.batches.length; i++) {
        if (remainingToDeduct <= 0) break;
        let batch = product.batches[i];
        if (batch.qty >= remainingToDeduct) {
            batch.qty -= remainingToDeduct;
            remainingToDeduct = 0;
        } else {
            remainingToDeduct -= batch.qty;
            batch.qty = 0;
        }
    }
    product.batches = product.batches.filter(b => b.qty > 0);
    db.collection('products').doc(id).update({ batches: product.batches });
}

// ----------------------------------------------------
// BILLING LOGIC
// ----------------------------------------------------
function loadBilling() { renderBillingGrid(); renderCart(); }

function renderBillingGrid(search = '') {
    const grid = document.getElementById('billing-products-grid');
    grid.innerHTML = '';

    const keywords = search.toLowerCase().split(/\s+/).filter(k => k.length > 0);
    const filtered = products.filter(p => {
        if (keywords.length === 0) return true;
        return keywords.every(kw => {
            return (
                p.name.toLowerCase().includes(kw) ||
                (p.purchase_price && p.purchase_price.toString().includes(kw)) ||
                (p.selling_price && p.selling_price.toString().includes(kw)) ||
                (p.rack && p.rack.toLowerCase().includes(kw)) ||
                (p.side && p.side.toLowerCase().includes(kw)) ||
                (p.shelf && p.shelf.toLowerCase().includes(kw))
            );
        });
    });

    filtered.forEach(p => {
        const stock = getProductStock(p);
        const card = document.createElement('div');
        card.className = `product-item-card ${stock === 0 ? 'opacity-50' : ''}`;
        card.onclick = () => { if (stock > 0) addToCart(p); };
        card.innerHTML = `
            <div class="fw-semibold mb-2">${p.name}</div>
            <div class="price">₹${parseFloat(p.selling_price).toFixed(2)}</div>
            <div class="small ${stock < 5 ? 'text-danger fw-bold' : 'text-success'} mt-2">${stock} ${t('in_stock')}</div>
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
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    else if (item.qty > maxStock) { item.qty = maxStock; alert('Limit reached!'); }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    container.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        container.innerHTML = `<div class="text-center text-muted mt-5"><i class="fas fa-shopping-cart fs-1 mb-3 opacity-25"></i><p>${t('cart_empty')}</p></div>`;
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
                <div class="fw-bold text-end" style="min-width: 60px;">₹${itemTotal.toFixed(2)}</div>
            `;
            container.appendChild(div);
        });
    }
    document.getElementById('cart-subtotal').innerText = total.toFixed(2);
    document.getElementById('cart-total').innerText = total.toFixed(2);

    // Auto update QR if open
    if (document.getElementById('qr-amount')) document.getElementById('qr-amount').innerText = total.toFixed(2);
}

// Payment Selection
let selectedPaymentMethod = null;
document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.payment-btn').forEach(b => {
            b.classList.remove('btn-success', 'btn-primary');
            b.classList.add('btn-outline-success', 'btn-outline-primary');
        });
        btn.classList.remove('btn-outline-success', 'btn-outline-primary');
        if (btn.dataset.method === 'cash') btn.classList.add('btn-success');
        if (btn.dataset.method === 'online') btn.classList.add('btn-primary');
        selectedPaymentMethod = btn.dataset.method;
    });
});

document.getElementById('checkout-btn').addEventListener('click', () => {
    if (!selectedPaymentMethod) { alert("Please select a payment method."); return; }

    if (selectedPaymentMethod === 'udhaar') {
        const cmobile = document.getElementById('customer-mobile').value.trim();
        const cname = document.getElementById('customer-name').value.trim();
        if (!cmobile || !cname) { alert(t('select_cust_first')); return; }
    }

    if (selectedPaymentMethod === 'online') {
        document.getElementById('qr-image').src = currentUser.qrCode || 'qr_placeholder.png';
        new bootstrap.Modal(document.getElementById('paymentModal')).show();
    }
    else processCheckout();
});

document.getElementById('confirm-online-payment').addEventListener('click', () => processCheckout());

function processCheckout() {
    let orderTotalProfit = 0;
    let orderTotalRevenue = 0;
    let orderItems = [];
    let receiptItemsHTML = '';
    let customerMobile = document.getElementById('customer-mobile').value;

    // Reduce stock from batches (FIFO)
    cart.forEach(cartItem => {
        const product = products.find(p => p.id === cartItem.id);
        if (!product || !product.batches) return;

        let itemRevenue = cartItem.selling_price * cartItem.qty;
        let itemProfit = (cartItem.selling_price - cartItem.purchase_price) * cartItem.qty;
        orderTotalRevenue += itemRevenue;
        orderTotalProfit += itemProfit;

        receiptItemsHTML += `<tr><td>${cartItem.name}</td><td>${cartItem.qty}</td><td class="text-end">₹${itemRevenue.toFixed(2)}</td></tr>`;

        orderItems.push({
            productId: cartItem.id,
            productName: cartItem.name,
            qty: cartItem.qty,
            purchasePrice: cartItem.purchase_price,
            sellingPrice: cartItem.selling_price
        });

        product.batches.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
        let remainingToDeduct = cartItem.qty;

        for (let i = 0; i < product.batches.length; i++) {
            if (remainingToDeduct <= 0) break;
            let batch = product.batches[i];
            if (batch.qty >= remainingToDeduct) {
                batch.qty -= remainingToDeduct;
                remainingToDeduct = 0;
            } else {
                remainingToDeduct -= batch.qty;
                batch.qty = 0;
            }
        }
        product.batches = product.batches.filter(b => b.qty > 0);
        db.collection('products').doc(cartItem.id).update({ batches: product.batches });
    });

    db.collection('orders').add({
        userId: currentUser.email,
        date: new Date().toISOString(),
        items: orderItems,
        totalRevenue: orderTotalRevenue,
        totalProfit: orderTotalProfit,
        paymentMethod: selectedPaymentMethod
    });

    if (selectedPaymentMethod === 'udhaar') {
        const cmobile = document.getElementById('customer-mobile').value.trim();
        const cname = document.getElementById('customer-name').value.trim();
        let acc = customers.find(a => a.mobile === cmobile);
        let now = new Date().toISOString();
        if (!acc) {
            db.collection('customers').add({
                userId: currentUser.email,
                mobile: cmobile,
                customerName: cname,
                total_due: orderTotalRevenue,
                lastPaymentDate: null,
                history: [{ date: now, amount: orderTotalRevenue, type: 'debt' }]
            });
        } else {
            db.collection('customers').doc(acc.id).update({
                customerName: cname,
                total_due: firebase.firestore.FieldValue.increment(orderTotalRevenue),
                history: firebase.firestore.FieldValue.arrayUnion({ date: now, amount: orderTotalRevenue, type: 'debt' })
            });
        }
    }

    // Prepare receipt
    document.getElementById('receipt-shop-name').innerText = currentUser.shop;
    document.getElementById('receipt-items').innerHTML = receiptItemsHTML;
    document.getElementById('receipt-total').innerText = orderTotalRevenue.toFixed(2);

    // Save SMS state globally
    window.latestOrderData = {
        mobile: customerMobile,
        total: orderTotalRevenue
    };

    cart = [];
    selectedPaymentMethod = null;
    document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('btn-success', 'btn-primary'));
    renderCart();
    renderBillingGrid();
    document.getElementById('customer-mobile').value = '';

    // Show Success Modal instead of generic alert
    new bootstrap.Modal(document.getElementById('checkoutSuccessModal')).show();
}

// Success Modal Actions
document.getElementById('btn-print-bill').addEventListener('click', () => {
    window.print();
});

document.getElementById('btn-send-sms').addEventListener('click', () => {
    let msg = `Thank you for shopping!\nTotal Amount: ₹${window.latestOrderData.total.toFixed(2)}\nVisit again!`;
    let encoded = encodeURIComponent(msg);
    let href = window.latestOrderData.mobile ? `sms:${window.latestOrderData.mobile}?body=${encoded}` : `sms:?body=${encoded}`;
    window.location.href = href;
});

// ----------------------------------------------------
// ANALYTICS & CHARTS
// ----------------------------------------------------
function loadAnalytics() {
    let productCounts = {};
    let monthlySales = {};

    orders.forEach(order => {
        // Aggregate top products
        order.items.forEach(item => {
            productCounts[item.productId] = (productCounts[item.productId] || 0) + item.qty;
        });

        // Aggregate monthly sales
        let d = new Date(order.date);
        let mIdx = d.getMonth();
        let yIdx = d.getFullYear();
        let key = `${yIdx}-${String(mIdx + 1).padStart(2, '0')}`;

        if (!monthlySales[key]) monthlySales[key] = 0;
        monthlySales[key] += order.totalRevenue;
    });

    // Prepare Pie Data
    let topLabels = [];
    let topData = [];
    let backgroundColors = ['#4361ee', '#4cc9f0', '#3f37c9', '#4caf50', '#ff9800', '#f44336'];

    for (let pid in productCounts) {
        let p = products.find(x => x.id == pid);
        topLabels.push(p ? p.name : 'Unknown');
        topData.push(productCounts[pid]);
    }

    // Prepare Bar Data
    // Sort keys just in case
    let monthKeys = Object.keys(monthlySales).sort();
    let barLabels = [];
    let barData = [];

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    monthKeys.forEach(k => {
        let parts = k.split('-');
        barLabels.push(`${monthNames[parseInt(parts[1]) - 1]} ${parts[0]}`);
        barData.push(monthlySales[k]);
    });

    // Destroy existing charts to prevent overlapping render
    if (pieChart) pieChart.destroy();
    if (barChart) barChart.destroy();

    // Render Pie Chart
    const ctxPie = document.getElementById('topProductsChart').getContext('2d');
    pieChart = new Chart(ctxPie, {
        type: 'pie',
        data: {
            labels: topLabels.length > 0 ? topLabels : [t('no_data')],
            datasets: [{
                data: topData.length > 0 ? topData : [1],
                backgroundColor: topData.length > 0 ? backgroundColors : ['#e0e0e0']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });

    // Render Bar Chart
    const ctxBar = document.getElementById('monthlySalesChart').getContext('2d');
    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: barLabels.length > 0 ? barLabels : [t('no_data')],
            datasets: [{
                label: 'Revenue (₹)',
                data: barData.length > 0 ? barData : [0],
                backgroundColor: 'rgba(67, 97, 238, 0.7)',
                borderColor: 'rgba(67, 97, 238, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// ----------------------------------------------------
// PROFILE MANAGEMENT
// ----------------------------------------------------
function loadProfile() {
    document.getElementById('profile-name').value = currentUser.name || '';
    document.getElementById('profile-shop').value = currentUser.shop || '';
    document.getElementById('profile-mobile').value = currentUser.mobile || '';
    if (currentUser.qrCode) {
        document.getElementById('profile-qr-preview').src = currentUser.qrCode;
    } else {
        document.getElementById('profile-qr-preview').src = 'qr_placeholder.png';
    }
}

let pendingProfileQR = null;
document.getElementById('profile-qr').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            pendingProfileQR = event.target.result;
            document.getElementById('profile-qr-preview').src = pendingProfileQR;
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    currentUser.name = document.getElementById('profile-name').value;
    currentUser.shop = document.getElementById('profile-shop').value;
    currentUser.mobile = document.getElementById('profile-mobile').value;
    if (pendingProfileQR) {
        currentUser.qrCode = pendingProfileQR;
    }

    const userIndex = users.findIndex(u => u.email === currentUser.email);
    if (userIndex > -1) {
        users[userIndex] = currentUser;
    }

    saveCurrentUser();
    showApp();
    alert('Profile updated successfully!');
});

// ----------------------------------------------------
// UDHAAR MANAGEMENT
// ----------------------------------------------------
function renderCustomers() {
    const activeList = document.getElementById('active-udhaar-list');
    const clearedList = document.getElementById('cleared-udhaar-list');
    if (!activeList || !clearedList) return;

    activeList.innerHTML = '';
    clearedList.innerHTML = '';

    const searchInput = document.getElementById('udhaar-search');
    const sq = searchInput ? searchInput.value.toLowerCase() : '';

    let filtered = customers;
    if (sq) {
        filtered = customers.filter(a => a.customerName.toLowerCase().includes(sq) || a.mobile.includes(sq));
    }

    filtered.forEach(acc => {
        let lastPaidTxt = '-';
        if (acc.lastPaymentDate) {
            let lastD = new Date(acc.lastPaymentDate);
            let diff = Math.floor((new Date() - lastD) / (1000 * 60 * 60 * 24));
            lastPaidTxt = diff === 0 ? t('today') : `${diff} ${t('days_ago')}`;
        }

        let histBtn = `<button class="btn btn-sm btn-outline-secondary ms-1" onclick="openUdhaarHistory('${acc.mobile}')"><i class="fas fa-list"></i> ${t('history') || 'History'}</button>`;
        let dueAmount = parseFloat((acc.total_due !== undefined) ? acc.total_due : acc.totalDue) || 0;

        if (dueAmount > 0) {
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold">${acc.customerName || acc.name || "Unknown"}</td>
                <td>${acc.mobile}</td>
                <td class="text-danger fw-bold">₹${dueAmount.toFixed(2)}</td>
                <td class="text-muted"><small>${lastPaidTxt}</small></td>
                <td class="text-end text-nowrap">
                    <button class="btn btn-sm btn-success" onclick="openUdhaarPayment('${acc.mobile}')"><i class="fas fa-rupee-sign"></i> ${t('add_payment') || 'Pay'}</button>
                    ${histBtn}
                </td>
            `;
            activeList.appendChild(tr);
        } else if (acc.history && acc.history.length > 0) {
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold">${acc.customerName || acc.name || "Unknown"}</td>
                <td>${acc.mobile}</td>
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
    
    // Fix undefined names
    const displayName = acc.customerName || acc.name || "Unknown";
    document.getElementById('u-pay-name').innerText = displayName;
    document.getElementById('u-pay-mobile').value = acc.mobile;
    
    // Exact rounding to prevent floating point mismatch errors
    let totalDue = parseFloat((acc.total_due !== undefined) ? acc.total_due : acc.totalDue) || 0;
    totalDue = parseFloat(totalDue.toFixed(2));

    document.getElementById('u-pay-amount').innerText = totalDue.toFixed(2);
    // Explicitly empty it initially so the button click visually DOES something
    document.getElementById('u-pay-input').value = totalDue.toFixed(2);
    document.getElementById('u-pay-input').setAttribute('max', totalDue.toFixed(2));

    const stlBtn = document.getElementById('btn-pay-full');
    stlBtn.innerText = `Full Settle (₹${totalDue.toFixed(2)})`;
    
    // Auto-trigger submit logic
    stlBtn.onclick = function() {
        document.getElementById('u-pay-input').value = totalDue.toFixed(2);
        
        let confirmSettle = confirm("Confirm Full Settlement of ₹" + totalDue.toFixed(2) + " ?");
        if(confirmSettle) {
            const saveBtn = document.querySelector('#udhaar-pay-form button[type="submit"]');
            if(saveBtn) saveBtn.click();
        }
    };

    const modalEl = document.getElementById('udhaarPaymentModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl);
    modal.show();
}

document.getElementById('udhaar-pay-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const mobile = document.getElementById('u-pay-mobile').value;
    const amt = parseFloat(document.getElementById('u-pay-input').value);
    const acc = customers.find(a => a.mobile === mobile);
    
    if (!acc) return;
    let totalDue = parseFloat((acc.total_due !== undefined) ? acc.total_due : acc.totalDue) || 0;
    totalDue = parseFloat(totalDue.toFixed(2));

    if (isNaN(amt) || amt <= 0 || amt > (totalDue + 0.01)) {
        alert("Invalid amount! Cannot exceed total due."); 
        return;
    }

    let now = new Date().toISOString();
    
    db.collection('customers').doc(acc.id).update({
        total_due: firebase.firestore.FieldValue.increment(-amt),
        lastPaymentDate: now,
        history: firebase.firestore.FieldValue.arrayUnion({ date: now, amount: amt, type: 'payment' })
    }).then(() => {
        const modalEl = document.getElementById('udhaarPaymentModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        else {
            const btnClose = modalEl.querySelector('.btn-close');
            if (btnClose) btnClose.click();
        }
    }).catch(err => {
        alert("Payment Error: " + err.message);
    });
});

function openUdhaarHistory(mobile) {
    const acc = customers.find(a => a.mobile === mobile);
    if (!acc) return;

    const list = document.getElementById('udhaar-history-list');
    list.innerHTML = '';

    if (!acc.history || acc.history.length === 0) {
        list.innerHTML = `<div class="text-muted text-center p-3">${t('no_data') || 'No records'}</div>`;
    } else {
        let hist = [...acc.history].sort((a, b) => new Date(b.date) - new Date(a.date));
        hist.forEach(h => {
            const isPay = h.type === 'payment';
            const icon = isPay ? 'fa-arrow-down text-success' : 'fa-arrow-up text-danger';
            const sign = isPay ? '-' : '+';
            const color = isPay ? 'text-success' : 'text-danger';
            const dStr = new Date(h.date).toLocaleString();

            list.innerHTML += `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div><i class="fas ${icon} me-2"></i><strong>${isPay ? (t('record_payment') || 'Payment') : (t('udhaar_btn') || 'Udhaar')}</strong><br><small class="text-muted">${dStr}</small></div>
                    <div class="fw-bold ${color}">${sign}₹${h.amount.toFixed(2)}</div>
                </div>
            `;
        });
    }
    new bootstrap.Modal(document.getElementById('udhaarHistoryModal')).show();
}
