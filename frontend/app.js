// ═══════════════════════════════════════════════════
// MSC Trust — Resource & Inventory Management Portal
// ═══════════════════════════════════════════════════

// ─── Inject CSS for Loading Spinner ──────────────
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .spinner { display: inline-block; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s ease-in-out infinite; width: 16px; height: 16px; vertical-align: middle; margin-right: 8px; }
  .spinner-large { border: 3px solid var(--teal-100); border-top-color: var(--teal-600); width: 32px; height: 32px; margin: 0; }
`;
document.head.appendChild(spinnerStyle);

// ─── API Helper ──────────────────────────────────
const API_BASE = '/api';

const cache = {};
const CACHE_TTL = 30000;

function cachedFetch(endpoint, options = {}) {
  const key = endpoint;
  const now = Date.now();
  if (cache[key] && (now - cache[key].ts) < CACHE_TTL && !options.method) {
    return Promise.resolve(cache[key].data);
  }
  return apiFetch(endpoint, options).then(data => {
    if (!options.method || options.method === 'GET') {
      cache[key] = { data, ts: now };
    }
    return data;
  });
}

function invalidateCache(pattern) {
  Object.keys(cache).forEach(k => { if (k.includes(pattern)) delete cache[k]; });
}

let globalSelectedBranch = '';

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('msc_token');
  
  if (globalSelectedBranch && (!options.method || options.method === 'GET')) {
    if (!endpoint.includes('branch_id=')) {
      const sep = endpoint.includes('?') ? '&' : '?';
      endpoint = `${endpoint}${sep}branch_id=${globalSelectedBranch}`;
    }
  }

  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers
  };
  
  // FIX: Add cache: 'no-store' to prevent browser from aggressively caching GET responses!
  const response = await fetch(`${API_BASE}${endpoint}`, { cache: 'no-store', ...options, headers });
  if (!response.ok) {
    // FIX 2: Session expiry handling in apiFetch
    if (response.status === 401) {
      localStorage.removeItem('msc_token');
      localStorage.removeItem('msc_user');
      document.getElementById('appShell').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'flex';
      const msg = document.getElementById('sessionExpiredMsg');
      if (msg) msg.style.display = 'block';
      throw new Error('Session expired');
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

function renderIcons(container) {
  const el = container || document.body;
  lucide.createIcons({ nameAttr: 'data-lucide', nodes: el.querySelectorAll('[data-lucide]') });
}

function skeletonRows(count, cols) {
  return Array(count).fill('').map(() =>
    `<tr>${Array(cols).fill('').map(() =>
      `<td><div class="skeleton" style="height:14px;border-radius:4px;width:${60 + Math.random()*30}%"></div></td>`
    ).join('')}</tr>`
  ).join('');
}

function skeletonCards(count) {
  return `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">${
    Array(count).fill('').map(() =>
      `<div class="skeleton" style="height:100px;border-radius:var(--radius)"></div>`
    ).join('')
  }</div>`;
}

// ─── Date & Greeting ─────────────────────────────
const now = new Date();
document.getElementById("dateDisplay").textContent = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(now);

// ─── Global State ────────────────────────────────
let inventory = [];
let alerts = [];
let currentPage = 1;
const PAGE_SIZE = 10;

// ─── DOM References ──────────────────────────────
const inventoryBody = document.getElementById("inventoryBody");
const categoryFilter = document.getElementById("categoryFilter");
const search = document.getElementById("globalSearch");
const itemCount = document.getElementById("itemCount");
const modal = document.getElementById("modalBackdrop");
const toast = document.getElementById("toast");
const dashboard = document.getElementById("dashboard");
const sectionView = document.getElementById("sectionView");
const sectionUsers = document.getElementById("sectionUsers");
const sectionBranches = document.getElementById("sectionBranches");
const pageHeading = document.getElementById("pageHeading");

const searchSuggestions = document.createElement('div');
searchSuggestions.className = 'search-suggestions';
document.querySelector('.search-box')?.appendChild(searchSuggestions);

// --- Info Modal ---
const infoModalBackdrop = document.getElementById('infoModalBackdrop');
const infoModalMessage = document.getElementById('infoModalMessage');

window.showInfoModal = function(message) {
  if (infoModalMessage) infoModalMessage.textContent = message;
  if (infoModalBackdrop) {
    renderIcons(infoModalBackdrop);
    infoModalBackdrop.classList.add('active');
  }
};

const closeInfoModal = () => {
  if (infoModalBackdrop) infoModalBackdrop.classList.remove('active');
};

const infoModalCloseIcon = document.getElementById('infoModalCloseIcon');
const infoModalCloseBtn = document.getElementById('infoModalCloseBtn');

if (infoModalCloseIcon) infoModalCloseIcon.addEventListener('click', closeInfoModal);
if (infoModalCloseBtn) infoModalCloseBtn.addEventListener('click', closeInfoModal);
if (infoModalBackdrop) {
  // infoModalBackdrop.addEventListener('click', e => {

  //     if (e.target === infoModalBackdrop) closeInfoModal();

  //   });
}

// ─── Toast ───────────────────────────────────────
window.showToast = function(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'check-circle-2';
  if (type === 'error') iconName = 'alert-circle';
  else if (type === 'info') iconName = 'info';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span>${msg}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons({ root: toast });
  
  // Trigger reflow for animation
  void toast.offsetWidth;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 500); // Wait for transition to finish
  }, 3500);
}

// FIX 3: Replace all confirm() dialogs with a custom modal
function showConfirm(message, onConfirm) {
  const backdrop = document.getElementById('confirmModalBackdrop');
  document.getElementById('confirmModalMessage').textContent = message;
  backdrop.classList.add('active');
  const okBtn = document.getElementById('confirmModalOk');
  const cancelBtn = document.getElementById('confirmModalCancel');
  const close = () => backdrop.classList.remove('active');
  const handleOk = () => { close(); onConfirm(); okBtn.removeEventListener('click', handleOk); cancelBtn.removeEventListener('click', close); };
  okBtn.addEventListener('click', handleOk);
  cancelBtn.addEventListener('click', close);
  // backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); }, { once: true });
}

// ─── Role Enforcement ────────────────────────────
function enforceRoles() {
  // FIX 4: Read role from JWT, not from localStorage msc_user
  const token = localStorage.getItem('msc_token');
  if (!token) return;
  let user;
  try {
    const payload = token.split('.')[1];
    user = JSON.parse(atob(payload));
  } catch(e) { return; }
  
  const addButtons = document.querySelectorAll('.section-add-entity, button[data-page="categories"], button[data-page="programs"], button[data-page="suppliers"]');
  const adminOnly = document.querySelectorAll('.admin-only');
  const staffOnly = document.querySelectorAll('.staff-only');
  
  if (user.role === 'Staff') {
    // Hide buttons for creating entities
    addButtons.forEach(btn => btn.style.display = 'none');
    adminOnly.forEach(btn => btn.style.display = 'none');
    staffOnly.forEach(btn => btn.style.display = '');
    // Hide Categories/Programs/Suppliers completely from sidebar
    if(document.querySelector('.nav-item[data-page="categories"]')) document.querySelector('.nav-item[data-page="categories"]').style.display = 'none';
    if(document.querySelector('.nav-item[data-page="programs"]')) document.querySelector('.nav-item[data-page="programs"]').style.display = 'none';
    if(document.querySelector('.nav-item[data-page="suppliers"]')) document.querySelector('.nav-item[data-page="suppliers"]').style.display = 'none';
  } else {
    addButtons.forEach(btn => btn.style.display = '');
    adminOnly.forEach(btn => {
      if (btn.style.flexDirection || btn.style.alignItems) {
        btn.style.display = 'flex';
      } else {
        btn.style.display = '';
      }
    });
    staffOnly.forEach(btn => btn.style.display = 'none');
    if(document.querySelector('.nav-item[data-page="categories"]')) document.querySelector('.nav-item[data-page="categories"]').style.display = '';
    if(document.querySelector('.nav-item[data-page="programs"]')) document.querySelector('.nav-item[data-page="programs"]').style.display = '';
    if(document.querySelector('.nav-item[data-page="suppliers"]')) document.querySelector('.nav-item[data-page="suppliers"]').style.display = '';
  }
}

function populateCategoryFilter() {
  const filter = document.getElementById('categoryFilter');
  if (!filter) return;
  const categories = ['all', ...new Set(inventory.map(i => i.category).filter(Boolean))];
  filter.innerHTML = categories.map(c =>
    `<option value="${c}">${c === 'all' ? 'All categories' : c}</option>`
  ).join('');
}

// ─── Status Logic ────────────────────────────────
function getStatus(item) {
  if (Number(item.stock) === 0) return ["Out of stock", "out-stock"];
  if (Number(item.stock) <= Number(item.threshold)) return ["Low stock", "low-stock"];
  return ["In stock", "in-stock"];
}

function getBarClass(item) {
  if (Number(item.stock) === 0) return "critical";
  if (Number(item.stock) <= Number(item.threshold)) return "warning";
  return "healthy";
}

// ─── Fetch & Render Inventory ────────────────────
const branchNameMap = [
  { match: 'kk nagar', short: 'KK Nagar Head Office' },
  { match: 'lake area', short: 'Lake Area Training Institute' },
  { match: 'alagarkoil', short: 'Alagarkoil Administrative Office' },
  { match: 'aruldoss', short: 'Aruldoss Puram Rehabilitation Center' },
  { match: 'alagar kovil', short: 'Alagar Kovil Registered Office' }
];

function getShortBranchName(dbName) {
  if (!dbName) return '';
  const lower = dbName.toLowerCase();
  const found = branchNameMap.find(b => lower.includes(b.match));
  return found ? found.short : dbName.split(',')[0].split('-')[0].trim();
}

async function loadBranches() {
  try {
    const branches = await cachedFetch('/branches');
    if (!branches) return;
    
    const globalSelect = document.getElementById('globalBranchSelector');
    const addItemBranch = document.getElementById('addItemBranch');
    const editItemBranch = document.getElementById('editItemBranch');
    const addUserBranch = document.getElementById('addUserBranch');
    const editUserBranch = document.getElementById('editUserBranch');
    const addMovementBranch = document.getElementById('addMovementBranch');
    
    const optionsHTML = branches.map(b => `<option value="${b.id}">${getShortBranchName(b.name)}</option>`).join('');
    
    if(globalSelect) globalSelect.innerHTML = '<option value="">All Branches</option>' + optionsHTML;
    if(addItemBranch) addItemBranch.innerHTML = '<option value="" disabled selected>Select Branch</option>' + optionsHTML;
    if(editItemBranch) editItemBranch.innerHTML = '<option value="" disabled selected>Select Branch</option>' + optionsHTML;
    if(addUserBranch) addUserBranch.innerHTML = '<option value="" disabled selected>Select Branch</option>' + optionsHTML;
    if(editUserBranch) editUserBranch.innerHTML = '<option value="" disabled selected>Select Branch</option>' + optionsHTML;
    if(addMovementBranch) addMovementBranch.innerHTML = '<option value="" disabled selected>Select Branch</option>' + optionsHTML;
    
    if (addItemBranch) {
      addItemBranch.addEventListener('change', (e) => {
        window.updateSupplierDropdowns(e.target.value);
        window.updateProgramDropdowns(e.target.value);
        if (document.getElementById('addItemSupplierInput')) document.getElementById('addItemSupplierInput').value = '';
        if (document.getElementById('addItemProgramInput')) document.getElementById('addItemProgramInput').value = '';
      });
    }
    if (editItemBranch) {
      editItemBranch.addEventListener('change', (e) => {
        window.updateSupplierDropdowns(e.target.value);
        window.updateProgramDropdowns(e.target.value);
        if (document.getElementById('editItemSupplierInput')) document.getElementById('editItemSupplierInput').value = '';
        if (document.getElementById('editItemProgramInput')) document.getElementById('editItemProgramInput').value = '';
      });
    }
    if(globalSelect) {
      globalSelect.onchange = async (e) => {
        globalSelectedBranch = e.target.value;
        invalidateCache(''); // invalidate all caches
        await Promise.all([loadSuppliers(), loadPrograms(), loadCategories()]);
        const activeNav = document.querySelector('.nav-item.active');
        if (activeNav) {
          switchPage(activeNav.dataset.page);
        } else {
          switchPage('dashboard');
        }
      };
    }
  } catch (err) {
    console.error("Could not load branches", err);
  }
}

async function loadInventory() {
  inventoryBody.innerHTML = skeletonRows(6, 4);
  // FIX 5: Reset alerts array before loadInventory fetch
  alerts = [];
  try {
    inventory = await cachedFetch('/inventory');
    
    try {
      const alertData = await cachedFetch('/inventory/alerts');
      alerts = alertData.map(i => ({
        id: i.id,
        name: i.name,
        text: `Minimum: ${i.threshold} ${i.unit}`,
        stock: i.stock === 0 ? 'Out of stock' : `${i.stock} left`,
        critical: i.stock === 0
      }));
      renderAlerts();
      countUp(document.getElementById('lowStockCount'), alerts.length, 600);
      const notifBadge = document.querySelector('.notification-btn span');
      if (notifBadge) {
        notifBadge.textContent = alerts.length;
        notifBadge.style.display = alerts.length > 0 ? 'flex' : 'none';
      }
      const cardBadge = document.querySelector('.alert-badge');
      if (cardBadge) cardBadge.textContent = alerts.length;
    } catch(err) {
      console.error('Failed to load alerts:', err);
    }
      
    populateCategoryFilter();
    renderTable();
    await loadRecentActivity();
    
    // Update dashboard numbers
    countUp(document.getElementById("totalItems"), inventory.length, 1000);
    countUp(document.getElementById("availableStock"), inventory.reduce((sum, i) => sum + i.stock, 0), 1000);
    
    // Load real inventory value from backend
    try {
      const metrics = await apiFetch('/dashboard/metrics');
      const valEl = document.getElementById('invValue');
      if (valEl && metrics.inventoryValue !== undefined) {
        valEl.textContent = new Intl.NumberFormat('en-IN', {
          style: 'currency', currency: 'INR', maximumFractionDigits: 0
        }).format(metrics.inventoryValue);
      }
    } catch(err) {
      console.error('Failed to load inventory value:', err);
    }
    
    if (typeof initCharts === 'function') initCharts();
    
    // Load deletion requests in background to populate badge/table
    loadRequests();
    
  } catch (err) {
    console.error("Failed to load inventory:", err);
  }
}

function populateDatalist(listId, items) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = items.map(i => `<option value="${i.name}">`).join('');
}

function setupAddNewHint(inputId, hintId, nameSpanId, type) {
  const input = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  const nameSpan = document.getElementById(nameSpanId);
  if (!input || !hint) return;

  input.addEventListener('input', () => {
    const val = input.value.trim();
    const listId = type === 'supplier' ? 'supplierDatalist' : 'programDatalist';
    const list = document.getElementById(listId);
    const existing = Array.from(list?.options || []).map(o => o.value.toLowerCase());
    if (val && !existing.includes(val.toLowerCase())) {
      nameSpan.textContent = val;
      hint.style.display = 'block';
    } else {
      hint.style.display = 'none';
    }
  });

  hint.addEventListener('click', async () => {
    const val = input.value.trim();
    if (!val) return;
    try {
      await apiFetch(type === 'supplier' ? '/suppliers' : '/programs', {
        method: 'POST',
        body: JSON.stringify({ name: val, description: '' })
      });
      invalidateCache(type === 'supplier' ? '/suppliers' : '/programs');
      type === 'supplier' ? await loadSuppliers() : await loadPrograms();
      hint.style.display = 'none';
      showToast(`✓ "${val}" added as new ${type}`);
    } catch(err) {
      showToast(`Error adding ${type}: ` + err.message);
    }
  });
}

let globalSuppliers = [];
let globalPrograms = [];

window.updateSupplierDropdowns = function(branchId = null) {
  const data = branchId ? globalSuppliers.filter(s => String(s.branch_id) === String(branchId)) : globalSuppliers;
  populateDatalist('supplierDatalist', data);
  const select = document.getElementById('movementSupplierSelect');
  if (select) {
    select.innerHTML = `<option value="">Select supplier...</option>` +
      data.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
  }
};

window.updateProgramDropdowns = function(branchId = null) {
  const data = branchId ? globalPrograms.filter(p => String(p.branch_id) === String(branchId)) : globalPrograms;
  populateDatalist('programDatalist', data);
  const select = document.getElementById('movementProgramSelect');
  if (select) {
    select.innerHTML = `<option value="">Select program...</option>` +
      data.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  }
};

async function loadSuppliers() {
  try {
    globalSuppliers = await cachedFetch('/suppliers');
    window.updateSupplierDropdowns();
  } catch(err) { console.error('Failed to load suppliers:', err); }
}

async function loadPrograms() {
  try {
    globalPrograms = await cachedFetch('/programs');
    window.updateProgramDropdowns();
  } catch(err) { console.error('Failed to load programs:', err); }
}

setupAddNewHint('addItemSupplierInput', 'addSupplierHint', 'newSupplierName', 'supplier');
setupAddNewHint('editItemSupplierInput', 'editSupplierHint', 'editNewSupplierName', 'supplier');
setupAddNewHint('addItemProgramInput', 'addProgramHint', 'newProgramName', 'program');
setupAddNewHint('editItemProgramInput', 'editProgramHint', 'editNewProgramName', 'program');

function getTimeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff/60) + ' min ago';
  if (diff < 86400) return Math.floor(diff/3600) + ' hr ago';
  return Math.floor(diff/86400) + ' day ago';
}

async function loadRecentActivity() {
  try {
    const res = await apiFetch('/inventory/movements?limit=5');
    const data = res.data || [];
    const feed = document.querySelector('.activity-list');
    if (!feed) return;
    if (!data.length) {
      feed.innerHTML = '<p style="padding:16px 22px;font-size:13px;color:var(--muted)">No recent activity.</p>';
      return;
    }
    feed.innerHTML = data.map(r => {
      const isIn = r.movement_type === 'IN' || r.type === 'INWARD';
      const timeAgo = getTimeAgo(new Date(r.created_at));
      return `<div class="activity-item">
        <div class="activity-icon ${isIn ? 'add' : 'send'}"><i data-lucide="${isIn ? 'arrow-down-to-line' : 'arrow-up-from-line'}"></i></div>
        <p><b>${r.inventory_items?.name || 'Unknown item'}</b> ${isIn ? 'stock received' : 'stock issued'}<span>${isIn ? '+' : '-'}${r.quantity} ${r.inventory_items?.unit || ''} by ${r.party_name}</span></p>
        <time>${timeAgo}</time>
      </div>`;
    }).join('');
    renderIcons(feed);
  } catch(err) {
    console.error('Failed to load activity:', err);
  }
}

window.changePage = (dir) => {
  currentPage += dir;
  renderTable();
};

function getCategoryIcon(category) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('clinic') || cat.includes('pharma') || cat.includes('med')) return 'cross';
  if (cat.includes('school') || cat.includes('educat') || cat.includes('station')) return 'book';
  if (cat.includes('program') || cat.includes('material')) return 'briefcase';
  return 'package';
}

function renderTable() {
  const term = search.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  const filtered = inventory.filter(item =>
    (cat === "all" || item.category === cat) &&
    `${item.name} ${item.category}`.toLowerCase().includes(term)
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  if (currentPage > totalPages && totalPages > 0) currentPage = 1;
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const currentUser = (() => {
    const token = localStorage.getItem('msc_token');
    try { return token ? JSON.parse(atob(token.split('.')[1])) : null; }
    catch(e) { return null; }
  })();
  const isAllBranches = currentUser && currentUser.role === 'Admin' && (!document.getElementById('globalBranchSelector') || !document.getElementById('globalBranchSelector').value);
  const theadTr = document.getElementById('inventoryTableHeader');
  if (theadTr) {
    if (isAllBranches) {
      theadTr.innerHTML = '<th scope="col">Item</th><th scope="col">Branch</th><th scope="col">Stock Level</th><th scope="col">Status</th><th scope="col">Last Updated</th>';
    } else {
      theadTr.innerHTML = '<th scope="col">Item</th><th scope="col">Stock Level</th><th scope="col">Status</th><th scope="col">Last Updated</th>';
    }
  }

  const mappedRows = paginated.map(item => {
    const [label, cls] = getStatus(item);
    const barCls = getBarClass(item);
    const fillPct = item.stock === 0 ? 0 : Math.min(Math.round(item.stock / (item.threshold * 2) * 100), 100);
    const imgHtml = item.product_photo_url
      ? `<img class="item-thumb" src="${item.product_photo_url}" alt="${item.name}" loading="lazy" style="object-fit:cover">`
      : `<div class="item-thumb" style="background:var(--teal-50);display:grid;place-items:center"><i data-lucide="${getCategoryIcon(item.category)}" style="width:16px;height:16px;color:var(--teal-600)"></i></div>`;
    
    const branchCol = isAllBranches ? `<td data-label="Branch"><span style="font-size:13px; color:var(--text-secondary); background:var(--bg-alt); padding:2px 6px; border-radius:4px;">${item.branch_name || 'All'}</span></td>` : '';
    
    return `<tr onclick="openItemDetail('${item.id}')" style="cursor: pointer;">
      <td data-label="Item"><div class="item-name-cell">${imgHtml}<div class="item-info"><strong>${item.name}</strong><span>${item.category}</span></div></div></td>
      ${branchCol}
      <td data-label="Stock"><div class="stock-bar"><div class="stock-bar-track"><div class="stock-bar-fill ${barCls}" style="width:${fillPct}%"></div></div><span>${item.stock} ${item.unit}</span></div></td>
      <td data-label="Status"><span class="status ${cls}">${label}</span></td>
      <td data-label="Added On">${new Date(item.created_at).toLocaleDateString()}</td>
    </tr>`;
  });

  let emptyHtml = '';
  if (inventory.length === 0) {
    emptyHtml = `<tr><td colspan="4">
      <div style="text-align:center;padding:64px 20px; animation: slideUpFade 0.6s ease;">
        <div style="width:72px;height:72px;border-radius:20px;background:var(--teal-50);display:grid;place-items:center;margin:0 auto 20px;box-shadow:0 12px 24px rgba(13,148,136,0.15)">
          <i data-lucide="box" style="width:32px;height:32px;color:var(--teal)"></i>
        </div>
        <h3 style="font:700 20px 'Outfit',sans-serif;color:var(--text);margin:0 0 24px">Your Inventory is Empty</h3>
        <button class="primary-btn admin-only" onclick="openModal()" style="margin:0 auto;height:44px;padding:0 20px;">
          <i data-lucide="plus" style="width:18px;height:18px;margin-right:6px"></i> Add First Item
        </button>
      </div>
    </td></tr>`;
  } else {
    emptyHtml = `<tr><td colspan="4">
      <div style="text-align:center;padding:64px 20px; animation: slideUpFade 0.6s ease;">
        <div style="width:64px;height:64px;border-radius:16px;background:var(--bg-alt);border:1px dashed var(--border);display:grid;place-items:center;margin:0 auto 16px">
          <i data-lucide="search-x" style="width:28px;height:28px;color:var(--muted)"></i>
        </div>
        <h3 style="font:600 16px 'Outfit',sans-serif;color:var(--text);margin:0 0 6px">No items match your search</h3>
        <p style="font-size:13px;color:var(--muted);margin:0">Try adjusting your filters or search terms.</p>
      </div>
    </td></tr>`;
  }

  inventoryBody.innerHTML = mappedRows.join("") || emptyHtml;

  itemCount.textContent = `Showing ${paginated.length} of ${filtered.length} item${filtered.length === 1 ? '' : 's'}`;

  const footer = document.querySelector('.card-footer');
  if (footer) {
    let pager = footer.querySelector('#pagerControls');
    if (!pager) { pager = document.createElement('div'); pager.id = 'pagerControls'; footer.appendChild(pager); }
    if (totalPages > 1) {
      pager.style.cssText = 'display:flex;gap:6px;align-items:center';
      pager.innerHTML = `
        <button onclick="changePage(-1)" style="border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;background:var(--white);cursor:pointer;" ${currentPage===1?'disabled':''}>←</button>
        <span style="font-size:12px;color:var(--muted)">${currentPage} / ${totalPages}</span>
        <button onclick="changePage(1)" style="border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;background:var(--white);cursor:pointer;" ${currentPage===totalPages?'disabled':''}>→</button>
      `;
    } else { pager.innerHTML = ''; }
  }

  renderIcons(inventoryBody);
  enforceRoles();
}

function showSuggestions(term) {
  if (!term || term.length < 1) {
    searchSuggestions.classList.remove('show');
    return;
  }
  const lower = term.toLowerCase();
  const matches = inventory
    .filter(i => i.name.toLowerCase().includes(lower) || i.category.toLowerCase().includes(lower))
    .slice(0, 6);

  if (!matches.length) {
    searchSuggestions.classList.remove('show');
    return;
  }

  searchSuggestions.innerHTML = matches.map(i => {
    const highlighted = i.name.replace(
      new RegExp(`(${term})`, 'gi'),
      '<span class="suggestion-highlight">$1</span>'
    );
    const [, cls] = getStatus(i);
    return `<div class="suggestion-item" onclick="selectSuggestion('${i.id}', '${i.name.replace(/'/g, "\\'")}')">
      <i data-lucide="${getCategoryIcon(i.category)}"></i>
      <div style="flex:1;min-width:0">
        <div>${highlighted}</div>
        <div style="font-size:11px;color:var(--muted)">${i.category}</div>
      </div>
      <span class="status ${cls}" style="font-size:10px">${i.stock} ${i.unit}</span>
    </div>`;
  }).join('');

  renderIcons(searchSuggestions);
  searchSuggestions.classList.add('show');
}

window.selectSuggestion = (id, name) => {
  search.value = name;
  searchSuggestions.classList.remove('show');
  handleSearchOrFilter();
  openItemDetail(id);
};

function renderInventorySection() {
  const term = search.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  const filtered = inventory.filter(item =>
    (cat === 'all' || item.category === cat) &&
    `${item.name} ${item.category}`.toLowerCase().includes(term)
  );
  const grid = document.querySelector('.inv-grid');
  if (!grid) return;
  grid.innerHTML = filtered.map(itemCard).join('') ||
    `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted);font-size:13px">No items match your search.</div>`;
  renderIcons(grid);
}

function renderAlerts() {
  const dashboardList = document.getElementById("alertList");
  if (dashboardList) {
    dashboardList.innerHTML = alerts.map(a => `
      <div class="alert-item">
        <div class="alert-dot${a.critical ? " critical" : ""}"></div>
        <p>${a.name}<span>${a.text}</span></p>
        <b class="${a.critical ? "critical" : ""}">${a.stock}</b>
      </div>`).join("") || '<p style="padding:20px;text-align:center;color:var(--muted);font-size:13px">All stock levels are healthy.</p>';
    renderIcons(dashboardList);
  }
  
  const navDropdown = document.getElementById("notificationDropdownList");
  if (navDropdown) {
    navDropdown.innerHTML = alerts.map(a => `
      <div class="alert-item" style="cursor:pointer; border-bottom:1px solid var(--border-light); padding:12px 16px; display:flex; align-items:center; gap:12px; margin:0; border-radius:0;" onclick="switchPage('inventory'); openItemDetail('${a.id}'); document.getElementById('notificationDropdown').style.display='none';">
        <div class="alert-dot${a.critical ? " critical" : ""}"></div>
        <div style="flex:1">
          <p style="margin:0; font:600 13px 'Inter',sans-serif; color:var(--text);">${a.name}</p>
          <span style="display:block; font-size:11px; color:var(--muted); margin-top:2px;">${a.text}</span>
        </div>
        <b style="font-size:12px; font-weight:600;" class="${a.critical ? "critical" : ""}">${a.stock}</b>
      </div>`).join("") || '<p style="padding:20px;text-align:center;color:var(--muted);font-size:13px;margin:0;">All stock levels are healthy.</p>';
  }
}

// ─── Inventory Card (for section page) ───────────
function itemCard(item) {
  const [label, cls] = getStatus(item);
  const imgHtml = item.product_photo_url
    ? `<img src="${item.product_photo_url}" alt="${item.name}" loading="lazy" style="object-fit:cover">`
    : `<span class="inv-icon-fallback"><i data-lucide="${getCategoryIcon(item.category)}"></i></span>`;
  return `<article class="inv-card" onclick="openItemDetail('${item.id}')" style="cursor: pointer;">
    <div class="inv-card-img">${imgHtml}</div>
    <div class="inv-card-body">
      <h4>${item.name}</h4>
      <div class="inv-card-meta"><span class="inv-card-cat">${item.category}</span><span class="status ${cls}">${label}</span></div>
      <div class="inv-card-row">
        <div class="inv-card-stock"><strong>${item.stock} ${item.unit}</strong><span>Current stock</span></div>
        <div class="inv-card-updated"><b>${new Date(item.created_at).toLocaleDateString()}</b></div>
      </div>
    </div>
  </article>`;
}

// ─── Movement Table ──────────────────────────────
window.movementPage = window.movementPage || { in: 1, out: 1 };
window.changeMovementPage = (type, delta) => {
  if (type === 'in') {
    window.movementPage.in += delta;
    if (window.movementPage.in < 1) window.movementPage.in = 1;
    switchPage('inward');
  } else {
    window.movementPage.out += delta;
    if (window.movementPage.out < 1) window.movementPage.out = 1;
    switchPage('outward');
  }
};

async function renderMovementTable(type) {
  try {
    const page = type === 'in' ? window.movementPage.in : window.movementPage.out;
    const res = await cachedFetch(`/inventory/movements?type=${type.toUpperCase()}&page=${page}&limit=20`);
    const data = res.data || [];
    const totalPages = res.totalPages || 1;
    const isIn = type === "in";
    
    const userStr = localStorage.getItem('msc_user');
    const user = userStr ? JSON.parse(userStr) : {};
    const canVoid = user.role === 'Admin';

    const rows = data
      .filter(r => !r.voided)
      .map(r => {
        const typeStr = (r.movement_type || r.type || '').toUpperCase();
        const isInward = typeStr === 'INWARD' || typeStr === 'IN';
        const sign = isInward ? '+' : '-';
        const icon = isInward ? 'arrow-down-to-line' : 'arrow-up-from-line';
        const typeClass = isInward ? 'in' : 'out';
        const itemName = r.inventory_items?.name || 'Unknown Item';
        const itemUnit = r.inventory_items?.unit || '';
        const partyName = r.party_name || '-';
        const refCode = r.reference_code || '-';
        const quantity = r.quantity || 0;
        const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '-';

        return `<tr>
          <td data-label="Reference">${refCode}</td>
          <td data-label="Item name">${itemName}</td>
          <td data-label="Quantity">
            <span class="movement-type ${typeClass}">
              <i data-lucide="${icon}"></i>
              ${sign}${quantity} ${itemUnit}
            </span>
          </td>
          <td data-label="${isIn ? 'Supplier' : 'Issued to'}">${partyName}</td>
          <td data-label="Date">${date}</td>
          ${canVoid ? `<td data-label="Actions">
            <div style="display:flex;gap:6px;justify-content:flex-end;">
              <button class="secondary-btn" style="height:28px;padding:0 10px;font-size:11px;color:var(--danger);border-color:var(--danger)"
                onclick="voidMovement('${r.id}')">Void</button>
            </div>
          </td>` : '<td data-label="Actions" style="display:none;"></td>'}
        </tr>`;
      }).join('');
    
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `
        <div class="pagination" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-top:1px solid var(--border-light)">
          <button class="secondary-btn" onclick="changeMovementPage('${type}', -1)" ${page <= 1 ? 'disabled' : ''}>Previous</button>
          <span style="font-size:13px; color:var(--muted)">Page ${page} of ${totalPages}</span>
          <button class="secondary-btn" onclick="changeMovementPage('${type}', 1)" ${page >= totalPages ? 'disabled' : ''}>Next</button>
        </div>
      `;
    }

    return `<div class="card section-panel"><div class="card-header"><div><h3>${isIn ? "Recent Receipts" : "Recent Issues"}</h3><p>${isIn ? "Latest supplies received" : "Latest supplies issued"}</p></div></div><div class="table-wrap"><table><thead><tr><th>Reference</th><th>Item name</th><th>Quantity</th><th>${isIn ? "Supplier" : "Issued to"}</th><th>Date</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:40px">No movements found.</td></tr>`}</tbody></table></div>${paginationHtml}</div>`;
  } catch (err) {
    return `<div class="alert-item"><div class="alert-dot critical"></div><p>Error loading movements<span>${err.message}</span></p></div>`;
  }
}

window.voidMovement = async (id) => {
  showConfirm(
    'Are you sure you want to void this movement? The stock will be reversed and a reversal entry will be created.',
    async () => {
      try {
        await apiFetch(`/movements/${id}/void`, { method: 'POST' });
        showToast('✓ Movement voided and stock reversed');
        await loadInventory();
        const activePage = document.querySelector('.nav-item.active')?.dataset.page;
        if (activePage) switchPage(activePage);
      } catch(err) {
        showToast('Error voiding movement: ' + err.message);
      }
    }
  );
};

window.deleteSupplier = async (id) => {
  showConfirm(
    'Are you sure you want to delete this supplier? This action cannot be undone.',
    async () => {
      try {
        await apiFetch(`/suppliers/${id}`, { method: 'DELETE' });
        showToast('✓ Supplier deleted successfully');
        invalidateCache('/suppliers');
        await loadSuppliers();
        const activePage = document.querySelector('.nav-item.active')?.dataset.page;
        if (activePage === 'suppliers') switchPage('suppliers');
      } catch(err) {
        showToast('Error deleting supplier: ' + err.message);
      }
    }
  );
};

window.deleteCategory = async (id) => {
  showConfirm(
    'Are you sure you want to delete this category? This action cannot be undone.',
    async () => {
      try {
        await apiFetch(`/categories/${id}`, { method: 'DELETE' });
        showToast('✓ Category deleted successfully');
        invalidateCache('/categories');
        await loadCategories();
        const activePage = document.querySelector('.nav-item.active')?.dataset.page;
        if (activePage === 'categories') switchPage('categories');
      } catch(err) {
        showToast('Error deleting category: ' + err.message);
      }
    }
  );
};

window.deleteProgram = async (id) => {
  showConfirm(
    'Are you sure you want to delete this program? This action cannot be undone.',
    async () => {
      try {
        await apiFetch(`/programs/${id}`, { method: 'DELETE' });
        showToast('✓ Program deleted successfully');
        invalidateCache('/programs');
        await loadPrograms();
        const activePage = document.querySelector('.nav-item.active')?.dataset.page;
        if (activePage === 'programs') switchPage('programs');
      } catch(err) {
        showToast('Error deleting program: ' + err.message);
      }
    }
  );
};


// ─── Section Page Data ───────────────────────────
const sectionData = {
  inventory: {
    title: "Inventory", subtitle: "Review all items and current stock availability.", action: `<button class="primary-btn section-add-item" id="sectAddItemBtn"><i data-lucide="plus"></i>Add new item</button>`,
    content: async () => `<div class="section-summary"><article class="mini-stat"><p>Total catalog items</p><h3>${inventory.length}</h3></article><article class="mini-stat"><p>Available items</p><h3>${inventory.filter(i => Number(i.stock) > 0).length}</h3></article><article class="mini-stat"><p>Needs attention</p><h3>${inventory.filter(i => Number(i.stock) <= Number(i.threshold)).length}</h3></article></div>
      <div class="card section-panel"><div class="card-header"><div><h3>All Inventory Items</h3><p>Full stock catalog with current status</p></div></div><div class="inv-grid">${inventory.map(itemCard).join("")}</div></div>`
  },
  inward: { title: "Stock Inward", subtitle: "Record and review items received by the trust.", action: `<button class="primary-btn" onclick="openMovementModal('IN')"><i data-lucide="plus"></i>Add inward entry</button>`, content: () => renderMovementTable("in") },
  outward: { title: "Stock Outward", subtitle: "Track supplies issued to programs and departments.", action: `<button class="primary-btn" onclick="openMovementModal('OUT')"><i data-lucide="plus"></i>Add outward entry</button>`, content: () => renderMovementTable("out") },
  categories: { title: "Categories", subtitle: "Understand how supplies are grouped across the trust.", action: `<button class="primary-btn section-add-entity" data-type="categories"><i data-lucide="plus"></i>Add category</button>`, content: null },
  programs: { title: "Programs", subtitle: "Monitor supply allocation across care and rehabilitation services.", action: `<button class="primary-btn section-add-entity" data-type="programs"><i data-lucide="plus"></i>Add program</button>`, content: null },
  suppliers: { title: "Suppliers", subtitle: "Keep vendor contacts and supply categories organized.", action: `<button class="primary-btn section-add-entity" data-type="suppliers"><i data-lucide="plus"></i>Add supplier</button>`, content: null },
  reports: {
      title: "Reports", subtitle: "Generate clear summaries for review and planning.", action: ``,
      content: async () => `<div class="report-grid">
        <article class="report-card" onclick="generateReport('inventory')"><i data-lucide="clipboard-list"></i><div><h3>Inventory summary</h3><p>Current quantities and stock status</p></div></article>
        <article class="report-card" onclick="generateReport('low_stock')"><i data-lucide="triangle-alert"></i><div><h3>Low stock report</h3><p>Items that need replenishment</p></div></article>
        <article class="report-card" onclick="generateReport('movements')"><i data-lucide="arrow-left-right"></i><div><h3>Movement history</h3><p>Monthly inward and outward records</p></div></article>
        <article class="report-card" onclick="generateReport('backup')"><i data-lucide="database-backup"></i><div><h3>Backup Data</h3><p>Save database and files to local zip</p></div></article>
      </div>`
    },
    priceHistory: {
      title: 'Price History',
      subtitle: 'Track unit price changes across all items.',
      action: '',
      content: async () => {
        try {
          const data = await cachedFetch('/inventory/price-history/all');
          if (!data || !data.length) return '<p style="text-align:center;color:var(--muted);padding:60px 0">No price changes recorded yet.</p>';
          return `<div class="card section-panel"><div class="table-wrap"><table>
            <thead><tr><th>Item</th><th>Category</th><th>Branch</th><th>Old Price</th><th>New Price</th><th>Quantity</th><th>Date</th></tr></thead>
            <tbody>${data.map(h => `<tr>
              <td>${h.item_name}</td><td>${h.category}</td><td>${h.branch_name || '-'}</td>
              <td>₹${h.old_unit_price ?? '-'}</td><td>₹${h.new_unit_price}</td>
              <td>${h.quantity_added}</td><td>${new Date(h.created_at).toLocaleDateString()}</td>
            </tr>`).join('')}</tbody>
          </table></div></div>`;
        } catch (err) {
          return `<p style="text-align:center;color:var(--danger);padding:60px 0">Error loading price history: ${err.message}</p>`;
        }
      }
    }
  };

// ─── Navigation ──────────────────────────────────
async function switchPage(page) {
  const btn = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (btn) {
    document.querySelector(".nav-item.active")?.classList.remove("active");
    btn.classList.add("active");
  } else {
    // If we're going to a sub-page without a nav item (e.g. inward/outward), remove active from others
    document.querySelector(".nav-item.active")?.classList.remove("active");
  }
  closeSidebar();

  if (page === "dashboard") {
    dashboard.hidden = false;
    sectionView.hidden = true;
    if(sectionUsers) sectionUsers.hidden = true; if(sectionBranches) sectionBranches.hidden = true;
    if(document.getElementById('sectionRequests')) document.getElementById('sectionRequests').hidden = true;
    pageHeading.textContent = "Inventory Dashboard";
    loadInventory();
  } else if (page === "branches") {
    dashboard.hidden = true;
    sectionView.hidden = true;
    if(sectionUsers) sectionUsers.hidden = true;
    if(sectionBranches) sectionBranches.hidden = false;
    if(document.getElementById('sectionRequests')) document.getElementById('sectionRequests').hidden = true;
    pageHeading.textContent = "Branch Management";
    renderBranchesTable();
  } else if (page === "users") {
    dashboard.hidden = true;
    sectionView.hidden = true;
    if(sectionUsers) sectionUsers.hidden = false;
    if(document.getElementById('sectionRequests')) document.getElementById('sectionRequests').hidden = true;
    pageHeading.textContent = "User Management";
    loadUsers();
  } else if (page === "requests") {
    dashboard.hidden = true;
    sectionView.hidden = true;
    if(sectionUsers) sectionUsers.hidden = true; if(sectionBranches) sectionBranches.hidden = true;
    if(document.getElementById('sectionRequests')) document.getElementById('sectionRequests').hidden = false;
    pageHeading.textContent = "Deletion Requests";
    loadRequests();
  } else {
    dashboard.hidden = true;
    if(sectionUsers) sectionUsers.hidden = true; if(sectionBranches) sectionBranches.hidden = true;
    if(document.getElementById('sectionRequests')) document.getElementById('sectionRequests').hidden = true;
    sectionView.hidden = false;
    const s = sectionData[page];
    pageHeading.textContent = s.title;
    
    sectionView.innerHTML = `
      <div class="section-intro"><div><p class="eyebrow">Inventory Management</p><h2>${s.title}</h2><p>${s.subtitle}</p></div><div id="sectionActionContainer">${s.action}</div></div>
      ${skeletonCards(4)}
    `;
    renderIcons(sectionView);

    let dynamicContent = "";
    try {
      if (page === 'categories') {
        const data = await cachedFetch('/categories');
        dynamicContent = `<div class="category-grid">${data.map(c => `<article class="category-card" style="position:relative"><div class="category-card-icon"><i data-lucide="shapes"></i></div><h3>${c.name}</h3><p>${c.description || 'No description'}</p><div style="position:absolute;top:16px;right:16px;display:flex;gap:8px;"><button class="icon-btn admin-only" onclick="editEntity('categories', '${c.id}', '${c.name.replace(/'/g, "\\'")}', '${(c.description || '').replace(/'/g, "\\'")}')" aria-label="Edit"><i data-lucide="pencil" style="width:16px;height:16px;color:var(--text-light)"></i></button><button class="icon-btn admin-only" onclick="deleteCategory('${c.id}')" aria-label="Delete"><i data-lucide="trash-2" style="width:16px;height:16px;color:var(--danger)"></i></button></div></article>`).join("") || '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">No categories found in database.</p>'}</div>`;
      } else if (page === 'programs') {
        const data = await cachedFetch('/programs');
        dynamicContent = `<div class="program-banner"><div><p class="eyebrow">M.S. Chellamuthu Trust & Research Foundation</p><h3>Mental Health for All</h3><p>Supporting affordable and accessible holistic care through well-supplied programs.</p></div><i data-lucide="heart-handshake"></i></div>
          <div class="program-grid">${data.map(p => `<article class="program-card">
            <div class="program-card-icon"><i data-lucide="heart-handshake"></i></div>
            <div style="flex:1"><h3>${p.name}</h3><p>${p.description || 'No description'}</p></div>
            <div style="display:flex;gap:8px;align-self:flex-start">
              <button class="icon-btn admin-only" onclick="editEntity('programs', '${p.id}', '${p.name.replace(/'/g, "\\'")}', '${(p.description || '').replace(/'/g, "\\'")}')" aria-label="Edit"><i data-lucide="pencil" style="width:16px;height:16px;color:var(--text-light)"></i></button>
              <button class="icon-btn admin-only" onclick="deleteProgram('${p.id}')" aria-label="Delete"><i data-lucide="trash-2" style="width:16px;height:16px;color:var(--danger)"></i></button>
            </div>
          </article>`).join("") || '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">No programs found in database.</p>'}</div>`;
      } else if (page === 'suppliers') {
        const data = await cachedFetch('/suppliers');
        dynamicContent = `<div class="card section-panel"><div class="card-header"><div><h3>Approved Suppliers</h3><p>Active suppliers supporting trust operations</p></div></div><div class="table-wrap"><table><thead><tr><th>Supplier name</th><th>Description</th><th>Added on</th><th></th></tr></thead><tbody>
          ${data.map(s => `<tr><td>${s.name}</td><td>${s.description || '-'}</td><td>${new Date(s.created_at).toLocaleDateString()}</td><td style="text-align:right"><button class="secondary-btn admin-only" onclick="deleteSupplier('${s.id}')" style="color:var(--danger);border-color:var(--danger);height:28px;padding:0 10px;font-size:11px;">Delete</button></td></tr>`).join("") || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">No suppliers found in database.</td></tr>'}
        </tbody></table></div></div>`;
      } else {
        dynamicContent = await s.content();
      }
    } catch (err) {
      dynamicContent = `<div class="alert-item" style="margin-top:20px"><div class="alert-dot critical"></div><p>Error connecting to backend<span>${err.message}.</span></p></div>`;
    }

    sectionView.innerHTML = `<div class="section-intro"><div><p class="eyebrow">Inventory Management</p><h2>${s.title}</h2><p>${s.subtitle}</p></div><div>${s.action}</div></div>${dynamicContent}`;
    
    // Role Enforcement hook for dynamically rendered buttons
    enforceRoles();
    
    sectionView.querySelector(".section-add-item")?.addEventListener("click", openModal);
    sectionView.querySelector(".section-add-entity")?.addEventListener("click", (e) => {
      window.openAddEntityModal(e.currentTarget.dataset.type);
    });
    
    // placeholder removed
    const backupBtn = sectionView.querySelector("#backupBtnTrigger");
    if (backupBtn) backupBtn.addEventListener("click", () => document.getElementById("backupModalBackdrop").classList.add("active"));
    renderIcons(sectionView);
  }

  const activeSection = page === 'dashboard' ? dashboard : page === 'users' ? sectionUsers : page === 'branches' ? sectionBranches : sectionView;
  if (activeSection) {
    activeSection.classList.remove('page-enter');
    void activeSection.offsetWidth; // force reflow
    activeSection.classList.add('page-enter');
  }
}

// ─── Toast (Redeclaration removed) ────────────────

// ─── Modal ───────────────────────────────────────
function openModal() {
  document.getElementById("addItemForm").reset();
  if (globalSelectedBranch) {
    const sel = document.getElementById('addItemBranch');
    if (sel) sel.value = globalSelectedBranch;
  }
  
  const sel = document.getElementById('addItemBranch');
  window.updateSupplierDropdowns(sel?.value);
  window.updateProgramDropdowns(sel?.value);
  
  modal.classList.add("active"); 
  document.querySelector('input[name="name"]')?.focus(); 
}
function closeModal() { 
  modal.classList.remove("active"); 
  const form = document.getElementById("addItemForm");
  if (form) {
    form.reset();
    form.querySelectorAll('input[type="file"]').forEach(input => {
      if (window.updateFileName) window.updateFileName(input);
    });
  }
}

// ─── Item Detail View ────────────────────────────
function openItemDetail(id) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;
  
  document.getElementById("itemDetailTitle").textContent = item.name;
  document.getElementById("itemDetailCategory").textContent = item.category;
  const branchSpan = document.getElementById("itemDetailBranch");
  const currentUser = (() => {
    const token = localStorage.getItem('msc_token');
    try { return token ? JSON.parse(atob(token.split('.')[1])) : null; }
    catch(e) { return null; }
  })();
  const branchContainer = document.getElementById('itemDetailBranchContainer');
  if (currentUser && currentUser.role === 'Admin' && (!document.getElementById('globalBranchSelector') || !document.getElementById('globalBranchSelector').value)) {
    branchSpan.textContent = item.branch_name || 'All Branches';
    branchContainer.style.display = 'flex';
  } else {
    branchContainer.style.display = 'none';
  }
  document.getElementById("detailStock").textContent = `${item.stock} ${item.unit}`;
  document.getElementById("detailThreshold").textContent = `${item.threshold} ${item.unit}`;
  document.getElementById("detailDate").textContent = new Date(item.created_at).toLocaleDateString();
  
  const photoContainer = document.getElementById("detailProductPhoto");
  if (item.product_photo_url) {
    photoContainer.innerHTML = `<img src="${item.product_photo_url}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover;">`;
  } else {
    photoContainer.innerHTML = `<i data-lucide="${getCategoryIcon(item.category)}" style="width: 32px; height: 32px; color: var(--teal-600)"></i>`;
  }
  
  const docsContainer = document.getElementById("detailDocuments");
  let docsHtml = '';
  if (item.bill_image_url) {
    const isPdf = item.bill_image_url.toLowerCase().endsWith('.pdf');
    docsHtml += `<button type="button" onclick="openDocumentViewer('${item.bill_image_url}', 'Bill Image', ${isPdf})" class="secondary-btn" style="height: 36px; padding: 0 12px; font-size: 13px;"><i data-lucide="receipt"></i> View Bill Image</button>`;
  }
  if (item.invoice_pdf_url) {
    const isPdf = item.invoice_pdf_url.toLowerCase().endsWith('.pdf');
    docsHtml += `<button type="button" onclick="openDocumentViewer('${item.invoice_pdf_url}', 'Invoice Copy', ${isPdf})" class="secondary-btn" style="height: 36px; padding: 0 12px; font-size: 13px;"><i data-lucide="file-text"></i> View Invoice PDF</button>`;
  }
  if (!item.bill_image_url && !item.invoice_pdf_url) {
    docsHtml = `<p style="color: var(--muted); font-size: 13px;">No documents attached.</p>`;
  }
  docsContainer.innerHTML = docsHtml;
  
  renderIcons(document.getElementById('itemDetailModalBackdrop'));
  document.getElementById("itemDetailModalBackdrop").classList.add("active");
  document.getElementById("itemDetailModalBackdrop").dataset.itemId = id;
  document.getElementById("itemDetailModalBackdrop").dataset.itemStock = item.stock;
  loadPriceHistory(id);
}

async function loadPriceHistory(itemId) {
  const container = document.getElementById('priceHistoryContainer');
  const chartDiv = document.getElementById('priceHistoryChart');
  const listDiv = document.getElementById('priceHistoryList');
  if (!container || !chartDiv || !listDiv) return;
  
  try {
    const data = await cachedFetch(`/inventory/${itemId}/price-history`);
    if (!data || data.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'block';
    
    // Sort chronological for chart
    const chartData = [...data].reverse();
    const dates = chartData.map(d => new Date(d.created_at).toLocaleDateString());
    const prices = chartData.map(d => d.new_unit_price);
    
    const chart = echarts.init(chartDiv);
    chart.setOption({
      tooltip: { trigger: 'axis', formatter: '₹{c}' },
      grid: { left: '10%', right: '5%', bottom: '15%', top: '10%' },
      xAxis: { type: 'category', data: dates },
      yAxis: { type: 'value', name: 'Price (₹)' },
      series: [{ data: prices, type: 'line', smooth: true, itemStyle: { color: '#0d9488' }, areaStyle: { color: 'rgba(13, 148, 136, 0.2)' } }]
    });
    
    // Table
    listDiv.innerHTML = `<table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px;">
      <thead>
        <tr style="text-align: left; border-bottom: 1px solid var(--border); color: var(--text-light);">
          <th style="padding: 6px 4px;">Date</th>
          <th style="padding: 6px 4px;">Qty Added</th>
          <th style="padding: 6px 4px;">Old Price</th>
          <th style="padding: 6px 4px;">New Price</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(row => `
          <tr style="border-bottom: 1px solid var(--border-light);">
            <td style="padding: 6px 4px;">${new Date(row.created_at).toLocaleDateString()}</td>
            <td style="padding: 6px 4px;">${row.quantity_added}</td>
            <td style="padding: 6px 4px;">₹${row.old_unit_price ?? '-'}</td>
            <td style="padding: 6px 4px;">₹${row.new_unit_price}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  } catch (err) {
    console.error('Failed to load price history:', err);
    container.style.display = 'none';
  }
}

function closeItemDetail() {
  document.getElementById("itemDetailModalBackdrop").classList.remove("active");
}

document.getElementById("closeDetailModal").addEventListener("click", closeItemDetail);
// document.getElementById("itemDetailModalBackdrop").addEventListener("click", e => {

//   if (e.target === document.getElementById("itemDetailModalBackdrop")) closeItemDetail();

// });

// ─── Edit & Delete Item ──────────────────────────
const editModal = document.getElementById("editItemModalBackdrop");
if (document.getElementById("editItemBtn")) {
  document.getElementById("editItemBtn").addEventListener("click", () => {
    const id = document.getElementById("itemDetailModalBackdrop").dataset.itemId;
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    
    document.getElementById("editItemId").value = item.id;
    document.getElementById("editName").value = item.name;
    document.getElementById("editCategory").value = item.category;
    document.getElementById("editUnit").value = item.unit;
    document.getElementById("editThreshold").value = item.threshold;
    const upEl = document.getElementById("editUnitPrice");
    if (upEl) upEl.value = item.unit_price || 0;
    const supplierInput = document.getElementById('editItemSupplierInput');
    if (supplierInput && item.default_supplier) {
      supplierInput.value = item.default_supplier;
    } else if (supplierInput) {
      supplierInput.value = '';
    }
    
    const programInput = document.getElementById('editItemProgramInput');
    if (programInput && item.program) {
      programInput.value = item.program;
    } else if (programInput) {
      programInput.value = '';
    }
    
    const branchInput = document.getElementById('editItemBranch');
    if (branchInput && item.branch_id) {
      branchInput.value = item.branch_id;
      window.updateSupplierDropdowns(item.branch_id);
      window.updateProgramDropdowns(item.branch_id);
    } else {
      window.updateSupplierDropdowns();
      window.updateProgramDropdowns();
    }
    
    closeItemDetail();
    if(editModal) editModal.classList.add("active");
  });
}

function closeEditModalFn() {
  if (editModal) editModal.classList.remove("active");
  const form = document.getElementById("editItemForm");
  if (form) {
    form.reset();
    form.querySelectorAll('input[type="file"]').forEach(input => {
      if (window.updateFileName) window.updateFileName(input);
    });
  }
}

if(document.getElementById("closeEditModal")) document.getElementById("closeEditModal").addEventListener("click", closeEditModalFn);
if(document.getElementById("cancelEditModal")) document.getElementById("cancelEditModal").addEventListener("click", closeEditModalFn);
// if(editModal) // editModal.addEventListener("click", e => { if (e.target === editModal) closeEditModalFn(); });

if (document.getElementById("requestDeletionBtn")) {
  document.getElementById("requestDeletionBtn").addEventListener("click", () => {
    const id = document.getElementById("itemDetailModalBackdrop").dataset.itemId;
    const stock = document.getElementById("itemDetailModalBackdrop").dataset.itemStock;
    const item = inventory.find(i => i.id === id);
    const buyPrice = item ? (item.unit_price || 0) : 0;
    requestDeletion(id, stock, buyPrice);
  });
}

if (document.getElementById("deleteItemBtn")) {
  document.getElementById("deleteItemBtn").addEventListener("click", async () => {
    const id = document.getElementById("itemDetailModalBackdrop").dataset.itemId;
    showConfirm("Are you sure you want to delete this item? This action cannot be undone.", async () => {
      try {
        await apiFetch(`/inventory/${id}`, { method: 'DELETE' });
        invalidateCache('/inventory');
        showToast("✓ Item deleted successfully");
        closeItemDetail();
        loadInventory();
        if(document.querySelector(".nav-item.active")?.dataset.page === 'inventory') switchPage('inventory');
      } catch (err) {
        alert("Error deleting item: " + err.message);
      }
    });
  });
}

if(document.getElementById("editItemForm")) {
  document.getElementById("editItemForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
    submitBtn.disabled = true;

    try {
      const d = new FormData(form);
      const id = d.get("itemId");
      
      const fileData = new FormData();
      let hasFiles = false;
      ['productPhoto', 'billImage', 'invoiceCopy'].forEach(field => {
        const file = d.get(field);
        if (file && file.size > 0) {
          fileData.append(field, file);
          hasFiles = true;
        }
      });

      let uploadedUrls = {};
      if (hasFiles) {
        submitBtn.innerHTML = '<span class="spinner"></span> Uploading files...';
        uploadedUrls = await apiFetch('/uploads', { method: 'POST', body: fileData });
      }

      submitBtn.innerHTML = '<span class="spinner"></span> Updating item...';
      const payload = {
        name: d.get("name"),
        category: d.get("category"),
        unit: d.get("unit"),
        threshold: d.get("threshold"),
        unit_price: d.get("unit_price"),
        branch_id: d.get("branch_id"),
        default_supplier: document.getElementById('editItemSupplierInput')?.value || null,
        program: document.getElementById('editItemProgramInput')?.value || null,
        ...(uploadedUrls.productPhotoUrl && { product_photo_url: uploadedUrls.productPhotoUrl }),
        ...(uploadedUrls.billImageUrl && { bill_image_url: uploadedUrls.billImageUrl }),
        ...(uploadedUrls.invoicePdfUrl && { invoice_pdf_url: uploadedUrls.invoicePdfUrl })
      };

      await apiFetch(`/inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      invalidateCache('/inventory');

      showToast("✓ Item updated successfully");
      editModal.classList.remove("active");
      
      loadInventory();
      if(document.querySelector(".nav-item.active")?.dataset.page === 'inventory') switchPage('inventory');

    } catch (err) {
      alert("Error updating item: " + err.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ─── Document Viewer ─────────────────────────────
function openDocumentViewer(url, title, isPdf) {
  document.getElementById("documentViewerTitle").textContent = title;
  document.getElementById("documentDownloadBtn").href = url;
  
  const content = document.getElementById("documentViewerContent");
  if (isPdf) {
    content.innerHTML = `<iframe src="${url}" width="100%" height="100%" style="border:none;"></iframe>`;
  } else {
    content.innerHTML = `<img src="${url}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
  }
  
  document.getElementById("documentViewerModalBackdrop").classList.add("active");
}

function closeDocumentViewer() {
  document.getElementById("documentViewerModalBackdrop").classList.remove("active");
  document.getElementById("documentViewerContent").innerHTML = ''; // Clear memory
}

if(document.getElementById("closeDocumentViewer")) document.getElementById("closeDocumentViewer").addEventListener("click", closeDocumentViewer);
if(document.getElementById("documentViewerModalBackdrop")) {
  // document.getElementById("documentViewerModalBackdrop").addEventListener("click", e => {

  //     if (e.target === document.getElementById("documentViewerModalBackdrop")) closeDocumentViewer();

  //   });
}

// FIRST-TIME SETUP CHECK
async function checkSetupRequired() {
  try {
    const res = await fetch(`${API_BASE}/auth/setup-required`);
    const result = await res.json();
    if (result.setupRequired) {
      localStorage.removeItem('msc_token');
      localStorage.removeItem('msc_user');
      
      document.getElementById('appShell').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('setupScreen').style.display = 'flex';
      
      // Add a CSS rule to force hide the login screen if apiFetch 401 tries to show it
      const style = document.createElement('style');
      style.innerHTML = '#loginScreen { display: none !important; }';
      document.head.appendChild(style);
      
      lucide.createIcons();
      return true;
    }
  } catch (err) {
    console.error('Setup check failed:', err);
  }
  return false;
}
checkSetupRequired();

// Setup form submit handler
document.getElementById('setupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('setupPassword').value;
  const confirmPassword = document.getElementById('setupConfirmPassword').value;
  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return;
  }
  const d = new FormData(e.target);
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Creating account...';
  submitBtn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: d.get('username'), password })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Setup failed');
    alert('Admin account created! You can now log in.');
    window.location.reload(); // Reload to remove the CSS override and show login
  } catch (err) {
    alert('Setup failed: ' + err.message);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

// ─── Login Form Submission ───────────────────────
document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  
  const inputs = e.target.querySelectorAll('input');
  const username = inputs[0].value;
  const password = inputs[1].value;
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  
  document.getElementById("loginErrorMsg").textContent = "";
  
  submitBtn.innerHTML = '<span class="spinner"></span> Signing in...';
  submitBtn.disabled = true;

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    localStorage.setItem('msc_token', data.token);
    localStorage.setItem('msc_user', JSON.stringify(data.user));
    
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("sessionExpiredMsg").style.display = "none";
    document.getElementById("appShell").style.display = "";
    
    const userRole = data.user.role;
    document.getElementById("profileAvatar").textContent = userRole.substring(0, 2).toUpperCase();
    document.getElementById("profileName").textContent = userRole;
    document.getElementById("profileRoleDesc").textContent = userRole === "Staff" ? "Inventory Staff" : "Store Manager";
    
    const dn = document.getElementById('dropdownName');
    const dr = document.getElementById('dropdownRole');
    if(dn) dn.textContent = data.user.username || userRole;
    if(dr) dr.textContent = userRole === 'Staff' ? 'Inventory Staff' : 'Store Manager';
    
    const hr = new Date().getHours();
    const greeting = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("greetingText").textContent = `${greeting}, ${userRole}`;
    
    enforceRoles();
    loadBranches();
    loadInventory();
    loadSuppliers();
    loadPrograms();
    loadCategories();
  } catch (err) {
    document.getElementById("loginErrorMsg").textContent = err.message;
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

// ─── Add Item Form Submission (with file uploads) 
if(document.getElementById("addItemForm")) {
  document.getElementById("addItemForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
    submitBtn.disabled = true;

    try {
      const d = new FormData(form);
      
      // 1. Upload files if any are selected
      const fileData = new FormData();
      let hasFiles = false;
      ['productPhoto', 'billImage', 'invoiceCopy'].forEach(field => {
        const file = d.get(field);
        if (file && file.size > 0) {
          fileData.append(field, file);
          hasFiles = true;
        }
      });

      let uploadedUrls = {};
      if (hasFiles) {
        submitBtn.innerHTML = '<span class="spinner"></span> Uploading files...';
        uploadedUrls = await apiFetch('/uploads', { method: 'POST', body: fileData });
      }

      // 2. Add inventory item
      submitBtn.innerHTML = '<span class="spinner"></span> Creating item...';
      const payload = {
        name: d.get("name"),
        category: d.get("category"),
        stock: d.get("stock"),
        unit: d.get("unit"),
        threshold: d.get("threshold"),
        unit_price: d.get("unit_price"),
        branch_id: d.get("branch_id"),
        default_supplier: document.getElementById('addItemSupplierInput')?.value || null,
        program: document.getElementById('addItemProgramInput')?.value || null,
        product_photo_url: uploadedUrls.productPhotoUrl || null,
        bill_image_url: uploadedUrls.billImageUrl || null,
        invoice_pdf_url: uploadedUrls.invoicePdfUrl || null
      };

      await apiFetch('/inventory', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      invalidateCache('/inventory');

      showToast("✓ Item added successfully");
      closeModal();
      
      // Refresh inventory if we are on dashboard or inventory page
      const activePage = document.querySelector(".nav-item.active")?.dataset.page;
      if (activePage === 'dashboard' || activePage === 'inventory') {
        loadInventory();
        if(activePage === 'inventory') switchPage('inventory');
      }

    } catch (err) {
      alert("Error adding item: " + err.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ─── Add Entity Modal (Suppliers, Programs, Categories) ──
window.openAddEntityModal = (type) => {
  const modal = document.getElementById("addEntityModalBackdrop");
  if (!modal) return;
  document.getElementById("addEntityForm").reset();
  document.getElementById("addEntityType").value = type;
  
  let title = "Add New";
  if (type === "suppliers") title = "Add Supplier";
  if (type === "programs") title = "Add Program";
  if (type === "categories") title = "Add Category";
  
  document.getElementById("addEntityModalTitle").textContent = title;
  modal.classList.add("active");
};

if (document.getElementById("addEntityModalBackdrop")) {
  const modal = document.getElementById("addEntityModalBackdrop");
  document.getElementById("closeAddEntityModal").addEventListener("click", () => modal.classList.remove("active"));
  document.getElementById("cancelAddEntityModal").addEventListener("click", () => modal.classList.remove("active"));
  // modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("active"); });
  
  document.getElementById("addEntityForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = document.getElementById("addEntitySubmitBtn");
    const originalText = submitBtn.textContent;
    
    submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
    submitBtn.disabled = true;
    
    try {
      const type = document.getElementById("addEntityType").value; // e.g. "suppliers"
      const payload = {
        name: document.getElementById("addEntityName").value,
        description: document.getElementById("addEntityDescription").value,
        branch_id: globalSelectedBranch || undefined
      };
      
      await apiFetch(`/${type}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      showToast(`✓ Added successfully`);
      invalidateCache(`/${type}`);
      
      // Reload logic
      if (type === "suppliers") await loadSuppliers();
      else if (type === "programs") await loadPrograms();
      
      // Refresh current page if needed
      const activePage = document.querySelector(".nav-item.active")?.dataset.page;
      if (activePage === type) switchPage(type);
      
      modal.classList.remove("active");
    } catch (err) {
      alert("Error adding item: " + err.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ─── Edit Entity Logic ─────────────────────────────
window.editEntity = (type, id, name, description) => {
  document.getElementById("editEntityForm").reset();
  document.getElementById("editEntityType").value = type;
  document.getElementById("editEntityId").value = id;
  document.getElementById("editEntityName").value = name;
  document.getElementById("editEntityDescription").value = description;
  const typeName = type.charAt(0).toUpperCase() + type.slice(1, -1);
  document.getElementById("editEntityModalEyebrow").textContent = "Update Setup";
  document.getElementById("editEntityModalTitle").textContent = `Edit ${typeName}`;
  document.getElementById("editEntityModalBackdrop").classList.add("active");
};

const editEntityModal = document.getElementById("editEntityModalBackdrop");
if (editEntityModal) {
  if (document.getElementById("closeEditEntityModal")) document.getElementById("closeEditEntityModal").addEventListener("click", () => editEntityModal.classList.remove("active"));
  if (document.getElementById("cancelEditEntityModal")) document.getElementById("cancelEditEntityModal").addEventListener("click", () => editEntityModal.classList.remove("active"));
  // // editEntityModal.addEventListener("click", e => { if (e.target === editEntityModal) editEntityModal.classList.remove("active"); });
  
  document.getElementById("editEntityForm").addEventListener("submit", async e => {
    e.preventDefault();
    const submitBtn = document.getElementById("editEntitySubmitBtn");
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
    submitBtn.disabled = true;
    try {
      const type = document.getElementById("editEntityType").value;
      const id = document.getElementById("editEntityId").value;
      const payload = {
        name: document.getElementById("editEntityName").value,
        description: document.getElementById("editEntityDescription").value
      };
      await apiFetch(`/${type}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast(`✓ Updated successfully`);
      invalidateCache(`/${type}`);
      if (type === "suppliers") await loadSuppliers();
      else if (type === "programs") await loadPrograms();
      else if (type === "categories") await loadCategories();
      const activePage = document.querySelector(".nav-item.active")?.dataset.page;
      if (activePage === type) switchPage(type);
      editEntityModal.classList.remove("active");
    } catch (err) {
      alert("Error updating item: " + err.message);
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ─── User Management ─────────────────────────────

async function loadCategories() {
  try {
    const data = await cachedFetch('/categories');
    const optionsHTML = '<option value="" disabled selected>Select Category</option>' + 
      data.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
      
    ['addItemCategory', 'editCategory'].forEach(id => {
      const select = document.getElementById(id);
      if (select) {
        const currentVal = select.value;
        select.innerHTML = optionsHTML;
        if (currentVal && data.find(c => c.name === currentVal)) {
          select.value = currentVal;
        }
      }
    });
  } catch (err) {
    console.error('Error loading categories for dropdown:', err);
  }
}

async function loadUsers() {
  document.getElementById('usersBody').innerHTML = skeletonRows(4, 5);
  try {
    const [data, branches] = await Promise.all([
      cachedFetch('/auth/users'),
      cachedFetch('/branches')
    ]);
    const branchMap = {};
    branches.forEach(b => branchMap[b.id] = b.name);
    
    const rows = data.map(u => `
      <tr>
        <td data-label="Username"><strong>${u.username}</strong></td>
        <td data-label="Role"><span class="status ${u.role === 'Admin' ? 'healthy' : 'in-stock'}">${u.role}</span></td>
        <td data-label="Branch">${u.branch_id ? (branchMap[u.branch_id] || u.branch_id) : '-'}</td>
        <td data-label="Added On">${new Date(u.created_at).toLocaleDateString()}</td>
        <td data-label="Actions" style="text-align:right;">
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="icon-btn" onclick="openEditUser('${u.id}', '${u.username}', '${u.role}', '${u.branch_id || ''}')" aria-label="Edit User" title="Edit User"><i data-lucide="pencil"></i></button>
            <button class="icon-btn" onclick="deleteUser('${u.id}')" aria-label="Delete User" title="Delete User"><i data-lucide="trash-2" style="color:var(--danger)"></i></button>
          </div>
        </td>
      </tr>
    `).join("");
    document.getElementById('usersBody').innerHTML = rows || `<tr><td colspan="5">
    <div style="text-align:center;padding:48px 20px">
      <div style="width:48px;height:48px;border-radius:12px;background:var(--teal-50);display:grid;place-items:center;margin:0 auto 12px"><i data-lucide="users" style="width:22px;height:22px;color:var(--teal)"></i></div>
      <p style="font:600 14px 'Outfit',sans-serif;color:var(--text);margin:0 0 4px">No users yet</p>
      <p style="font-size:12px;color:var(--muted);margin:0">Add your first staff account using the button above</p>
    </div>
  </td></tr>`;
    renderIcons(document.getElementById('usersBody'));
  } catch (err) {
    document.getElementById('usersBody').innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">Error loading users: ${err.message}</td></tr>`;
  }
}

const addUserModal = document.getElementById("addUserModalBackdrop");
if (document.getElementById("addUserBtn")) {
  document.getElementById("addUserBtn").addEventListener("click", () => {
    document.getElementById("addUserForm").reset();
    if (globalSelectedBranch) {
      const uSel = document.getElementById('addUserBranch');
      if (uSel) uSel.value = globalSelectedBranch;
    }
    addUserModal.classList.add("active");
  });
  document.getElementById("closeAddUserModal").addEventListener("click", () => addUserModal.classList.remove("active"));
  document.getElementById("cancelAddUserModal").addEventListener("click", () => addUserModal.classList.remove("active"));
  // // addUserModal.addEventListener("click", e => { if (e.target === addUserModal) addUserModal.classList.remove("active"); });
  
  document.getElementById("addUserForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = new FormData(e.target);
    const pwd = d.get('password');
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const ogText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="spinner"></span> Creating...';
    submitBtn.disabled = true;

    try {
      await apiFetch('/auth/users', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(d.entries()))
      });
      invalidateCache('/auth/users');
      showToast("✓ User created successfully");
      addUserModal.classList.remove("active");
      loadUsers();
    } catch(err) {
      alert("Error creating user: " + err.message);
    } finally {
      submitBtn.textContent = ogText;
      submitBtn.disabled = false;
    }
  });
}

const editUserModal = document.getElementById("editUserModalBackdrop");
if (editUserModal) {
  window.openEditUser = (id, username, role, branchId) => {
    document.getElementById("editUserId").value = id;
    document.getElementById("editUserUsername").value = username;
    document.getElementById("editUserRole").value = role;
    document.getElementById("editUserPassword").value = '';
    const bSel = document.getElementById("editUserBranch");
    if (bSel && branchId) bSel.value = branchId;
    editUserModal.classList.add("active");
  };
  
  document.getElementById("closeEditUserModal").addEventListener("click", () => editUserModal.classList.remove("active"));
  document.getElementById("cancelEditUserModal").addEventListener("click", () => editUserModal.classList.remove("active"));
  // // editUserModal.addEventListener("click", e => { if (e.target === editUserModal) editUserModal.classList.remove("active"); });

  document.getElementById("editUserForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = new FormData(e.target);
    const id = d.get('userId');
    const pwd = d.get('password');
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const ogText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
    submitBtn.disabled = true;

    try {
      const payload = { username: d.get('username'), role: d.get('role'), branch_id: d.get('branch_id') };
      if (pwd) payload.password = pwd;

      await apiFetch(`/auth/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      invalidateCache('/auth/users');
      showToast("✓ User updated successfully");
      editUserModal.classList.remove("active");
      loadUsers();
    } catch(err) {
      alert("Error updating user: " + err.message);
    } finally {
      submitBtn.textContent = ogText;
      submitBtn.disabled = false;
    }
  });
}

window.deleteUser = async (id) => {
  // FIX 3: Replace all confirm() dialogs with a custom modal
  showConfirm("Are you sure you want to delete this user? This action cannot be undone.", async () => {
    try {
      await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
      invalidateCache('/auth/users');
      showToast("✓ User deleted successfully");
      loadUsers();
    } catch (err) {
      alert("Error deleting user: " + err.message);
    }
  });
};

// ─── Stock Movement Logic ────────────────────────
const movementModal = document.getElementById("addMovementModalBackdrop");
if (movementModal) {
  function updateMovementItemDropdown() {
    const select = document.getElementById("movementItemSelect");
    const branchId = document.getElementById('addMovementBranch')?.value;
    
    // Filter inventory based on selected branch. If no branch is selected, show NO items to prevent wrong-branch selection.
    const filteredInventory = branchId ? inventory.filter(i => String(i.branch_id) === String(branchId)) : [];
    
    select.innerHTML = '<option value="">Select an item...</option>' + 
      filteredInventory.map(i => `<option value="${i.id}">${i.name} (Stock: ${i.stock} ${i.unit})</option>`).join('');
  }

  const addMovementBranch = document.getElementById('addMovementBranch');
  if (addMovementBranch) {
    addMovementBranch.addEventListener('change', () => {
      updateMovementItemDropdown();
      document.getElementById("movementItemSelect").value = "";
      
      const branchId = addMovementBranch.value;
      window.updateSupplierDropdowns(branchId);
      window.updateProgramDropdowns(branchId);
      if (document.getElementById('movementSupplierSelect')) document.getElementById('movementSupplierSelect').value = '';
      if (document.getElementById('movementProgramSelect')) document.getElementById('movementProgramSelect').value = '';
    });
  }

  window.openMovementModal = async (type) => {
    await loadInventory(); // Ensure inventory list is fully up-to-date
    document.getElementById("addMovementForm").reset();
    document.getElementById("movementType").value = type;
    
    const isIn = type === 'IN';
    document.getElementById("movementModalEyebrow").textContent = isIn ? "Stock Inward" : "Stock Outward";
    document.getElementById("movementModalTitle").textContent = isIn ? "Add Receipt" : "Issue Supplies";
    document.getElementById('supplierField').style.display = isIn ? 'block' : 'none';
    document.getElementById('programField').style.display = isIn ? 'none' : 'block';
    
    const recipientField = document.getElementById('recipientField');
    if (recipientField) recipientField.style.display = isIn ? 'none' : 'block';
    const inwardFilesField = document.getElementById('inwardFilesField');
    if (inwardFilesField) inwardFilesField.style.display = isIn ? 'block' : 'none';
    const totalPriceField = document.getElementById('totalPriceField');
    if (totalPriceField) totalPriceField.style.display = isIn ? 'block' : 'none';

    // Set the correct select as required
    document.getElementById('movementSupplierSelect').required = isIn;
    document.getElementById('movementProgramSelect').required = false; // Program is always optional
    document.getElementById("movementSubmitBtn").textContent = isIn ? "Save Entry" : "Issue Stock";

    if (globalSelectedBranch) {
      const bSel = document.getElementById('addMovementBranch');
      if (bSel) bSel.value = globalSelectedBranch;
    }

    const userStr = localStorage.getItem('msc_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const isStaff = user && user.role === 'Staff';
    
    const bSel = document.getElementById('addMovementBranch');
    if (bSel) {
      if (isStaff) {
        bSel.disabled = true;
        // Ensure their branch is selected if they have one assigned
        if (user.branch_id) bSel.value = user.branch_id;
      } else {
        bSel.disabled = false;
      }
    }

    // Populate filtered items after branch has been set
    updateMovementItemDropdown();
    const branchId = bSel ? bSel.value : null;
    window.updateSupplierDropdowns(branchId);
    window.updateProgramDropdowns(branchId);

    movementModal.classList.add("active");
  };

  if(document.getElementById("closeMovementModal")) document.getElementById("closeMovementModal").addEventListener("click", () => movementModal.classList.remove("active"));
  if(document.getElementById("cancelMovementModal")) document.getElementById("cancelMovementModal").addEventListener("click", () => movementModal.classList.remove("active"));
  // // movementModal.addEventListener("click", e => { if (e.target === movementModal) movementModal.classList.remove("active"); });

  if(document.getElementById("addMovementForm")) {
    document.getElementById("addMovementForm").addEventListener("submit", async e => {
      e.preventDefault();
      const d = new FormData(e.target);
      const submitBtn = document.getElementById("movementSubmitBtn");
      const ogText = submitBtn.textContent;
      submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
      submitBtn.disabled = true;

      try {
        let uploadedUrls = {};
        if (d.get('type') === 'INWARD' && (d.get('productPhoto')?.size > 0 || d.get('invoiceCopy')?.size > 0)) {
          const uploadRes = await fetch('/api/uploads', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('msc_token') },
            body: d
          });
          if (uploadRes.ok) uploadedUrls = await uploadRes.json();
        }

        await apiFetch('/movements', {
          method: 'POST',
          body: JSON.stringify({
            inventory_id: d.get('inventory_id'),
            type: d.get('type'),
            quantity: Number(d.get('quantity')),
            party_name: (() => {
              const supSel = document.getElementById('movementSupplierSelect');
              const progSel = document.getElementById('movementProgramSelect');
              if (d.get('type') === 'INWARD' && supSel && supSel.selectedIndex > 0) return supSel.options[supSel.selectedIndex].text;
              if (d.get('type') === 'OUTWARD' && progSel && progSel.selectedIndex > 0) return progSel.options[progSel.selectedIndex].text;
              return d.get('party_name');
            })(),
            recipient_name: d.get('recipient_name') || undefined,
            reference_code: d.get('reference_code'),
            notes: d.get('notes'),
            branch_id: document.getElementById('addMovementBranch')?.value || undefined,
            product_photo_url: uploadedUrls.productPhotoUrl,
            invoice_pdf_url: uploadedUrls.invoicePdfUrl
          })
        });
        invalidateCache('/inventory');
        invalidateCache('/movements');
        showToast("✓ Stock movement recorded");
        movementModal.classList.remove("active");
        
        await loadInventory(); // refresh counts
        
        const activePage = document.querySelector(".nav-item.active")?.dataset.page;
        if (activePage) switchPage(activePage); // refresh the movement table UI

      } catch(err) {
        alert("Error saving movement: " + err.message);
      } finally {
        submitBtn.textContent = ogText;
        submitBtn.disabled = false;
      }
    });
  }
}

// ─── Bindings ────────────────────────────────────
// FIX: password toggle
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('passwordInput');
const toggleIcon = document.getElementById('toggleIcon');

if (togglePassword && passwordInput) {
  togglePassword.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
    lucide.createIcons({ nodes: [toggleIcon] });
  });
}
// FIX: render eye icon on login screen
lucide.createIcons({ nodes: document.querySelectorAll('#toggleIcon') });
const mobileSearchBtn = document.getElementById('mobileSearchBtn');
const mobileSearchBar = document.getElementById('mobileSearchBar');
const mobileSearchInput = document.getElementById('mobileSearch');
if (mobileSearchBtn) {
  mobileSearchBtn.addEventListener('click', () => {
    const isOpen = mobileSearchBar.style.display === 'block';
    mobileSearchBar.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) mobileSearchInput.focus();
  });
  mobileSearchInput.addEventListener('input', () => {
    search.value = mobileSearchInput.value;
    renderTable();
  });
}
const profileTrigger = document.getElementById('profileTrigger');
const profileDropdown = document.getElementById('profileDropdown');
if (profileTrigger) {
  profileTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = profileDropdown.style.display === 'block';
    profileDropdown.style.display = isOpen ? 'none' : 'block';
  });
  document.addEventListener('click', () => { profileDropdown.style.display = 'none'; });
}

if(document.getElementById("addItemBtn")) document.getElementById("addItemBtn").addEventListener("click", openModal);
if(document.getElementById("quickAdd")) document.getElementById("quickAdd").addEventListener("click", openModal);
if(document.getElementById("closeModal")) document.getElementById("closeModal").addEventListener("click", closeModal);
if(document.getElementById("cancelModal")) document.getElementById("cancelModal").addEventListener("click", closeModal);
// backdrop click to close is disabled for Add Item per request
// if(modal) modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

const backupModal = document.getElementById("backupModalBackdrop");
if(document.getElementById("closeBackupModal")) document.getElementById("closeBackupModal").addEventListener("click", () => backupModal.classList.remove("active"));
// if(backupModal) // backupModal.addEventListener("click", e => { if (e.target === backupModal) backupModal.classList.remove("active"); });
document.getElementById('backupLocalBtn')?.addEventListener('click', async () => {
  try {
    const token = localStorage.getItem('msc_token');
    const response = await fetch(`${API_BASE}/reports/backup`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: 'local' })
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: `msc-backup-${Date.now()}.json`
    }).click();
    URL.revokeObjectURL(url);
    showToast('✓ Backup downloaded successfully');
    backupModal.classList.remove('active');
  } catch(err) { showToast('Backup failed: ' + err.message); }
});

document.getElementById('backupDriveBtn')?.addEventListener('click', () => {
  showToast('Google Drive backup coming soon');
  backupModal.classList.remove('active');
});


document.addEventListener("keydown", e => { 
  if (e.key === "Escape") {
    if (searchSuggestions) searchSuggestions.classList.remove('show');
    if (modal && modal.classList.contains("active")) closeModal();
    if (backupModal && backupModal.classList.contains("active")) backupModal.classList.remove("active");
    if (document.getElementById("documentViewerModalBackdrop")?.classList.contains("active")) closeDocumentViewer();
    else if (document.getElementById("itemDetailModalBackdrop")?.classList.contains("active")) closeItemDetail();
    if (editModal && editModal.classList.contains("active")) editModal.classList.remove("active");
    if (addUserModal && addUserModal.classList.contains("active")) addUserModal.classList.remove("active");
    if (editUserModal && editUserModal.classList.contains("active")) editUserModal.classList.remove("active");
    if (movementModal && movementModal.classList.contains("active")) movementModal.classList.remove("active");
  }
});

function handleSearchOrFilter() {
  currentPage = 1;
  renderTable();
  const activePage = document.querySelector('.nav-item.active')?.dataset.page;
  if (activePage === 'inventory') renderInventorySection();
}

if(categoryFilter) categoryFilter.addEventListener("change", handleSearchOrFilter);
if(search) {
  search.addEventListener('input', () => {
    handleSearchOrFilter();
    showSuggestions(search.value.trim());
  });
}

document.addEventListener('click', e => {
  if (!e.target.closest('.search-box')) {
    searchSuggestions.classList.remove('show');
  }
});

document.getElementById('exportBtn')?.addEventListener('click', () => {
  if (typeof window.generateReport === 'function') {
    window.generateReport('inventory');
  } else {
    showToast('Error: Report generation not ready.');
  }
});

document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => switchPage(b.dataset.page)));

const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");
function openSidebar() { sidebar.classList.add("open"); menuBtn.classList.add("active"); overlay.classList.add("show"); }
function closeSidebar() { sidebar.classList.remove("open"); menuBtn.classList.remove("active"); overlay.classList.remove("show"); }
if(menuBtn) menuBtn.addEventListener("click", () => sidebar.classList.contains("open") ? closeSidebar() : openSidebar());
if(overlay) overlay.addEventListener("click", closeSidebar);
sidebar.querySelectorAll(".nav-item").forEach(n => n.addEventListener("click", closeSidebar));

if(document.getElementById("fabAdd")) document.getElementById("fabAdd").addEventListener("click", openModal);
if (document.getElementById("notificationTrigger")) {
  const trigger = document.getElementById("notificationTrigger");
  const dropdown = document.getElementById("notificationDropdown");
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== trigger) {
      dropdown.style.display = "none";
    }
  });
}

// FIX 1: Logout button wiring
if (document.getElementById('logoutBtn')) {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('msc_token');
    localStorage.removeItem('msc_user');
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginForm').reset();
    showToast('You have been signed out.');
  });
}

// ─── Number Counter Animation ────────────────────
function countUp(el, target, duration = 1200) {
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = target.toLocaleString("en-IN"); return; }
  el.textContent = "0";
  const start = performance.now();
  const update = t => {
    const p = Math.min((t - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4))).toLocaleString("en-IN");
    if (p < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ─── Custom File Upload Handler ──────────────────
window.updateFileName = function(input) {
  const box = input.parentElement.querySelector('.file-name');
  const wrapper = input.parentElement.querySelector('.file-upload-box');
  if (box && wrapper) {
    if (input.files && input.files.length > 0) {
      box.textContent = input.files[0].name;
      wrapper.style.borderColor = 'var(--teal)';
      wrapper.style.color = 'var(--teal)';
      wrapper.style.backgroundColor = '#f0fdfa';
    } else {
      // Revert based on input name
      if (input.name === 'productPhoto') box.textContent = 'Click to upload image';
      else if (input.name === 'billImage') box.textContent = 'Click to upload bill';
      else if (input.name === 'invoiceCopy') box.textContent = 'Click to upload invoice';
      
      wrapper.style.borderColor = '';
      wrapper.style.color = '';
      wrapper.style.backgroundColor = '';
    }
  }
};

// ─── Initialization ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
});

// ─── Reports Generation ──────────────────────────
function downloadCSV(filename, rows) {
  if (!rows || !rows.length) return showToast("No data available to export");
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map(row => headers.map(header => {
      let val = row[header] === null || row[header] === undefined ? '' : row[header];
      val = val.toString().replace(/"/g, '""');
      return `"${val}"`;
    }).join(','))
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

window.generateReport = async (type) => {
  showToast("Generating report...");
  const token = localStorage.getItem('msc_token');
  if (!token) return showToast('Error: You are not logged in.');

  try {
    if (type === 'inventory') {
      window.open(`/api/reports/inventory-summary?token=${token}`, '_blank');
      showToast("✓ Report generated");
    } else if (type === 'low_stock') {
      window.open(`/api/reports/low-stock?token=${token}`, '_blank');
      showToast("✓ Report generated");
    } else if (type === 'movements') {
      const modal = document.getElementById('movementReportModalBackdrop');
      if (modal) modal.classList.add('active');
    } else if (type === 'backup') {
      window.open(`/api/reports/backup-zip?token=${token}`, '_blank');
      showToast("✓ Backup initiated");
    }
  } catch (err) {
    showToast("Error generating report: " + err.message);
  }
};

const closeMovementReportModal = document.getElementById('closeMovementReportModal');
const cancelMovementReportModal = document.getElementById('cancelMovementReportModal');
const movementReportModalBackdrop = document.getElementById('movementReportModalBackdrop');
const movementReportForm = document.getElementById('movementReportForm');

if (closeMovementReportModal) closeMovementReportModal.addEventListener('click', () => movementReportModalBackdrop.classList.remove('active'));
if (cancelMovementReportModal) cancelMovementReportModal.addEventListener('click', () => movementReportModalBackdrop.classList.remove('active'));

if (movementReportForm) {
  movementReportForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const month = document.getElementById('movementReportMonth').value;
    const year = document.getElementById('movementReportYear').value;
    const token = localStorage.getItem('msc_token');
    window.open(`/api/reports/movements?month=${month}&year=${year}&token=${token}`, '_blank');
    movementReportModalBackdrop.classList.remove('active');
    showToast("✓ Report generated");
  });
}

// Role select branch required logic
const addUserRole = document.getElementById("addUserRole");
const addUserBranch = document.getElementById("addUserBranch");
if (addUserRole && addUserBranch) {
  addUserRole.addEventListener("change", (e) => {
    addUserBranch.required = e.target.value === "Staff";
  });
  addUserBranch.required = addUserRole.value === "Staff";
}

const editUserRole = document.getElementById("editUserRole");
const editUserBranch = document.getElementById("editUserBranch");
if (editUserRole && editUserBranch) {
  editUserRole.addEventListener("change", (e) => {
    editUserBranch.required = e.target.value === "Staff";
  });
  editUserBranch.required = editUserRole.value === "Staff";
}

// ─── Deletion Requests ─────────────────────────────
async function loadRequests() {
  const tbody = document.getElementById("requestsTableBody");
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)">Loading...</td></tr>';
  try {
    const url = new URL(`${API_BASE}/inventory/deletion-requests/all`, window.location.origin);
    const filterBranch = document.getElementById("branchFilter")?.value;
    const token = localStorage.getItem('msc_token');
    
    // Parse user role
    let userRole = '';
    if(token) {
      try { userRole = JSON.parse(atob(token.split('.')[1])).role; } catch(e) {}
    }
    
    if (filterBranch && userRole === 'Admin') url.searchParams.append('branch_id', filterBranch);
    
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load requests");
    
    if(userRole === 'Admin') {
      const pendingCount = data.filter(r => r.status === 'pending').length;
      const badge = document.getElementById("adminPendingRequestsBadge");
      if(badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? "inline-block" : "none";
      }
    }
    
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)">No requests found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.map(req => {
      const date = new Date(req.requested_at).toLocaleDateString();
      let statusColor = "var(--text-secondary)";
      if(req.status === 'pending') statusColor = "var(--amber)";
      else if(req.status === 'approved') statusColor = "var(--teal)";
      else if(req.status === 'rejected') statusColor = "var(--danger)";
      
      let actions = '';
      if(req.status === 'pending' && userRole === 'Admin') {
        actions = `
          <button class="icon-btn" onclick="approveDeletion('${req.id}')" title="Approve" style="color:var(--teal)"><i data-lucide="check"></i></button>
          <button class="icon-btn" onclick="rejectDeletion('${req.id}')" title="Reject" style="color:var(--danger)"><i data-lucide="x"></i></button>
        `;
      }
      
      let reasonHtml = `<span style="font-size:12px; font-weight:500; text-transform:capitalize;">${req.reason || 'N/A'}</span>`;
      
      const formatDetails = (details) => {
        if (!details) return '';
        const maxLen = 60;
        if (details.length > maxLen) {
          const truncated = details.substring(0, maxLen) + '...';
          const safeDetails = encodeURIComponent(details);
          return `<span style="cursor:pointer; color:var(--teal-600); text-decoration:underline" title="View full notes" onclick="showInfoModal(decodeURIComponent('${safeDetails}'))">${truncated}</span>`;
        }
        return details;
      };

      if (req.reason === 'resale') {
        reasonHtml += `<br><span style="font-size:11px; color:var(--text-light)">Buy Price: ₹${req.item_buy_price || 0} | Resale: ₹${req.resale_price}</span>`;
        if (req.reason_details) reasonHtml += `<br><span style="font-size:11px; color:var(--text-light)">Notes: ${formatDetails(req.reason_details)}</span>`;
      } else if (req.reason === 'other' && req.reason_details) {
        reasonHtml += `<br><span style="font-size:11px; color:var(--text-light)">${formatDetails(req.reason_details)}</span>`;
      } else if (req.reason === 'mistake') {
        reasonHtml = `<span style="font-size:12px; font-weight:500;">Mistake</span>`;
      } else if (req.reason === 'scrap') {
        reasonHtml = `<span style="font-size:12px; font-weight:500;">Scrap</span>`;
      }
      
      return `<tr>
        <td data-label="Item"><div style="display:flex;align-items:center;gap:12px;"><img src="${req.product_photo_url || 'https://images.unsplash.com/photo-1584308666744-24d5e47854f9?w=100&q=80'}" alt="${req.item_name}" style="width:36px;height:36px;border-radius:var(--radius-sm);object-fit:cover;"><span style="font-weight:500;color:var(--text)">${req.item_name}</span></div></td>
        <td data-label="Requested By">${req.requested_by_name}</td>
        <td data-label="Branch">${req.branch_name}</td>
        <td data-label="Qty"><strong>${req.quantity || 'All'}</strong></td>
        <td data-label="Reason">${reasonHtml}</td>
        <td data-label="Status"><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${statusColor}20;color:${statusColor};text-transform:capitalize;">${req.status}</span></td>
        <td data-label="Date">${date}</td>
        <td data-label="Actions" class="text-right" style="text-align:right;">${actions}</td>
      </tr>`;
    }).join('');
    lucide.createIcons();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

const deletionRequestModalBackdrop = document.getElementById('deletionRequestModalBackdrop');
const closeDeletionRequestModal = document.getElementById('closeDeletionRequestModal');
const cancelDeletionRequestModal = document.getElementById('cancelDeletionRequestModal');
const deletionRequestForm = document.getElementById('deletionRequestForm');
const delReqReason = document.getElementById('delReqReason');
const delReqPriceWrapper = document.getElementById('delReqPriceWrapper');
const delReqPrice = document.getElementById('delReqPrice');
const delReqDetailsWrapper = document.getElementById('delReqDetailsWrapper');
const delReqDetailsLabel = document.getElementById('delReqDetailsLabel');
const delReqDetails = document.getElementById('delReqDetails');
const delReqItemId = document.getElementById('delReqItemId');

const delReqQuantity = document.getElementById('delReqQuantity');
const delReqMaxStock = document.getElementById('delReqMaxStock');

function closeDeletionRequestModalFunc() {
  deletionRequestModalBackdrop.classList.remove('active');
  deletionRequestForm.reset();
  delReqPriceWrapper.style.display = 'none';
  delReqPrice.required = false;
  delReqDetailsWrapper.style.display = 'none';
  delReqDetails.required = false;
}

if (closeDeletionRequestModal) closeDeletionRequestModal.addEventListener('click', closeDeletionRequestModalFunc);
if (cancelDeletionRequestModal) cancelDeletionRequestModal.addEventListener('click', closeDeletionRequestModalFunc);

function requestDeletion(itemId, maxStock = 1, buyPrice = 0) {
  delReqItemId.value = itemId;
  delReqMaxStock.value = maxStock;
  if(delReqQuantity) {
    delReqQuantity.max = maxStock;
    delReqQuantity.value = maxStock;
  }
  
  window.currentDelReqBuyPrice = buyPrice;
  const buyPriceDisplay = document.getElementById('delReqBuyPriceDisplay');
  if (buyPriceDisplay && delReqQuantity) {
    const qty = parseInt(delReqQuantity.value) || 0;
    buyPriceDisplay.textContent = `₹${(buyPrice * qty).toFixed(2)}`;
  }
  
  deletionRequestModalBackdrop.classList.add('active');
}

if (delReqReason) {
  delReqReason.addEventListener('change', () => {
    const reason = delReqReason.value;
    
    delReqPriceWrapper.style.display = reason === 'resale' ? 'block' : 'none';
    delReqPrice.required = reason === 'resale';
    
    if (reason === 'other') {
      delReqDetailsWrapper.style.display = 'block';
      delReqDetailsLabel.textContent = 'Please specify reason';
      delReqDetails.required = true;
    } else if (reason === 'resale') {
      delReqDetailsWrapper.style.display = 'block';
      delReqDetailsLabel.textContent = 'Notes (Optional - e.g. buyer name)';
      delReqDetails.required = false;
    } else {
      delReqDetailsWrapper.style.display = 'none';
      delReqDetails.required = false;
    }
  });
}

if (deletionRequestForm) {
  deletionRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = delReqItemId.value;
    const body = {
      reason: delReqReason.value,
      reason_details: delReqDetails.value,
      resale_price: delReqPrice.value,
      quantity: delReqQuantity.value
    };
    
    try {
      const token = localStorage.getItem('msc_token');
      const res = await fetch(`${API_BASE}/inventory/${itemId}/request-deletion`, {
        method: 'POST',
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || "Failed to submit request");
      showToast("Deletion request submitted.", "success");
      closeDeletionRequestModalFunc();
      closeItemDetail();
      if(document.querySelector(".nav-item.active")?.dataset.page === 'dashboard') loadInventory();
      else if(document.querySelector(".nav-item.active")?.dataset.page === 'requests') loadRequests();
    } catch(e) { showToast(e.message, "error"); }
  });
}



async function approveDeletion(reqId) {
  if (!confirm("Approve deletion?")) return;
  try {
    const token = localStorage.getItem('msc_token');
    const res = await fetch(`${API_BASE}/inventory/deletion-requests/${reqId}/approve`, { method: 'POST', headers: { "Authorization": `Bearer ${token}` } });
    if(!res.ok) throw new Error("Failed to approve");
    showToast("Request approved.", "success");
    invalidateCache('');
    loadRequests();
  } catch(e) { showToast(e.message, "error"); }
}

async function rejectDeletion(reqId) {
  if (!confirm("Reject this deletion request?")) return;
  try {
    const token = localStorage.getItem('msc_token');
    const res = await fetch(`${API_BASE}/inventory/deletion-requests/${reqId}/reject`, { method: 'POST', headers: { "Authorization": `Bearer ${token}` } });
    if(!res.ok) throw new Error("Failed to reject");
    showToast("Request rejected.", "success");
    loadRequests();
  } catch(e) { showToast(e.message, "error"); }
}


// ─── Branch Management ──────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, match => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[match];
  });
}

async function renderBranchesTable() {
  const tbody = document.getElementById('branchesBody');
  if(!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Loading branches...</td></tr>';
  try {
    const branches = await cachedFetch('/branches');
    tbody.innerHTML = '';
    if(branches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted)">No branches found</td></tr>';
      return;
    }
    branches.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:500;color:var(--text)">${escapeHTML(b.name)}</td>
        <td>${escapeHTML(b.location || '-')}</td>
        <td>${escapeHTML(b.address || '-')}</td>
        <td style="text-align:right">
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="icon-btn" onclick="editBranch('${b.id}', '${escapeHTML(b.name)}', '${escapeHTML(b.location||'')}', '${escapeHTML(b.address||'')}', '${escapeHTML(b.pincode||'')}')"><i data-lucide="pencil" style="width:16px;height:16px;color:var(--text-light)"></i></button>
            <button class="icon-btn" onclick="deactivateBranch('${b.id}')"><i data-lucide="trash-2" style="width:16px;height:16px;color:var(--danger)"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    renderIcons(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger)">Error loading branches: ${err.message}</td></tr>`;
  }
}

// Branch modal logic
const addBranchBtn = document.getElementById('addBranchBtn');
const addBranchModalBackdrop = document.getElementById('addBranchModalBackdrop');
const closeAddBranchModal = document.getElementById('closeAddBranchModal');
const cancelAddBranchModal = document.getElementById('cancelAddBranchModal');
const addBranchForm = document.getElementById('addBranchForm');

if(addBranchBtn) addBranchBtn.addEventListener('click', () => { addBranchForm.reset(); addBranchModalBackdrop.classList.add('active'); });
if(closeAddBranchModal) closeAddBranchModal.addEventListener('click', () => addBranchModalBackdrop.classList.remove('active'));
if(cancelAddBranchModal) cancelAddBranchModal.addEventListener('click', () => addBranchModalBackdrop.classList.remove('active'));

if(addBranchForm) {
  addBranchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('msc_token')},
        body: JSON.stringify(data)
      });
      if(!res.ok) throw new Error((await res.json()).error);
      addBranchModalBackdrop.classList.remove('active');
      showToast('Branch added successfully', 'success');
      loadBranches(); // Refresh dropdowns
      renderBranchesTable(); // Refresh table
    } catch(err) {
      showToast(err.message, 'error');
    }
  });
}

const editBranchModalBackdrop = document.getElementById('editBranchModalBackdrop');
const closeEditBranchModal = document.getElementById('closeEditBranchModal');
const cancelEditBranchModal = document.getElementById('cancelEditBranchModal');
const editBranchForm = document.getElementById('editBranchForm');
let currentEditBranchId = null;

if(closeEditBranchModal) closeEditBranchModal.addEventListener('click', () => editBranchModalBackdrop.classList.remove('active'));
if(cancelEditBranchModal) cancelEditBranchModal.addEventListener('click', () => editBranchModalBackdrop.classList.remove('active'));

window.editBranch = function(id, name, location, address, pincode) {
  currentEditBranchId = id;
  document.getElementById('editBranchName').value = name;
  document.getElementById('editBranchLocation').value = location;
  document.getElementById('editBranchAddress').value = address;
  document.getElementById('editBranchPincode').value = pincode;
  editBranchModalBackdrop.classList.add('active');
};

if(editBranchForm) {
  editBranchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const res = await fetch('/api/branches/' + currentEditBranchId, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('msc_token')},
        body: JSON.stringify(data)
      });
      if(!res.ok) throw new Error((await res.json()).error);
      editBranchModalBackdrop.classList.remove('active');
      showToast('Branch updated successfully', 'success');
      loadBranches(); // Refresh dropdowns
      renderBranchesTable(); // Refresh table
    } catch(err) {
      showToast(err.message, 'error');
    }
  });
}

window.deactivateBranch = async function(id) {
  if(!confirm('Are you sure you want to delete this branch?')) return;
  try {
    const res = await fetch('/api/branches/' + id + '/deactivate', {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + localStorage.getItem('msc_token')}
    });
    if(!res.ok) throw new Error((await res.json()).error);
    showToast('Branch deleted successfully', 'success');
    loadBranches(); // Refresh dropdowns
    renderBranchesTable(); // Refresh table
  } catch(err) {
    showToast(err.message, 'error');
  }
};

// ─── Transfer Stock Logic ──────────────────────────────
const transferStockBtn = document.getElementById('transferStockBtn');
const transferStockModalBackdrop = document.getElementById('transferStockModalBackdrop');
const closeTransferModal = document.getElementById('closeTransferModal');
const cancelTransferModal = document.getElementById('cancelTransferModal');
const transferStockForm = document.getElementById('transferStockForm');

if (transferStockBtn) {
  transferStockBtn.addEventListener('click', async () => {
    transferStockForm.reset();
    
    // Load Items and Branches
    try {
      const [items, branches] = await Promise.all([
        cachedFetch('/inventory'),
        cachedFetch('/branches')
      ]);
      
      const itemSel = document.getElementById('transferItemSelect');
      const srcSel = document.getElementById('transferSourceBranch');
      const dstSel = document.getElementById('transferDestinationBranch');
      
      itemSel.innerHTML = '<option value="" disabled selected>Select an item...</option>' + 
        items.map(i => `<option value="${i.id}">${i.name} (Stock: ${i.stock} ${i.unit})</option>`).join('');
        
      const branchOptions = branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
      srcSel.innerHTML = '<option value="" disabled selected>Select Source...</option>' + branchOptions;
      dstSel.innerHTML = '<option value="" disabled selected>Select Destination...</option>' + branchOptions;
      
      if (globalSelectedBranch) {
        srcSel.value = globalSelectedBranch;
      }
      
      transferStockModalBackdrop.classList.add('active');
    } catch(err) {
      showToast('Error loading data for transfer', 'error');
    }
  });
}

if(closeTransferModal) closeTransferModal.addEventListener('click', () => transferStockModalBackdrop.classList.remove('active'));
if(cancelTransferModal) cancelTransferModal.addEventListener('click', () => transferStockModalBackdrop.classList.remove('active'));

if(transferStockForm) {
  transferStockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const ogText = submitBtn.textContent;
    submitBtn.textContent = 'Transferring...';
    submitBtn.disabled = true;
    
    try {
      const res = await fetch('/api/movements/transfer', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('msc_token')},
        body: JSON.stringify(Object.fromEntries(d))
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      showToast('Stock transferred successfully', 'success');
      transferStockModalBackdrop.classList.remove('active');
      
      invalidateCache('/inventory');
      invalidateCache('/movements');
      await loadInventory();
    } catch(err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.textContent = ogText;
      submitBtn.disabled = false;
    }
  });
}

// ==========================================
// BULK IMPORT MODAL LOGIC
// ==========================================
const bulkImportBtn = document.getElementById('bulkImportBtn');
const bulkImportModalBackdrop = document.getElementById('bulkImportModalBackdrop');
const closeBulkImportModal = document.getElementById('closeBulkImportModal');
const cancelBulkImportModal = document.getElementById('cancelBulkImportModal');
const bulkImportForm = document.getElementById('bulkImportForm');
const bulkImportFileInput = bulkImportForm?.querySelector('input[type="file"]');
const bulkImportFileName = document.getElementById('bulkImportFileName');
const bulkImportResults = document.getElementById('bulkImportResults');
const bulkAddedCount = document.getElementById('bulkAddedCount');
const bulkUpdatedCount = document.getElementById('bulkUpdatedCount');
const bulkErrorsContainer = document.getElementById('bulkErrorsContainer');
const bulkErrorsList = document.getElementById('bulkErrorsList');
const bulkImportSubmitBtn = document.getElementById('bulkImportSubmitBtn');
const downloadBulkTemplateBtn = document.getElementById('downloadBulkTemplateBtn');
const bulkImportBranchSelect = document.getElementById('bulkImportBranchSelect');

if (downloadBulkTemplateBtn) {
  downloadBulkTemplateBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/inventory/bulk-import-template', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('msc_token') }
      });
      if (!res.ok) throw new Error('Failed to download template');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bulk_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch(err) {
      showToast(err.message, 'error');
    }
  });
}

if (bulkImportBtn) {
  bulkImportBtn.addEventListener('click', async () => {
    // Reset modal state
    bulkImportForm.reset();
    bulkImportFileName.textContent = '';
    bulkImportResults.style.display = 'none';
    bulkErrorsContainer.style.display = 'none';
    bulkErrorsList.innerHTML = '';
    
    // Load branches
    if (bulkImportBranchSelect) {
      try {
        const branches = await cachedFetch('/branches');
        bulkImportBranchSelect.innerHTML = '<option value="">Read from spreadsheet ("Branch Name" column)</option>' + 
          branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
      } catch (e) {
        console.error('Failed to load branches for bulk import', e);
      }
    }
    
    bulkImportModalBackdrop.classList.add('active');
  });
}

if (closeBulkImportModal) closeBulkImportModal.addEventListener('click', () => bulkImportModalBackdrop.classList.remove('active'));
if (cancelBulkImportModal) cancelBulkImportModal.addEventListener('click', () => bulkImportModalBackdrop.classList.remove('active'));

if (bulkImportFileInput) {
  bulkImportFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      bulkImportFileName.textContent = e.target.files[0].name;
    } else {
      bulkImportFileName.textContent = '';
    }
  });
}

if (bulkImportForm) {
  bulkImportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!bulkImportFileInput.files.length) return;
    
    const ogText = bulkImportSubmitBtn.textContent;
    bulkImportSubmitBtn.textContent = 'Processing...';
    bulkImportSubmitBtn.disabled = true;
    
    try {
      const formData = new FormData();
      formData.append('file', bulkImportFileInput.files[0]);
      
      const res = await fetch('/api/inventory/bulk-import', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('msc_token') },
        body: formData
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Show results
      bulkAddedCount.textContent = data.added || 0;
      bulkUpdatedCount.textContent = data.updated || 0;
      
      if (data.errors && data.errors.length > 0) {
        bulkErrorsList.innerHTML = data.errors.map(err => `<li>${err}</li>`).join('');
        bulkErrorsContainer.style.display = 'block';
      } else {
        bulkErrorsContainer.style.display = 'none';
      }
      
      bulkImportResults.style.display = 'block';
      showToast('Bulk import completed', 'success');
      
      // Invalidate and reload if changes were made
      if (data.added > 0 || data.updated > 0) {
        invalidateCache('/inventory');
        invalidateCache('/alerts');
        if (document.querySelector(".nav-item.active")?.dataset.page === 'inventory') {
          await loadInventory();
        }
      }
    } catch(err) {
      showToast(err.message, 'error');
    } finally {
      bulkImportSubmitBtn.textContent = ogText;
      bulkImportSubmitBtn.disabled = false;
    }
  });
}

if (delReqQuantity) {
  delReqQuantity.addEventListener('input', () => {
    const buyPriceDisplay = document.getElementById('delReqBuyPriceDisplay');
    if (buyPriceDisplay && window.currentDelReqBuyPrice !== undefined) {
      const qty = parseInt(delReqQuantity.value) || 0;
      buyPriceDisplay.textContent = `₹${(window.currentDelReqBuyPrice * qty).toFixed(2)}`;
    }
  });
}
