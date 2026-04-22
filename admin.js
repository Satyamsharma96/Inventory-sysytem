// ====================================================
// ADMIN.JS — Complete Admin Panel Logic
// ShopApp SaaS Admin System
// ====================================================

// ── Firebase Config ──────────────────────────────
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

// ── Admin Credentials ─────────────────────────────
const ADMIN_EMAIL    = 'admin@shop.com';
const ADMIN_PASSWORD = '123456';

// ── App State ─────────────────────────────────────
let allUsers        = [];
let allCoupons      = [];
let allPlans        = [];
let currentFilter   = 'all';
let currentSection  = 'dashboard';
let isLoggedIn      = false;

// Chart Instances
let planChart   = null;
let revenueChart = null;
let growthChart  = null;

// ── Helper: Date format ───────────────────────────
function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function getDaysLeft(iso) {
    if (!iso) return null;
    return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}

// ── Toast Notification ────────────────────────────
function showToast(msg, type = 'success') {
    const t = document.getElementById('admin-toast');
    t.textContent  = (type === 'success' ? '✅ ' : '❌ ') + msg;
    t.className    = type;
    t.style.display = 'flex';
    setTimeout(() => { t.style.display = 'none'; }, 3500);
}

// ── Initial Check: Is Admin Logged In? ────────────
window.addEventListener('DOMContentLoaded', () => {
    const stored = sessionStorage.getItem('admin_auth');
    if (stored === 'true') {
        showAdminPanel();
    } else {
        // If not authenticated, show login screen on this page instead of redirecting
        showLoginScreen();
    }
    setupEventListeners();
});

// ── Show Login Screen ─────────────────────────────
function showLoginScreen() {
    document.getElementById('admin-login-screen').style.display = 'flex';
    document.getElementById('admin-panel-wrap').style.display   = 'none';
}

// ── Show Admin Panel ──────────────────────────────
function showAdminPanel() {
    isLoggedIn = true;
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-panel-wrap').style.display   = 'flex';
    loadAllData();
}

// ── Admin Login ───────────────────────────────────
document.getElementById('admin-login-form')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email-input').value.trim();
    const pass  = document.getElementById('admin-pass-input').value.trim();
    const err   = document.getElementById('login-error');

    if (email === ADMIN_EMAIL && pass === ADMIN_PASSWORD) {
        sessionStorage.setItem('admin_auth', 'true');
        showAdminPanel();
    } else {
        err.style.display = 'block';
        err.textContent   = '❌ Invalid admin password.';
    }
});

// ── Admin Logout ──────────────────────────────────
function adminLogout() {
    sessionStorage.removeItem('admin_auth');
    // Clear any user session from app.js just in case
    localStorage.removeItem('currentUser');
    isLoggedIn = false;
    showLoginScreen();
}

// ── Load All Data ─────────────────────────────────
async function loadAllData() {
    await Promise.all([
        loadUsers(),
        loadCoupons(),
        loadPlans()
    ]);
    renderStats();
    renderRecentUsers();
    renderExpiringUsers();
}

// ── Load Users from Firestore ─────────────────────
async function loadUsers() {
    try {
        const snap = await db.collection('users').get();
        allUsers   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error('loadUsers error:', err);
    }
}

// ── Load Coupons ──────────────────────────────────
async function loadCoupons() {
    try {
        const snap = await db.collection('coupons').get();
        allCoupons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCouponsTable();
    } catch (err) {
        console.error('loadCoupons error:', err);
    }
}

// loadPricingConfig is deprecated in favor of loadPlans

// ── Render Stats ──────────────────────────────────
function renderStats() {
    const total    = allUsers.length;
    const pending  = allUsers.filter(u => (u.status || 'pending') === 'pending').length;
    const approved = allUsers.filter(u => u.status === 'approved').length;
    const rejected = allUsers.filter(u => u.status === 'rejected').length;
    const free     = allUsers.filter(u => (u.plan || u.subscriptionPlan || '') === 'free' || (u.plan || u.subscriptionPlan || '') === 'trial').length;
    const monthly  = allUsers.filter(u => (u.plan || u.subscriptionPlan || '') === 'monthly').length;
    const yearly   = allUsers.filter(u => (u.plan || u.subscriptionPlan || '') === 'yearly').length;
    const paid     = monthly + yearly;

    const totalRevenue   = allUsers.reduce((s, u) => s + (parseFloat(u.amountPaid || u.pricePaid || 0)), 0);

    // Update stat cards
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-total',    total);
    set('stat-pending',  pending);
    set('stat-approved', approved);
    set('stat-rejected', rejected);
    set('stat-free',     free);
    set('stat-monthly',  monthly);
    set('stat-yearly',   yearly);
    set('stat-revenue',  '₹' + totalRevenue.toFixed(0));
    set('stat-active',   approved);
    set('stat-blocked',  rejected);
    set('stat-premium',  paid);

    // Subscription section counts
    set('free-count',    free);
    set('premium-count', paid);

    // Analytics section
    renderAnalytics(totalRevenue, free, monthly, yearly, paid);
    renderAnalyticsCharts(free, monthly, yearly);
}

// ── Render Analytics ──────────────────────────────
function renderAnalytics(totalRevenue, free, monthly, yearly, paid) {
    const grid = document.getElementById('analytics-grid');
    if (!grid) return;

    const monthlyRev = allUsers
        .filter(u => (u.plan || u.subscriptionPlan) === 'monthly')
        .reduce((s, u) => s + parseFloat(u.amountPaid || u.pricePaid || 0), 0);

    const yearlyRev = allUsers
        .filter(u => (u.plan || u.subscriptionPlan) === 'yearly')
        .reduce((s, u) => s + parseFloat(u.amountPaid || u.pricePaid || 0), 0);

    const cards = [
        { icon: 'fa-rupee-sign',  color: '#6c63ff', label: 'Total Revenue',  value: '₹' + totalRevenue.toFixed(0) },
        { icon: 'fa-calendar',    color: '#4cc9f0', label: 'Monthly Revenue', value: '₹' + monthlyRev.toFixed(0) },
        { icon: 'fa-crown',       color: '#ffd166', label: 'Yearly Revenue',  value: '₹' + yearlyRev.toFixed(0) },
        { icon: 'fa-gift',        color: '#00d084', label: 'Free Users',      value: free },
        { icon: 'fa-calendar-alt',color: '#4cc9f0', label: 'Monthly Users',   value: monthly },
        { icon: 'fa-star',        color: '#ffd166', label: 'Yearly Users',    value: yearly },
        { icon: 'fa-users',       color: '#6c63ff', label: 'Paid Users',      value: paid },
        { icon: 'fa-percent',     color: '#ff4d6d', label: 'Conversion',      value: allUsers.length > 0 ? Math.round((paid / allUsers.length) * 100) + '%' : '0%' },
    ];

    grid.innerHTML = cards.map(c => `
        <div class="stat-card" style="border-top-color:${c.color};">
            <div class="stat-icon" style="background:${c.color}22;color:${c.color};">
                <i class="fas ${c.icon}"></i>
            </div>
            <div class="stat-value" style="color:${c.color};">${c.value}</div>
            <div class="stat-label">${c.label}</div>
        </div>
    `).join('');

    // User plan breakdown table
    renderUserPlanBreakdown();
}

/** ── Graphical Charts ── **/
function renderAnalyticsCharts(freeCount, monthlyCount, yearlyCount) {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded. Skipping graphical charts.');
        const grids = ['planDistributionChart', 'revenueBreakdownChart', 'userGrowthChart'];
        grids.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.parentElement) el.parentElement.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem;text-align:center;padding:20px;">Charts unavailable (check connection)</div>';
        });
        return;
    }
    const isDark = true; 
    const textColor = '#8b90b0';
    const gridColor = 'rgba(46, 50, 80, 0.4)';

    // 1. Plan Distribution (Pie)
    const ctxPlan = document.getElementById('planDistributionChart')?.getContext('2d');
    if (ctxPlan) {
        if (planChart) planChart.destroy();
        planChart = new Chart(ctxPlan, {
            type: 'doughnut',
            data: {
                labels: ['Free', 'Monthly', 'Yearly'],
                datasets: [{
                    data: [freeCount, monthlyCount, yearlyCount],
                    backgroundColor: ['#8b90b0', '#6c63ff', '#00d084'],
                    borderWidth: 0,
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Outfit', size: 12 } } }
                },
                cutout: '70%'
            }
        });
    }

    // 2. Revenue Breakdown (Bar)
    const ctxRev = document.getElementById('revenueBreakdownChart')?.getContext('2d');
    if (ctxRev) {
        const monthlyRev = allUsers.filter(u => (u.plan || u.subscriptionPlan) === 'monthly')
            .reduce((s, u) => s + parseFloat(u.amountPaid || u.pricePaid || 0), 0);
        const yearlyRev = allUsers.filter(u => (u.plan || u.subscriptionPlan) === 'yearly')
            .reduce((s, u) => s + parseFloat(u.amountPaid || u.pricePaid || 0), 0);
        const totalRev = monthlyRev + yearlyRev;

        if (revenueChart) revenueChart.destroy();
        revenueChart = new Chart(ctxRev, {
            type: 'bar',
            data: {
                labels: ['Monthly', 'Yearly', 'Total'],
                datasets: [{
                    label: 'Revenue (₹)',
                    data: [monthlyRev, yearlyRev, totalRev],
                    backgroundColor: ['#4cc9f0', '#ffd166', '#6c63ff'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { grid: { color: gridColor }, ticks: { color: textColor } },
                    x: { grid: { display: false }, ticks: { color: textColor } }
                }
            }
        });
    }

    // 3. User Growth (Line Chart - Last 7 Days)
    const ctxGrowth = document.getElementById('userGrowthChart')?.getContext('2d');
    if (ctxGrowth) {
        // Prepare last 7 days labels
        const labels = [];
        const growthData = [];
        const now = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const dStr = d.toISOString().split('T')[0];
            labels.push(d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
            
            const count = allUsers.filter(u => u.createdAt && u.createdAt.startsWith(dStr)).length;
            growthData.push(count);
        }

        if (growthChart) growthChart.destroy();
        growthChart = new Chart(ctxGrowth, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'New Signups',
                    data: growthData,
                    borderColor: '#6c63ff',
                    backgroundColor: 'rgba(108, 99, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#6c63ff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: gridColor }, 
                        ticks: { color: textColor, stepSize: 1 } 
                    },
                    x: { grid: { display: false }, ticks: { color: textColor } }
                }
            }
        });
    }
}

function renderUserPlanBreakdown() {
    const wrap = document.getElementById('user-plan-breakdown');
    if (!wrap) return;

    const isMobile = window.innerWidth < 768;
    const paidUsers = allUsers
        .filter(u => (u.plan || u.subscriptionPlan) && (u.plan || u.subscriptionPlan) !== 'none')
        .sort((a, b) => (parseFloat(b.amountPaid || b.pricePaid || 0)) - (parseFloat(a.amountPaid || a.pricePaid || 0)))
        .slice(0, 20);

    if (paidUsers.length === 0) {
        wrap.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i>No paid users yet</div>';
        return;
    }

    const rows = paidUsers.map(u => {
        const plan = (u.plan || u.subscriptionPlan || 'free').toLowerCase();
        const dl   = getDaysLeft(u.planEnd);
        const dlStr = dl === null ? '—' : dl <= 0 ? '<span style="color:#ff4d6d;">Expired</span>' : dl + ' days';
        return `<tr>
            <td><div style="display:flex;align-items:center;gap:12px;">
                <div class="user-avatar">${(u.name || u.email || '?')[0].toUpperCase()}</div>
                <div><div style="font-weight:600;font-size:0.85rem;">${u.name || '—'}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${u.email}</div></div>
            </div></td>
            <td><span class="badge-plan ${plan}">${plan.toUpperCase()}</span></td>
            <td>₹${parseFloat(u.amountPaid || u.pricePaid || 0).toFixed(0)}</td>
            <td>${fmtDate(u.planEnd)}</td>
            <td>${dlStr}</td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
        <div class="scroll-hint"><i class="fas fa-arrows-left-right me-2"></i>Swipe horizontally to see more data →</div>
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead><tr>
                    <th>User</th><th>Plan</th><th>Paid</th><th>Expires</th><th>Days Left</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ── Render Recent Users ───────────────────────────
function renderRecentUsers() {
    const wrap = document.getElementById('recent-users-wrap');
    if (!wrap) return;

    const recent = [...allUsers]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);

    if (recent.length === 0) {
        wrap.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i>No users yet</div>';
        return;
    }

    wrap.innerHTML = `
        <div class="scroll-hint"><i class="fas fa-arrows-left-right me-2"></i>Swipe horizontally to see more data →</div>
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead><tr><th>User</th><th>Shop</th><th>Status</th><th>Plan</th><th>Joined</th><th>Action</th></tr></thead>
                <tbody>${recent.map(u => buildUserRow(u)).join('')}</tbody>
            </table>
        </div>`;
}

// ── Render Expiring Users ─────────────────────────
function renderExpiringUsers() {
    const wrap = document.getElementById('expiring-users-wrap');
    if (!wrap) return;

    const expiring = allUsers.filter(u => {
        const dl = getDaysLeft(u.planEnd);
        return dl !== null && dl >= 0 && dl <= 3;
    }).sort((a, b) => getDaysLeft(a.planEnd) - getDaysLeft(b.planEnd));

    if (expiring.length === 0) {
        wrap.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i>No users expiring soon</div>';
        return;
    }

    wrap.innerHTML = `
        <div class="scroll-hint"><i class="fas fa-arrows-left-right me-2"></i>Swipe horizontally to see more data →</div>
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead><tr><th>User</th><th>Plan</th><th>Expires</th><th>Days Left</th><th>Action</th></tr></thead>
                <tbody>${expiring.map(u => {
                    const dl   = getDaysLeft(u.planEnd);
                    const plan = (u.plan || u.subscriptionPlan || 'free').toLowerCase();
                    return `<tr>
                        <td><div style="display:flex;align-items:center;gap:12px;">
                            <div class="user-avatar">${(u.name || (u.email?u.email:'?'))[0].toUpperCase()}</div>
                            <div><div style="font-weight:600;font-size:0.85rem;">${u.name || '—'}</div>
                            <div style="font-size:0.72rem;color:var(--text-muted);">${u.email}</div></div>
                        </div></td>
                        <td><span class="badge-plan ${plan}">${plan.toUpperCase()}</span></td>
                        <td>${fmtDate(u.planEnd)}</td>
                        <td><span style="color:${dl <= 1 ? '#ff4d6d' : '#ffd166'};font-weight:700;">${dl} day${dl !== 1 ? 's' : ''}</span></td>
                        <td><button class="btn-refresh" style="font-size:0.75rem;padding:5px 10px;" onclick="extendPlan('${u.email}', '${plan}')">+ Extend</button></td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>`;
}

// ── Build User Table Row ──────────────────────────
function buildUserRow(u) {
    const plan     = (u.plan || u.subscriptionPlan || 'free').toLowerCase();
    const status   = u.status || 'pending';
    const dl       = getDaysLeft(u.planEnd);
    const dlStr    = dl === null ? '—' : dl <= 0 ? '<span style="color:#ff4d6d">Expired</span>' : dl + 'd';
    const initial  = (u.name || u.email || '?')[0].toUpperCase();
    const planBadge = `<span class="badge-plan ${plan}">${plan.toUpperCase()}</span>`;

    let statusBadge;
    if (status === 'approved')  statusBadge = '<span class="badge-status active">Approved</span>';
    else if (status === 'rejected') statusBadge = '<span class="badge-status blocked">Rejected</span>';
    else statusBadge = '<span class="badge-status" style="background:rgba(255,209,102,0.15);color:#ffd166;">Pending</span>';

    let actionBtns = '';
    if (status === 'pending') {
        actionBtns = `
            <button class="action-btn btn-unblock" title="Approve" onclick="approveUser('${u.email}')"><i class="fas fa-check"></i></button>
            <button class="action-btn btn-block"   title="Reject"  onclick="rejectUser('${u.email}')"><i class="fas fa-times"></i></button>`;
    } else if (status === 'approved') {
        actionBtns = `
            <button class="action-btn btn-block" title="Block" onclick="rejectUser('${u.email}')"><i class="fas fa-ban"></i></button>
            <button class="action-btn btn-premium" title="Give Premium" onclick="grantPlan('${u.email}', 'monthly')"><i class="fas fa-crown"></i></button>`;
    } else {
        actionBtns = `
            <button class="action-btn btn-unblock" title="Approve" onclick="approveUser('${u.email}')"><i class="fas fa-check"></i></button>`;
    }

    return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px;">
            <div class="user-avatar">${initial}</div>
            <div><div style="font-weight:600;font-size:0.85rem;">${u.name || '—'}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">${u.email}</div></div>
        </div></td>
        <td style="font-size:0.85rem;">${u.shop || u.shopName || '—'}</td>
        <td style="font-size:0.82rem;color:var(--text-muted);">${u.mobile || '—'}</td>
        <td>${planBadge}</td>
        <td style="font-size:0.8rem;">${fmtDate(u.planEnd)}</td>
        <td>${dlStr}</td>
        <td>${statusBadge}</td>
        <td style="font-size:0.78rem;color:var(--text-muted);">${fmtDate(u.createdAt)}</td>
        <td>${actionBtns}</td>
    </tr>`;
}

// ── Render Users Table ────────────────────────────
function renderUsersTable(filter = currentFilter, search = '') {
    const tbody     = document.getElementById('users-table-body');
    const mobileWrap = document.getElementById('users-cards-mobile');
    if (!tbody) return;

    const sq = search.toLowerCase();
    let filtered = allUsers.filter(u => {
        const term = (u.name || '') + (u.email || '') + (u.shop || u.shopName || '');
        if (sq && !term.toLowerCase().includes(sq)) return false;
        const plan   = (u.plan || u.subscriptionPlan || 'none');
        const status = u.status || 'pending';
        if (filter === 'pending')  return status === 'pending';
        if (filter === 'approved') return status === 'approved';
        if (filter === 'rejected') return status === 'rejected';
        if (filter === 'premium')  return plan === 'monthly' || plan === 'yearly';
        if (filter === 'free')     return plan === 'free' || plan === 'trial' || plan === 'none';
        return true;
    });

    document.getElementById('user-count-badge').textContent = `(${filtered.length})`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-users"></i>No users found</div></td></tr>`;
        if (mobileWrap) mobileWrap.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i>No users found</div>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => buildUserRow(u)).join('');

    tbody.innerHTML = filtered.map(u => buildUserRow(u)).join('');
}

// ── Approve User ──────────────────────────────────
async function approveUser(email) {
    if (!confirm(`Approve user: ${email}?\nThis will activate Free Plan (30 days).`)) return;
    try {
        const now = new Date();
        const end = new Date(); 
        end.setDate(end.getDate() + 30); // Free plan = 30 days fixed

        await db.collection('users').doc(email).set({
            status:           'approved',
            plan:             'free',
            subscriptionPlan: 'free',
            planStart:        now.toISOString(),
            planEnd:          end.toISOString(),
            pricePaid:        0,
            approvedAt:       now.toISOString()
        }, { merge: true });

        const u = allUsers.find(x => x.email === email);
        if (u) {
            u.status = 'approved';
            u.plan   = 'free';
            u.planEnd = end.toISOString();
        }
        renderUsersTable(currentFilter);
        renderStats();
        renderPendingSection();
        showToast(`${email} approved! Free plan activated.`);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ── Reject User ───────────────────────────────────
async function rejectUser(email) {
    if (!confirm(`Reject / Block user: ${email}?`)) return;
    try {
        await db.collection('users').doc(email).set({ status: 'rejected', rejectedAt: new Date().toISOString() }, { merge: true });
        const u = allUsers.find(x => x.email === email);
        if (u) u.status = 'rejected';
        renderUsersTable(currentFilter);
        renderStats();
        renderPendingSection();
        showToast(`${email} rejected.`, 'error');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ── Grant Plan ────────────────────────────────────
async function grantPlan(email, planId) {
    const plan = allPlans.find(p => p.id === planId);
    if (!plan) {
        // Fallback for legacy grant (monthly/yearly)
        const days = planId === 'yearly' ? 365 : 30;
        await executeGrant(email, planId, days);
        return;
    }
    
    if (!confirm(`Grant ${plan.name} (${plan.durationDays} Days) to ${email}?`)) return;
    await executeGrant(email, plan.name, plan.durationDays);
}

async function executeGrant(email, planName, days) {
    try {
        const now = new Date(); const end = new Date();
        end.setDate(end.getDate() + days);
        await db.collection('users').doc(email).set({
            plan:             planName,
            subscriptionPlan: planName,
            planStart:        now.toISOString(),
            planEnd:          end.toISOString(),
            planDurationDays: days
        }, { merge: true });
        const u = allUsers.find(x => x.email === email);
        if (u) { u.plan = planName; u.planEnd = end.toISOString(); }
        renderUsersTable(currentFilter);
        renderStats();
        showToast(`${planName} plan granted to ${email}!`);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ── Extend Plan ───────────────────────────────────
async function extendPlan(email, pName) {
    // Try to find if pName matches a dynamic plan first
    const plan = allPlans.find(p => p.name === pName);
    const days = plan ? plan.durationDays : (pName === 'yearly' ? 365 : 30);
    
    if (!confirm(`Extend ${pName} plan by ${days} days for ${email}?`)) return;
    try {
        const u   = allUsers.find(x => x.email === email);
        const base = u?.planEnd ? new Date(u.planEnd) : new Date();
        if (base < new Date()) base.setTime(new Date().getTime());
        base.setDate(base.getDate() + days);
        await db.collection('users').doc(email).update({ planEnd: base.toISOString() });
        if (u) u.planEnd = base.toISOString();
        renderExpiringUsers();
        showToast(`Plan extended for ${email}!`);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ── Render Pending Section ────────────────────────
function renderPendingSection() {
    const pending  = allUsers.filter(u => (u.status || 'pending') === 'pending');
    const approved = allUsers.filter(u => u.status === 'approved');
    const rejected = allUsers.filter(u => u.status === 'rejected');

    renderApprovalList('pending-list',  pending,  'pending');
    renderApprovalList('approved-list', approved, 'approved');
    renderApprovalList('rejected-list', rejected, 'rejected');

    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setCount('pending-count',  pending.length);
    setCount('approved-count', approved.length);
    setCount('rejected-count', rejected.length);
}

function renderApprovalList(containerId, users, type) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;

    if (users.length === 0) {
        wrap.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><i class="fas fa-inbox"></i>No ${type} users</div>`;
        return;
    }

    wrap.innerHTML = users.map(u => {
        const initial = (u.name || u.email || '?')[0].toUpperCase();
        let btns = '';
        if (type === 'pending') {
            btns = `<button class="action-btn btn-unblock" title="Approve" onclick="approveUser('${u.email}')"><i class="fas fa-check"></i></button>
                    <button class="action-btn btn-block" title="Reject" onclick="rejectUser('${u.email}')"><i class="fas fa-times"></i></button>`;
        } else if (type === 'approved') {
            btns = `<button class="action-btn btn-block" title="Block" onclick="rejectUser('${u.email}')"><i class="fas fa-ban"></i></button>
                    <button class="action-btn btn-premium" title="Grant Plan" onclick="grantPlan('${u.email}','monthly')"><i class="fas fa-crown"></i></button>`;
        } else {
            btns = `<button class="action-btn btn-unblock" title="Re-approve" onclick="approveUser('${u.email}')"><i class="fas fa-undo"></i></button>`;
        }

        return `<div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(46,50,80,0.4);">
            <div class="user-avatar">${initial}</div>
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.85rem;">${u.name || '—'}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${u.email}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">${u.shop || u.shopName || 'No shop'} ${u.createdAt ? '· ' + fmtDate(u.createdAt) : ''}</div>
            </div>
            <div style="display:flex;gap:4px;">${btns}</div>
        </div>`;
    }).join('');
}

// ── Render Coupons Table ──────────────────────────
function renderCouponsTable() {
    const tbody = document.getElementById('coupons-table-body');
    const mobileWrap = document.getElementById('coupons-mobile');
    if (!tbody) return;

    if (allCoupons.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-ticket-alt"></i>No coupons yet</div></td></tr>`;
        if (mobileWrap) mobileWrap.innerHTML = `<div class="empty-state"><i class="fas fa-ticket-alt"></i>No coupons yet</div>`;
        return;
    }

    const rows = allCoupons.map(c => {
        const isExpired = c.validTill && new Date(c.validTill) < new Date();
        const disc      = c.discountType === 'percent' ? c.discountValue + '%' : '₹' + c.discountValue;
        return `<tr>
            <td><span style="background:rgba(108,99,255,0.15);color:var(--primary);padding:4px 10px;border-radius:8px;font-weight:700;font-size:0.82rem;letter-spacing:1px;">${c.code}</span></td>
            <td style="font-weight:600;">${disc} off</td>
            <td style="font-size:0.82rem;${isExpired ? 'color:var(--danger);' : ''}">${fmtDate(c.validTill)}${isExpired ? ' (Expired)' : ''}</td>
            <td><span style="font-size:0.82rem;">${c.usedCount || 0} / ${c.maxUsage || '∞'}</span></td>
            <td><button class="action-btn btn-delete" onclick="deleteCoupon('${c.id}')"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rows;
}

// ── Delete Coupon ─────────────────────────────────
async function deleteCoupon(id) {
    if (!confirm('Delete this coupon?')) return;
    try {
        await db.collection('coupons').doc(id).delete();
        allCoupons = allCoupons.filter(c => c.id !== id);
        renderCouponsTable();
        showToast('Coupon deleted.');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ── Generate Random Coupon Code ───────────────────
function generateCouponCode() {
    const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const prefix = ['SAVE', 'OFF', 'DEAL', 'GET', 'WIN', 'FLAT', 'BIG'][Math.floor(Math.random() * 7)];
    let nums = '';
    for (let i = 0; i < 4; i++) nums += chars[Math.floor(Math.random() * chars.length)];
    const code = prefix + nums;

    const input = document.getElementById('cpn-code');
    if (input) {
        input.value = code;
        input.style.borderColor = 'var(--primary)';
        input.style.boxShadow   = '0 0 0 3px rgba(108,99,255,0.2)';
        setTimeout(() => {
            input.style.borderColor = '';
            input.style.boxShadow   = '';
        }, 1500);
    }
}

// ── Copy Coupon Code to Clipboard ─────────────────
function copyCouponCode() {
    const code = document.getElementById('cpn-code')?.value?.trim();
    if (!code) {
        showToast('Generate or type a code first!', 'error');
        return;
    }
    navigator.clipboard.writeText(code).then(() => {
        const msg = document.getElementById('cpn-copy-msg');
        const btn = document.getElementById('cpn-copy-btn');
        if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 2500); }
        if (btn) {
            const orig  = btn.textContent;
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = orig; }, 2000);
        }
    }).catch(() => {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        const msg = document.getElementById('cpn-copy-msg');
        if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 2500); }
    });
}


// ── Save Pricing ──────────────────────────────────
document.getElementById('pricing-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const monthly = parseFloat(document.getElementById('price-monthly').value);
    const yearly  = parseFloat(document.getElementById('price-yearly').value);
    try {
        await db.collection('adminConfig').doc('pricing').set({ monthlyPrice: monthly, yearlyPrice: yearly }, { merge: true });
        showToast('Pricing updated! ₹' + monthly + ' / ₹' + yearly);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
});

// ── Add Coupon Form ───────────────────────────────
document.getElementById('add-coupon-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const code    = document.getElementById('cpn-code').value.toUpperCase().trim();
    const value   = parseFloat(document.getElementById('cpn-value').value);
    const type    = document.getElementById('cpn-type').value;
    const expiry  = document.getElementById('cpn-expiry').value;
    const maxUse  = parseInt(document.getElementById('cpn-max').value) || null;

    if (!code || !value || !expiry) return;

    try {
        const ref = await db.collection('coupons').add({
            code, discountType: type, discountValue: value,
            validTill: new Date(expiry).toISOString(), maxUsage: maxUse, usedCount: 0,
            createdAt: new Date().toISOString()
        });
        allCoupons.push({ id: ref.id, code, discountType: type, discountValue: value, validTill: new Date(expiry).toISOString(), maxUsage: maxUse, usedCount: 0 });
        renderCouponsTable();
        this.reset();
        bootstrap.Modal.getInstance(document.getElementById('addCouponModal'))?.hide();
        showToast('Coupon ' + code + ' created!');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
});

// ── Navigation ────────────────────────────────────
function navigateTo(section) {
    document.querySelectorAll('.admin-section-view').forEach(s => s.classList.add('d-none'));
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(l => l.classList.remove('active'));

    const el   = document.getElementById('section-' + section);
    const link = document.querySelector(`.sidebar-nav .nav-link[data-section="${section}"]`);
    if (el)   { el.classList.remove('d-none'); }
    if (link) { link.classList.add('active'); }

    document.getElementById('topbar-title').textContent =
        section.charAt(0).toUpperCase() + section.slice(1);

    currentSection = section;

    // Section-specific render
    if (section === 'users')    renderUsersTable(currentFilter);
    if (section === 'approval') renderPendingSection();
    if (section === 'expiring') renderExpiringUsers();

    // Close mobile sidebar
    document.getElementById('admin-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
}

// ── Load Plans ────────────────────────────────────
async function loadPlans() {
    try {
        const snap = await db.collection('plans').orderBy('createdAt', 'desc').get();
        allPlans   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPlansTable();
    } catch (err) {
        console.error('loadPlans error:', err);
    }
}

// ── Render Plans ───────────────────────────────────
function renderPlansTable() {
    const tbody = document.getElementById('plans-table-body');
    const mobileWrap = document.getElementById('plans-mobile');
    if (!tbody) return;

    if (allPlans.length === 0) {
        const emptyMsg = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-tags"></i>No plans created yet</div></td></tr>`;
        tbody.innerHTML = emptyMsg;
        if (mobileWrap) mobileWrap.innerHTML = `<div class="empty-state"><i class="fas fa-tags"></i>No plans created yet</div>`;
        return;
    }

    tbody.innerHTML = allPlans.map(p => `
        <tr>
            <td class="fw-bold">${p.name}</td>
            <td>${p.durationDays} Days</td>
            <td class="fw-bold text-success">₹${p.price}</td>
            <td><span class="badge-status ${p.isActive ? 'active' : 'blocked'}">${p.isActive ? 'Active' : 'Hidden'}</span></td>
            <td>
                <div class="d-flex gap-2">
                    <button class="action-btn" onclick="openEditPlan('${p.id}')"><i class="fas fa-edit"></i></button>
                    <button class="action-btn btn-delete" onclick="deletePlan('${p.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ── Open Edit Plan ─────────────────────────────────
function openEditPlan(id) {
    const p = allPlans.find(x => x.id === id);
    if (!p) return;

    document.getElementById('planModalTitle').textContent = 'Edit Subscription Plan';
    document.getElementById('planBtnText').textContent    = 'Update Plan';
    document.getElementById('plan-id').value             = p.id;
    document.getElementById('plan-name').value           = p.name;
    document.getElementById('plan-days').value           = p.durationDays;
    document.getElementById('plan-price').value          = p.price;
    document.getElementById('plan-active').checked       = p.isActive !== false;

    new bootstrap.Modal(document.getElementById('addPlanModal')).show();
}

// ── Save/Update Plan ───────────────────────────────
document.getElementById('add-plan-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const id     = document.getElementById('plan-id').value;
    const name   = document.getElementById('plan-name').value.trim();
    const days   = parseInt(document.getElementById('plan-days').value);
    const price  = parseFloat(document.getElementById('plan-price').value);
    const active = document.getElementById('plan-active').checked;

    const btn = document.getElementById('planBtnText');
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const planData = {
            name,
            durationDays: days,
            price,
            isActive: active,
            updatedAt: new Date().toISOString()
        };

        if (id) {
            await db.collection('plans').doc(id).update(planData);
            showToast('Plan updated successfully!');
        } else {
            planData.createdAt = new Date().toISOString();
            await db.collection('plans').add(planData);
            showToast('New plan created!');
        }

        bootstrap.Modal.getInstance(document.getElementById('addPlanModal')).hide();
        loadPlans();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = oldText;
    }
});

// Reset modal on close
document.getElementById('addPlanModal')?.addEventListener('hidden.bs.modal', function () {
    document.getElementById('add-plan-form').reset();
    document.getElementById('plan-id').value = '';
    document.getElementById('planModalTitle').textContent = 'Create New Plan';
    document.getElementById('planBtnText').textContent    = 'Create Plan';
});

// ── Delete Plan ────────────────────────────────────
async function deletePlan(id) {
    if (!confirm('Are you sure you want to delete this plan? This will not affect existing users on this plan.')) return;
    try {
        await db.collection('plans').doc(id).delete();
        showToast('Plan deleted!');
        loadPlans();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}


// ── Setup Event Listeners ─────────────────────────
function setupEventListeners() {
    // Sidebar nav
    document.querySelectorAll('.sidebar-nav .nav-link[data-section]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(link.dataset.section);
        });
    });

    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter;
            renderUsersTable(currentFilter, document.getElementById('user-search')?.value || '');
        });
    });

    // Search
    document.getElementById('user-search')?.addEventListener('input', e => {
        renderUsersTable(currentFilter, e.target.value);
    });

    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', async () => {
        showToast('Refreshing data...', 'success');
        await loadAllData();
        if (currentSection === 'users')    renderUsersTable(currentFilter);
        if (currentSection === 'approval') renderPendingSection();
        if (currentSection === 'expiring') renderExpiringUsers();
    });

    // Hamburger
    document.getElementById('hamburger-btn')?.addEventListener('click', () => {
        document.getElementById('admin-sidebar')?.classList.add('open');
        document.getElementById('sidebar-overlay')?.classList.add('open');
    });

    document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
        document.getElementById('admin-sidebar')?.classList.remove('open');
        document.getElementById('sidebar-overlay')?.classList.remove('open');
    });
}
