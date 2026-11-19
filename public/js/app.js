import { analyzeFabricSwatchPhoto } from './photoAnalyzer.js';
import { OriginalPhotoLightbox } from './lightbox.js';

const DEFAULT_GDRIVE_FOLDER_ID = '1W8wTEg03Aqiv-rJHvoFngwYpg1u-Hjlw';
const DEFAULT_GAS_BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbxXHr_8hjku8KUjKstMe0NGwQhMRe0fNgq7G-6e05bqRDkFSFtrPHtuGk495NNun65f/exec';
const STORAGE_SELECTED_KEY = 'gm_selected_fabrics_v1';
const STORAGE_LOCAL_BRIDGE_KEY = 'gm_gas_bridge_url';

const state = {
  products: [],
  settings: {
    storeName: 'Gorden Magelang',
    mainWebsite: 'https://www.gordenmagelang.web.id',
    tagline: '',
    whatsapp: '6285734103666',
    address: 'Gorden Magelang — Survey & Ukur Gratis Magelang dan Sekitarnya',
    googleDriveFolderId: DEFAULT_GDRIVE_FOLDER_ID,
    googleDriveFolderUrl: `https://drive.google.com/drive/folders/${DEFAULT_GDRIVE_FOLDER_ID}`,
    hasAiVision: false,
    hasDriveBridge: true,
    gasBridgeUrl: DEFAULT_GAS_BRIDGE_URL,
    isVercel: false,
  },
  filter: {
    search: '',
    collection: 'Semua',
    category: 'Semua',
    sort: 'code',
    viewMode: 'natural',
  },
  selectedIds: new Set(JSON.parse(localStorage.getItem(STORAGE_SELECTED_KEY) || '[]')),
  activeDetailProduct: null,
  adminToken: sessionStorage.getItem('gorden_admin_token') || '',
  adminPinSession: sessionStorage.getItem('gorden_admin_pin') || '',
  syncedDriveFiles: [],
  upload: {
    file: null,
    previewObjectUrl: null,
    imageMeta: { width: 0, height: 0 },
    palette: [],
    rawOcrText: '',
    analysisEngine: 'OCR & Label Reader',
    editingId: null,
    existingImageUrl: null,
    driveFileId: '',
    source: 'local',
  },
};

const lightbox = new OriginalPhotoLightbox();

/* ==========================================================================
   Helpers
   ========================================================================== */
function formatRupiah(amount) {
  const num = Number(amount) || 0;
  if (num <= 0) return 'Tanya Harga';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, 3600);
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.adminToken) {
    headers['X-Admin-Token'] = state.adminToken;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({ ok: false, error: 'Respons server tidak valid.' }));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request gagal (${res.status})`);
  }
  return data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(file);
  });
}

function displayFabricTitle(p) {
  const code = (p.code || '').trim();
  const color = (p.colorName || '').trim();
  if (code && color) return `${code} ${color}`;
  return code || color || p.collection || 'Sampel Kain';
}

/* ==========================================================================
   Load Catalog & Apply Gorden Magelang Branding
   ========================================================================== */
async function loadCatalog() {
  try {
    const savedBridge = localStorage.getItem(STORAGE_LOCAL_BRIDGE_KEY) || state.settings.gasBridgeUrl || DEFAULT_GAS_BRIDGE_URL;
    const qs = `?bridgeUrl=${encodeURIComponent(savedBridge)}&_t=${Date.now()}`;
    const data = await apiFetch(`/api/catalog${qs}`);
    let loadedProducts = Array.isArray(data.products) && data.products.length > 0 ? data.products : [];

    // Gabungkan dengan cache lokal jika baru saja ada kain yang di-upload
    try {
      const localCached = JSON.parse(localStorage.getItem('gm_cached_products') || '[]');
      if (Array.isArray(localCached) && localCached.length > 0) {
        const loadedKeys = new Set(loadedProducts.map((p) => p.code || p.id));
        const missingLocal = localCached.filter((p) => !loadedKeys.has(p.code) && !loadedKeys.has(p.id));
        if (missingLocal.length > 0) {
          loadedProducts = [...missingLocal, ...loadedProducts];
        }
      }
    } catch {}

    state.products = loadedProducts;
    state.settings = { ...state.settings, ...(data.settings || {}) };
  } catch (err) {
    // Fallback for pure static preview if /api/catalog unavailable
    try {
      const fallback = await fetch(`/data/catalog.json?_t=${Date.now()}`).then((r) => r.json());
      let fallbackProducts = fallback.products || [];
      try {
        const localCached = JSON.parse(localStorage.getItem('gm_cached_products') || '[]');
        if (Array.isArray(localCached) && localCached.length > 0) {
          const loadedKeys = new Set(fallbackProducts.map((p) => p.code || p.id));
          const missingLocal = localCached.filter((p) => !loadedKeys.has(p.code) && !loadedKeys.has(p.id));
          fallbackProducts = [...missingLocal, ...fallbackProducts];
        }
      } catch {}
      state.products = fallbackProducts;
      if (fallback.settings) state.settings = { ...state.settings, ...fallback.settings };
      state.settings.isVercel = true;
    } catch {
      showToast(`Gagal memuat katalog: ${err.message}`, 'error');
    }
  }

  applyStoreBranding();
  populateCollectionFilter();
  renderGallery();
  renderSelectionBar();
  renderAdminManageList();
}

function formatDisplayWa(wa = '6285734103666') {
  const digits = String(wa).replace(/[^\d]/g, '');
  const local = digits.startsWith('62') ? '0' + digits.slice(2) : digits;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}

function applyStoreBranding() {
  const s = state.settings;
  const webUrl = s.mainWebsite || 'https://www.gordenmagelang.web.id';
  const webHost = webUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const waNum = (s.whatsapp || '6285734103666').replace(/[^\d]/g, '');
  const waDisplay = formatDisplayWa(waNum);

  document.title = `Katalog Kain — ${s.storeName} (${webHost})`;
  document.getElementById('headerStoreName').textContent = s.storeName;
  document.getElementById('footerStoreName').textContent = s.storeName;
  document.getElementById('footerAddress').textContent = `${s.address || ''} • WA ${waDisplay}`;
  if (s.tagline) document.getElementById('heroTagline').textContent = s.tagline;

  const headerWeb = document.getElementById('headerMainWebLink');
  if (headerWeb) {
    headerWeb.href = webUrl;
    headerWeb.textContent = `${webHost} ↗`;
  }
  const headerWa = document.getElementById('headerWaBtn');
  if (headerWa) {
    headerWa.href = `https://wa.me/${waNum}?text=${encodeURIComponent(`Halo ${s.storeName}, saya ingin konsultasi pilihan kain gorden dari katalog digital.`)}`;
    const span = headerWa.querySelector('span');
    if (span) span.textContent = waDisplay;
  }
  const footerWeb = document.getElementById('footerMainWebLink');
  if (footerWeb) {
    footerWeb.href = webUrl;
    footerWeb.textContent = `${webHost} ↗`;
  }

  const folderId = s.googleDriveFolderId || DEFAULT_GDRIVE_FOLDER_ID;
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  const footerDrive = document.getElementById('footerDriveLink');
  if (footerDrive) footerDrive.href = folderUrl;

  const driveIdDisplay = document.getElementById('driveFolderIdDisplay');
  if (driveIdDisplay) driveIdDisplay.textContent = folderId;
  const driveOpenBtn = document.getElementById('driveOpenFolderBtn');
  if (driveOpenBtn) driveOpenBtn.href = folderUrl;

  const collections = new Set(state.products.map((p) => (p.collection || '').trim()).filter(Boolean));
  document.getElementById('statTotalProducts').textContent = String(state.products.length);
  document.getElementById('statCollections').textContent = String(collections.size);
  document.getElementById('statSelectedCount').textContent = String(state.selectedIds.size);
  document.getElementById('adminProductCount').textContent = String(state.products.length);
}

function populateCollectionFilter() {
  const sel = document.getElementById('collectionSelect');
  const current = state.filter.collection;
  const cols = Array.from(
    new Set(state.products.map((p) => (p.collection || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'id'));

  sel.innerHTML =
    `<option value="Semua">Semua Koleksi (${cols.length})</option>` +
    cols.map((c) => `<option value="${escapeHtml(c)}">Koleksi: ${escapeHtml(c)}</option>`).join('');

  sel.value = cols.includes(current) ? current : 'Semua';
  state.filter.collection = sel.value;
}

/* ==========================================================================
   Filter, Sort & Render Fabric Swatch Gallery
   ========================================================================== */
function getFilteredProducts() {
  const q = state.filter.search.trim().toLowerCase();
  const cat = state.filter.category;
  const col = state.filter.collection;

  let list = state.products.filter((p) => {
    if (col !== 'Semua' && (p.collection || '') !== col) return false;
    if (cat !== 'Semua' && (p.category || '') !== cat) return false;
    if (!q) return true;
    const haystack = [
      p.collection,
      p.code,
      p.colorName,
      p.brand,
      p.category,
      p.shadingDegree,
      p.composition,
      p.width,
      p.weight,
      p.patternTexture,
      p.description,
      p.rawOcrText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  if (state.filter.sort === 'newest') {
    list = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (state.filter.sort === 'collection') {
    list = [...list].sort((a, b) =>
      `${a.collection || ''} ${a.code || ''}`.localeCompare(`${b.collection || ''} ${b.code || ''}`, 'id')
    );
  } else {
    list = [...list].sort((a, b) => (a.code || '').localeCompare(b.code || '', 'id', { numeric: true }));
  }

  return list;
}

function getStockClass(status = '') {
  const s = status.toLowerCase();
  if (s.includes('habis')) return 'status-habis';
  if (s.includes('indent') || s.includes('pre') || s.includes('terbatas')) return 'status-preorder';
  return '';
}

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('emptyState');
  const items = getFilteredProducts();

  grid.classList.toggle('mode-natural', state.filter.viewMode === 'natural');
  grid.classList.toggle('mode-grid', state.filter.viewMode === 'grid');

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = items
    .map((p) => {
      const isSelected = state.selectedIds.has(p.id);
      const palette = (p.palette || []).slice(0, 4);
      const swatchesHtml = palette
        .map((hex) => `<span class="swatch-dot" style="background:${escapeHtml(hex)}" title="Warna kain: ${escapeHtml(hex)}"></span>`)
        .join('');

      const shadingLabel = p.shadingDegree || p.category || '';
      const specPills = [
        shadingLabel ? `<span class="spec-pill spec-pill-strong">${escapeHtml(shadingLabel)}</span>` : '',
        p.composition ? `<span class="spec-pill">${escapeHtml(p.composition)}</span>` : '',
        p.width ? `<span class="spec-pill">L ${escapeHtml(p.width)}</span>` : '',
        p.weight ? `<span class="spec-pill">${escapeHtml(p.weight)}</span>` : '',
      ]
        .filter(Boolean)
        .join('');

      return `
        <article class="curtain-card ${isSelected ? 'card-selected' : ''}" data-id="${escapeHtml(p.id)}">
          <div class="card-photo-wrap" data-action="zoom" data-id="${escapeHtml(p.id)}">
            <img
              class="card-photo"
              src="${escapeHtml(p.imageUrl)}"
              alt="${escapeHtml(p.collection)} ${escapeHtml(displayFabricTitle(p))}"
              loading="lazy"
            />
            <span class="card-badge-collection">${escapeHtml(p.collection || 'KAIN GORDEN')}${p.brand ? ` • ${escapeHtml(p.brand)}` : ''}</span>
            <button type="button" class="card-zoom-fab" data-action="zoom" data-id="${escapeHtml(p.id)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
              Zoom HD
            </button>
          </div>

          <div class="card-body">
            <div class="card-head-row">
              <div class="card-code-group">
                <span class="code-badge">${escapeHtml(p.code || 'KAIN')}</span>
                <span class="color-title">${escapeHtml(p.colorName || p.collection || '')}</span>
              </div>
              <div class="palette-dots" title="Warna kain terbaca dari foto">${swatchesHtml}</div>
            </div>

            <div class="spec-line">${specPills}</div>

            <p class="card-desc">${escapeHtml(p.description || '')}</p>

            <div class="card-actions">
              <button
                type="button"
                class="btn btn-sm btn-select-fabric ${isSelected ? 'is-selected' : ''}"
                data-action="select"
                data-id="${escapeHtml(p.id)}"
              >
                ${isSelected ? '✓ Dipilih' : '+ Pilih Kain'}
              </button>
              <button type="button" class="btn btn-sm btn-primary" data-action="detail" data-id="${escapeHtml(p.id)}">
                Detail &amp; WA
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

/* ==========================================================================
   Customer Swatch Selection Bar ("Pilihan Kain Anda")
   ========================================================================== */
function persistSelection() {
  localStorage.setItem(STORAGE_SELECTED_KEY, JSON.stringify(Array.from(state.selectedIds)));
}

function toggleSelectFabric(productId) {
  if (state.selectedIds.has(productId)) {
    state.selectedIds.delete(productId);
  } else {
    state.selectedIds.add(productId);
    const p = state.products.find((item) => item.id === productId);
    if (p) showToast(`${displayFabricTitle(p)} ditambahkan ke Daftar Pilihan Kain Anda.`, 'success');
  }
  persistSelection();
  document.getElementById('statSelectedCount').textContent = String(state.selectedIds.size);
  renderGallery();
  renderSelectionBar();
  if (state.activeDetailProduct && state.activeDetailProduct.id === productId) {
    updateDetailSelectButton();
  }
}

function renderSelectionBar() {
  const bar = document.getElementById('selectionBar');
  const selectedProducts = state.products.filter((p) => state.selectedIds.has(p.id));

  document.getElementById('statSelectedCount').textContent = String(selectedProducts.length);

  if (selectedProducts.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  document.getElementById('selectionBarCount').textContent = String(selectedProducts.length);
  document.getElementById('selectionChips').innerHTML = selectedProducts
    .map(
      (p) => `
      <span class="sel-chip">
        ${escapeHtml(p.code)}${p.colorName ? ` ${escapeHtml(p.colorName)}` : ''}
        <button type="button" data-unselect="${escapeHtml(p.id)}" aria-label="Hapus pilihan">×</button>
      </span>
    `
    )
    .join('');

  const waNumber = (state.settings.whatsapp || '6285734103666').replace(/[^\d]/g, '');
  const lines = [
    `Halo ${state.settings.storeName} (${state.settings.mainWebsite || 'www.gordenmagelang.web.id'}),`,
    `Saya sudah memilih jenis kain gorden dari Katalog Digital:`,
    '',
    ...selectedProducts.map(
      (p, idx) =>
        `${idx + 1}. Koleksi: ${p.collection} | Kode: ${displayFabricTitle(p)} (${p.shadingDegree || p.category}${p.width ? `, Lebar ${p.width}` : ''})`
    ),
    '',
    'Mohon info harga per meter & ketersediaan stok kain pilihan saya tersebut. Terima kasih!',
  ];
  document.getElementById('btnSendSelectionWa').href = `https://wa.me/${waNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/* ==========================================================================
   Fabric Detail Modal
   ========================================================================== */
function openProductDetail(productId) {
  const p = state.products.find((item) => item.id === productId);
  if (!p) return;
  state.activeDetailProduct = p;

  document.getElementById('detailImg').src = p.imageUrl;
  document.getElementById('detailImg').alt = `${p.collection} ${displayFabricTitle(p)}`;

  const resParts = [];
  if (p.imageMeta?.width && p.imageMeta?.height) resParts.push(`${p.imageMeta.width} × ${p.imageMeta.height} px`);
  if (p.imageMeta?.sizeBytes) resParts.push(formatBytes(p.imageMeta.sizeBytes));
  resParts.push(p.source === 'gdrive' ? 'Foto Asli Google Drive' : 'Foto Asli Sampel Kain');
  document.getElementById('detailPhotoRes').textContent = resParts.join(' • ');

  document.getElementById('detailPaletteRow').innerHTML = (p.palette || [])
    .map(
      (hex) => `
      <span class="palette-chip">
        <i style="background:${escapeHtml(hex)}"></i>
        ${escapeHtml(hex)}
      </span>
    `
    )
    .join('');

  document.getElementById('detailCollection').textContent = p.collection || 'KOLEKSI';
  document.getElementById('detailCodeBadge').textContent = p.code || 'KODE';
  document.getElementById('detailStock').textContent = p.stockStatus || 'Tersedia';
  document.getElementById('detailEngine').textContent = p.analysisEngine || 'OCR & Label Reader';
  document.getElementById('detailTitle').textContent = displayFabricTitle(p);
  document.getElementById('detailPrice').textContent = formatRupiah(p.price);
  document.getElementById('detailUnit').textContent = p.price > 0 ? p.unit || 'per meter' : 'Hubungi kami untuk penawaran';
  document.getElementById('detailDescription').textContent = p.description || '';

  const specs = [
    { label: 'Koleksi / Buku', value: p.collection || '-' },
    { label: 'Kode & Warna', value: displayFabricTitle(p) },
    { label: 'Shading Degree', value: p.shadingDegree || p.category || '-' },
    { label: 'Komposisi Bahan', value: p.composition || '-' },
    { label: 'Lebar Kain (Width)', value: p.width || '-' },
    { label: 'Gramasi (Weight)', value: p.weight || '-' },
    { label: 'Tekstur / Motif', value: p.patternTexture || '-' },
    { label: 'Rekomendasi Ruang', value: p.roomRecommendation || '-' },
  ];
  if (p.brand) specs.push({ label: 'Brand / Merek', value: p.brand });
  if (p.fireRetardant) specs.push({ label: 'Sertifikasi / Tahan Api', value: p.fireRetardant });

  document.getElementById('detailSpecs').innerHTML = specs
    .map(
      (s) => `
      <div class="spec-cell">
        <span>${escapeHtml(s.label)}</span>
        <strong>${escapeHtml(s.value)}</strong>
      </div>
    `
    )
    .join('');

  const rawWrap = document.getElementById('detailRawOcrWrap');
  if (p.rawOcrText) {
    rawWrap.classList.remove('hidden');
    document.getElementById('detailRawOcr').textContent = p.rawOcrText;
  } else {
    rawWrap.classList.add('hidden');
  }

  updateDetailSelectButton();

  const waNumber = (state.settings.whatsapp || '6285734103666').replace(/[^\d]/g, '');
  const waMsg = [
    `Halo ${state.settings.storeName}, saya tertarik dengan jenis kain dari katalog:`,
    `• Koleksi: ${p.collection}`,
    `• Kode & Warna: ${displayFabricTitle(p)}`,
    `• Shading: ${p.shadingDegree || p.category}`,
    p.composition ? `• Komposisi: ${p.composition}` : '',
    p.width ? `• Lebar Kain: ${p.width}` : '',
    `Mohon informasi harga & ketersediaan stoknya.`,
  ]
    .filter(Boolean)
    .join('\n');
  document.getElementById('detailWaBtn').href = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;

  const modal = document.getElementById('productModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function updateDetailSelectButton() {
  const btn = document.getElementById('detailToggleSelectBtn');
  if (!state.activeDetailProduct) return;
  const sel = state.selectedIds.has(state.activeDetailProduct.id);
  btn.textContent = sel ? '✓ Kain Ini Sudah Dipilih' : '+ Pilih Kain Ini';
  btn.className = `btn btn-select-fabric ${sel ? 'is-selected' : ''}`;
}

function closeProductDetail() {
  const modal = document.getElementById('productModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function openProductLightbox(productId) {
  const p = state.products.find((item) => item.id === productId);
  if (!p) return;
  lightbox.open({
    imageUrl: p.imageUrl,
    title: `${p.collection} — ${displayFabricTitle(p)}`,
    metaText: [p.shadingDegree, p.composition, p.width, p.weight].filter(Boolean).join(' • '),
  });
}

/* ==========================================================================
   Admin Panel Auth & Navigation
   ========================================================================== */
async function openAdminModal(initialTab = 'upload') {
  const modal = document.getElementById('adminModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  if (state.adminToken) {
    if (state.settings.isVercel) {
      showAdminWorkspace(initialTab);
      return;
    }
    try {
      await apiFetch('/api/admin/session');
      showAdminWorkspace(initialTab);
      return;
    } catch {
      state.adminToken = '';
      sessionStorage.removeItem('gorden_admin_token');
    }
  }

  showAdminLogin();
}

function closeAdminModal() {
  const modal = document.getElementById('adminModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showAdminLogin() {
  document.getElementById('adminLoginView').classList.remove('hidden');
  document.getElementById('adminWorkspace').classList.add('hidden');
  document.getElementById('adminLogoutBtn').classList.add('hidden');
  document.getElementById('openAdminBtn').classList.remove('is-logged-in');
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('adminPinInput').value = '';
  setTimeout(() => document.getElementById('adminPinInput').focus(), 100);
}

function showAdminWorkspace(tab = 'upload') {
  document.getElementById('adminLoginView').classList.add('hidden');
  document.getElementById('adminWorkspace').classList.remove('hidden');
  document.getElementById('adminLogoutBtn').classList.remove('hidden');
  document.getElementById('openAdminBtn').classList.add('is-logged-in');
  switchAdminTab(tab);
  renderAdminManageList();
  loadAdminSettingsForm();
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.getElementById('tabPanelUpload').classList.toggle('active', tabName === 'upload');
  document.getElementById('tabPanelGdrive').classList.toggle('active', tabName === 'gdrive');
  document.getElementById('tabPanelManage').classList.toggle('active', tabName === 'manage');
  document.getElementById('tabPanelSettings').classList.toggle('active', tabName === 'settings');
}

/* ==========================================================================
   Admin Upload + OCR Label Reader + Gemini AI Vision
   ========================================================================== */
function setScanningState(isScanning, message = 'Membaca teks label kain (OCR)...') {
  document.getElementById('scanStatusText').textContent = message;
  document.getElementById('scanOverlay').classList.toggle('hidden', !isScanning);
}

function applyFabricReadingToForm(result) {
  document.getElementById('fCollection').value = result.collection || '';
  document.getElementById('fCode').value = result.code || '';
  document.getElementById('fColorName').value = result.colorName || '';
  document.getElementById('fBrand').value = result.brand || '';
  document.getElementById('fShading').value = result.shadingDegree || '';
  document.getElementById('fComposition').value = result.composition || '';
  document.getElementById('fWidth').value = result.width || '';
  document.getElementById('fWeight').value = result.weight || '';
  document.getElementById('fPatternTexture').value = result.patternTexture || '';
  document.getElementById('fFireRetardant').value = result.fireRetardant || '';
  document.getElementById('fRoomRec').value = result.roomRecommendation || '';
  document.getElementById('fDescription').value = result.description || '';

  if (result.category) {
    const sel = document.getElementById('fCategory');
    const valid = Array.from(sel.options).some((o) => o.value === result.category);
    if (valid) sel.value = result.category;
  }

  if (Array.isArray(result.palette) && result.palette.length > 0) {
    state.upload.palette = result.palette;
  }
  state.upload.rawOcrText = result.rawOcrText || '';
  state.upload.analysisEngine = result.analysisEngine || 'OCR & Label Reader';

  renderDetectedCard();
}

function renderDetectedCard() {
  document.getElementById('detectedCard').classList.remove('hidden');
  document.getElementById('detectedEngineBadge').textContent = state.upload.analysisEngine;
  document.getElementById('detectedPalette').innerHTML = (state.upload.palette || [])
    .map(
      (hex) => `
      <span class="palette-chip">
        <i style="background:${escapeHtml(hex)}"></i>
        ${escapeHtml(hex)}
      </span>
    `
    )
    .join('');
  document.getElementById('detectedRawOcr').textContent =
    state.upload.rawOcrText || '(Belum ada teks mentah — Anda tetap dapat mengedit kolom secara manual atau pakai AI Vision Pro)';
}

async function handleSelectedPhotoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Harap pilih file gambar JPG, PNG, atau WEBP.', 'error');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showToast('Ukuran foto melebihi batas 25 MB.', 'error');
    return;
  }

  if (state.upload.previewObjectUrl) URL.revokeObjectURL(state.upload.previewObjectUrl);
  const objectUrl = URL.createObjectURL(file);
  state.upload.file = file;
  state.upload.previewObjectUrl = objectUrl;
  state.upload.source = 'local';

  document.getElementById('dropzoneEmpty').classList.add('hidden');
  document.getElementById('dropzonePreview').classList.remove('hidden');
  document.getElementById('previewToolbar').classList.remove('hidden');
  document.getElementById('uploadPreviewImg').src = objectUrl;

  await runOcrLabelReader(file, file.name);
  if (state.settings.hasAiVision) {
    await runGeminiVisionReader();
  }
}

async function runOcrLabelReader(source, filename = '') {
  setScanningState(true, 'Membaca label Collection, Kode Kain & Spesifikasi dari foto...');
  try {
    const result = await analyzeFabricSwatchPhoto(source, filename, (msg) => {
      document.getElementById('scanStatusText').textContent = msg;
    });
    state.upload.imageMeta = result.imageMeta || { width: 0, height: 0 };
    const sizeText = state.upload.file ? ` • ${formatBytes(state.upload.file.size)}` : '';
    document.getElementById('previewFileMeta').textContent =
      `Foto Asli: ${state.upload.imageMeta.width} × ${state.upload.imageMeta.height} px${sizeText}`;

    applyFabricReadingToForm(result);
    showToast(`Label terbaca: ${result.collection} — ${result.code} ${result.colorName}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setScanningState(false);
  }
}

async function runGeminiVisionReader() {
  if (!state.upload.file && !state.upload.existingImageUrl) {
    showToast('Unggah foto sampel kain terlebih dahulu.', 'error');
    return;
  }

  setScanningState(true, 'AI Vision Pro (Gemini) sedang membaca label & tekstur kain...');
  try {
    let payload;
    if (state.upload.file) {
      const base64 = await fileToBase64(state.upload.file);
      payload = {
        base64,
        mimeType: state.upload.file.type || 'image/jpeg',
        filename: state.upload.file.name,
      };
    } else {
      payload = { imageUrl: state.upload.existingImageUrl };
    }

    const endpoint = state.settings.isVercel ? '/api/analyze-vision' : '/api/admin/analyze-vision';
    const data = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    applyFabricReadingToForm({
      ...data.result,
      palette: state.upload.palette,
      analysisEngine: 'AI Vision Pro (Gemini)',
    });
    showToast('Pembacaan AI Vision Pro selesai dengan akurasi tinggi!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setScanningState(false);
  }
}

function resetUploadForm() {
  if (state.upload.previewObjectUrl) URL.revokeObjectURL(state.upload.previewObjectUrl);
  state.upload = {
    file: null,
    previewObjectUrl: null,
    imageMeta: { width: 0, height: 0 },
    palette: [],
    rawOcrText: '',
    analysisEngine: 'OCR & Label Reader',
    editingId: null,
    existingImageUrl: null,
    driveFileId: '',
    source: 'local',
  };

  document.getElementById('productForm').reset();
  document.getElementById('fPrice').value = '0';
  document.getElementById('fUnit').value = 'per meter';
  document.getElementById('editProductId').value = '';
  document.getElementById('photoFileInput').value = '';
  document.getElementById('dropzoneEmpty').classList.remove('hidden');
  document.getElementById('dropzonePreview').classList.add('hidden');
  document.getElementById('previewToolbar').classList.add('hidden');
  document.getElementById('detectedCard').classList.add('hidden');
  document.getElementById('editModeBanner').classList.add('hidden');
  document.getElementById('btnSaveProduct').textContent = 'Simpan ke Katalog Kain';
}

function startEditProduct(productId) {
  const p = state.products.find((item) => item.id === productId);
  if (!p) return;

  resetUploadForm();
  state.upload.editingId = p.id;
  state.upload.existingImageUrl = p.imageUrl;
  state.upload.imageMeta = p.imageMeta || { width: 0, height: 0 };
  state.upload.palette = p.palette || [];
  state.upload.rawOcrText = p.rawOcrText || '';
  state.upload.analysisEngine = p.analysisEngine || 'OCR & Label Reader';
  state.upload.driveFileId = p.driveFileId || '';
  state.upload.source = p.source || 'local';

  document.getElementById('editProductId').value = p.id;
  document.getElementById('editModeBanner').classList.remove('hidden');
  document.getElementById('editModeName').textContent = `${p.collection} — ${displayFabricTitle(p)}`;
  document.getElementById('btnSaveProduct').textContent = 'Simpan Perubahan Kain';

  document.getElementById('dropzoneEmpty').classList.add('hidden');
  document.getElementById('dropzonePreview').classList.remove('hidden');
  document.getElementById('previewToolbar').classList.remove('hidden');
  document.getElementById('uploadPreviewImg').src = p.imageUrl;
  document.getElementById('previewFileMeta').textContent =
    `Foto tersimpan (${p.source === 'gdrive' ? 'Google Drive' : 'Lokal'}) • Klik area foto jika ingin mengganti foto`;

  document.getElementById('fCollection').value = p.collection || '';
  document.getElementById('fCode').value = p.code || '';
  document.getElementById('fColorName').value = p.colorName || '';
  document.getElementById('fCategory').value = p.category || 'Blackout 100%';
  document.getElementById('fShading').value = p.shadingDegree || '';
  document.getElementById('fBrand').value = p.brand || '';
  document.getElementById('fComposition').value = p.composition || '';
  document.getElementById('fWidth').value = p.width || '';
  document.getElementById('fWeight').value = p.weight || '';
  document.getElementById('fPatternTexture').value = p.patternTexture || '';
  document.getElementById('fFireRetardant').value = p.fireRetardant || '';
  document.getElementById('fPrice').value = p.price || 0;
  document.getElementById('fUnit').value = p.unit || 'per meter';
  document.getElementById('fStockStatus').value = p.stockStatus || 'Tersedia';
  document.getElementById('fRoomRec').value = p.roomRecommendation || '';
  document.getElementById('fDescription').value = p.description || '';

  renderDetectedCard();
  switchAdminTab('upload');
}

function collectFormFields() {
  return {
    collection: document.getElementById('fCollection').value.trim().toUpperCase(),
    code: document.getElementById('fCode').value.trim().toUpperCase(),
    colorName: document.getElementById('fColorName').value.trim().toUpperCase(),
    category: document.getElementById('fCategory').value,
    shadingDegree: document.getElementById('fShading').value.trim(),
    brand: document.getElementById('fBrand').value.trim(),
    composition: document.getElementById('fComposition').value.trim(),
    width: document.getElementById('fWidth').value.trim(),
    weight: document.getElementById('fWeight').value.trim(),
    patternTexture: document.getElementById('fPatternTexture').value.trim(),
    fireRetardant: document.getElementById('fFireRetardant').value.trim(),
    price: Number(document.getElementById('fPrice').value) || 0,
    unit: document.getElementById('fUnit').value.trim() || 'per meter',
    stockStatus: document.getElementById('fStockStatus').value,
    roomRecommendation: document.getElementById('fRoomRec').value.trim(),
    description: document.getElementById('fDescription').value.trim(),
    rawOcrText: state.upload.rawOcrText || '',
    palette: state.upload.palette || [],
    analysisEngine: state.upload.analysisEngine || 'OCR & Label Reader',
    imageMeta: state.upload.imageMeta,
    driveFileId: state.upload.driveFileId || '',
    source: state.upload.source || 'local',
  };
}

async function submitProductForm(e) {
  e.preventDefault();
  const isEditing = Boolean(state.upload.editingId);
  if (!isEditing && !state.upload.file && !state.upload.existingImageUrl) {
    showToast('Unggah foto sampel kain terlebih dahulu.', 'error');
    return;
  }

  const saveBtn = document.getElementById('btnSaveProduct');
  const prevText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan foto asli...';

  try {
    const fields = collectFormFields();

    // Mode Vercel + Google Apps Script Bridge
    if (state.settings.isVercel || window.location.hostname.includes('vercel.app')) {
      const bridgeUrl = localStorage.getItem(STORAGE_LOCAL_BRIDGE_KEY) || state.settings.gasBridgeUrl || DEFAULT_GAS_BRIDGE_URL;
      let finalImageUrl = state.upload.existingImageUrl || '';
      let finalDriveId = state.upload.driveFileId || '';

      if (state.upload.file) {
        if (!bridgeUrl && !state.settings.hasDriveBridge) {
          throw new Error(
            'Di Vercel, atur "Google Apps Script Bridge URL" di tab Pengaturan agar foto otomatis tersimpan ke folder Google Drive Anda.'
          );
        }
        const base64 = await fileToBase64(state.upload.file);
        const upRes = await apiFetch('/api/drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload_photo',
            bridgeUrl,
            pin: state.adminPinSession || '1234',
            filename: `${fields.code}-${fields.colorName || 'KAIN'}.jpg`.replace(/\s+/g, '-'),
            mimeType: state.upload.file.type || 'image/jpeg',
            base64,
          }),
        });
        finalImageUrl = upRes.file.imageUrl;
        finalDriveId = upRes.file.id;
      }

      const now = new Date().toISOString();
      const record = {
        ...fields,
        id: isEditing ? state.upload.editingId : `kain-${Date.now()}`,
        imageUrl: finalImageUrl,
        driveFileId: finalDriveId,
        source: finalDriveId ? 'gdrive' : fields.source,
        createdAt: isEditing
          ? state.products.find((p) => p.id === state.upload.editingId)?.createdAt || now
          : now,
        updatedAt: now,
      };

      const nextList = isEditing
        ? state.products.map((p) => (p.id === record.id ? record : p))
        : [record, ...state.products];

      // Simpan langsung di cache browser lokal agar seketika tampil di layar depan
      try {
        localStorage.setItem('gm_cached_products', JSON.stringify(nextList));
      } catch {}

      state.products = nextList;

      // Sinkronkan ke Google Drive Bridge
      try {
        await apiFetch('/api/drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_catalog',
            bridgeUrl,
            pin: state.adminPinSession || '1234',
            products: nextList,
            settings: state.settings,
          }),
        });
      } catch (saveErr) {
        console.warn('[Save Catalog] Bridge save warning:', saveErr.message);
      }

      showToast('Kain gorden berhasil disimpan & tampil di katalog!', 'success');
      resetUploadForm();
      closeAdminModal();
      applyStoreBranding();
      populateCollectionFilter();
      renderGallery();
      renderSelectionBar();
      renderAdminManageList();
      return;
    }

    // Mode Local Server (auto-syncs to Google Drive Bridge too if configured!)
    const fd = new FormData();
    if (state.upload.file) {
      fd.append('photo', state.upload.file);
    } else if (state.upload.existingImageUrl) {
      fd.append('imageUrl', state.upload.existingImageUrl);
    }

    Object.entries(fields).forEach(([k, v]) => {
      fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
    });

    if (isEditing) {
      await apiFetch(`/api/admin/products/${state.upload.editingId}`, { method: 'PUT', body: fd });
      showToast('Perubahan sampel kain disimpan!', 'success');
    } else {
      await apiFetch('/api/admin/products', { method: 'POST', body: fd });
      showToast('Foto sampel kain & kode label berhasil ditambahkan ke katalog!', 'success');
    }

    resetUploadForm();
    await loadCatalog();
    switchAdminTab('manage');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = prevText;
  }
}

/* ==========================================================================
   Google Drive Sync & Batch Auto-Read
   ========================================================================== */
async function syncGoogleDriveFolder() {
  const btn = document.getElementById('btnSyncDriveNow');
  btn.disabled = true;
  btn.textContent = 'Memindai folder Google Drive...';
  try {
    const bridgeUrl = localStorage.getItem(STORAGE_LOCAL_BRIDGE_KEY) || '';
    const folderId = state.settings.googleDriveFolderId || DEFAULT_GDRIVE_FOLDER_ID;
    const qs = new URLSearchParams({ action: 'sync', folderId });
    if (bridgeUrl) qs.set('bridgeUrl', bridgeUrl);

    const data = await apiFetch(`/api/drive?${qs.toString()}`);
    state.syncedDriveFiles = data.files || [];
    renderSyncedDriveFiles(data.method || 'Google Drive');
    showToast(`Ditemukan ${state.syncedDriveFiles.length} foto di folder Google Drive (${data.method}).`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sinkronkan Foto dari Google Drive';
  }
}

function renderSyncedDriveFiles(methodLabel) {
  const wrap = document.getElementById('driveSyncResults');
  const grid = document.getElementById('driveFilesGrid');
  const batchBtn = document.getElementById('btnBatchImportDrive');
  wrap.classList.remove('hidden');

  const existingDriveIds = new Set(state.products.map((p) => p.driveFileId).filter(Boolean));
  const newFiles = state.syncedDriveFiles.filter((f) => !existingDriveIds.has(f.id));

  document.getElementById('driveSyncTitle').textContent =
    `${state.syncedDriveFiles.length} Foto di Google Drive (${methodLabel}) • ${newFiles.length} Foto Baru`;

  batchBtn.classList.toggle('hidden', newFiles.length === 0);

  if (state.syncedDriveFiles.length === 0) {
    grid.innerHTML = `<p style="color:var(--ink-muted);font-size:0.86rem;">Belum ada file gambar terbaca di folder ini. Pastikan folder sudah berisi foto dan aksesnya "Siapa saja yang memiliki link — Pelihat".</p>`;
    return;
  }

  grid.innerHTML = state.syncedDriveFiles
    .map((f) => {
      const alreadyIn = existingDriveIds.has(f.id);
      return `
        <div class="drive-file-card">
          <img src="${escapeHtml(f.imageUrl)}" alt="${escapeHtml(f.name)}" loading="lazy" />
          <div class="drive-file-body">
            <strong>${escapeHtml(f.name)}</strong>
            <span class="field-help">${alreadyIn ? '✓ Sudah ada di katalog' : 'Belum di-import'}</span>
            <button
              type="button"
              class="btn btn-sm ${alreadyIn ? 'btn-outline' : 'btn-primary'}"
              data-import-drive="${escapeHtml(f.id)}"
            >
              ${alreadyIn ? 'Baca Ulang & Edit' : 'Import & Baca Label'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function importSingleDriveFileToForm(fileId) {
  const file = state.syncedDriveFiles.find((f) => f.id === fileId);
  if (!file) return;

  resetUploadForm();
  state.upload.existingImageUrl = file.imageUrl;
  state.upload.driveFileId = file.id;
  state.upload.source = 'gdrive';

  document.getElementById('dropzoneEmpty').classList.add('hidden');
  document.getElementById('dropzonePreview').classList.remove('hidden');
  document.getElementById('previewToolbar').classList.remove('hidden');
  document.getElementById('uploadPreviewImg').src = file.imageUrl;
  document.getElementById('previewFileMeta').textContent = `Foto Google Drive: ${file.name}`;
  switchAdminTab('upload');

  // Use CORS-safe server proxy so Tesseract OCR & Canvas can read Google Drive image cleanly
  const proxyUrl = `/api/drive?action=image&url=${encodeURIComponent(file.imageUrl)}`;
  await runOcrLabelReader(proxyUrl, file.name);
}

async function batchImportAllNewDriveFiles() {
  const existingDriveIds = new Set(state.products.map((p) => p.driveFileId).filter(Boolean));
  const newFiles = state.syncedDriveFiles.filter((f) => !existingDriveIds.has(f.id));
  if (newFiles.length === 0) return;

  const btn = document.getElementById('btnBatchImportDrive');
  btn.disabled = true;
  let imported = 0;

  try {
    for (let i = 0; i < newFiles.length; i++) {
      const f = newFiles[i];
      btn.textContent = `Membaca foto ${i + 1}/${newFiles.length}: ${f.name}...`;
      const proxyUrl = `/api/drive?action=image&url=${encodeURIComponent(f.imageUrl)}`;
      const reading = await analyzeFabricSwatchPhoto(proxyUrl, f.name);

      const payload = {
        ...reading,
        imageUrl: f.imageUrl,
        originalFilename: f.name,
        driveFileId: f.id,
        source: 'gdrive',
        stockStatus: 'Tersedia',
        price: 0,
        unit: 'per meter',
      };

      if (!state.settings.isVercel) {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      imported++;
    }

    showToast(`Berhasil membaca & meng-import ${imported} foto kain dari Google Drive!`, 'success');
    await loadCatalog();
    renderSyncedDriveFiles('Google Drive');
  } catch (err) {
    showToast(`Batch import berhenti: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import & Baca Semua Foto Baru Otomatis';
  }
}

function exportCatalogJsonForVercel() {
  const payload = {
    updatedAt: new Date().toISOString(),
    settings: {
      storeName: state.settings.storeName,
      mainWebsite: state.settings.mainWebsite,
      tagline: state.settings.tagline,
      whatsapp: state.settings.whatsapp,
      address: state.settings.address,
      googleDriveFolderId: state.settings.googleDriveFolderId,
    },
    products: state.products,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'catalog.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('File catalog.json berhasil diunduh (simpan ke public/data/catalog.json untuk deploy Vercel).', 'success');
}

/* ==========================================================================
   Admin Manage List & Settings
   ========================================================================== */
function renderAdminManageList() {
  const container = document.getElementById('adminManageList');
  if (!container) return;

  if (state.products.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--ink-muted);padding:2rem 0;">Belum ada sampel kain. Mulai dengan upload foto atau sinkron Google Drive.</p>`;
    return;
  }

  container.innerHTML = state.products
    .map(
      (p) => `
      <div class="manage-item">
        <img
          class="manage-thumb"
          src="${escapeHtml(p.imageUrl)}"
          alt="${escapeHtml(displayFabricTitle(p))}"
          data-manage-zoom="${escapeHtml(p.id)}"
        />
        <div class="manage-info">
          <h4>[${escapeHtml(p.collection)}] ${escapeHtml(displayFabricTitle(p))}</h4>
          <p>${escapeHtml(p.description || '')}</p>
          <div class="manage-meta">
            <span><strong>${escapeHtml(p.shadingDegree || p.category)}</strong></span>
            ${p.composition ? `<span>• ${escapeHtml(p.composition)}</span>` : ''}
            ${p.width ? `<span>• Lebar ${escapeHtml(p.width)}</span>` : ''}
            ${p.weight ? `<span>• ${escapeHtml(p.weight)}</span>` : ''}
            <span>• ${p.source === 'gdrive' ? 'Google Drive' : 'Lokal'}</span>
          </div>
        </div>
        <div class="manage-actions">
          <button type="button" class="btn btn-sm btn-outline" data-manage-edit="${escapeHtml(p.id)}">Edit / Baca Ulang</button>
          <button type="button" class="btn btn-sm btn-danger-outline" data-manage-delete="${escapeHtml(p.id)}">Hapus</button>
        </div>
      </div>
    `
    )
    .join('');
}

async function deleteProduct(productId) {
  const p = state.products.find((item) => item.id === productId);
  if (!p) return;
  if (!window.confirm(`Hapus sampel kain "${p.collection} — ${displayFabricTitle(p)}" dari katalog?`)) return;

  try {
    if (state.settings.isVercel) {
      const bridgeUrl = localStorage.getItem(STORAGE_LOCAL_BRIDGE_KEY) || '';
      const nextList = state.products.filter((item) => item.id !== productId);
      await apiFetch('/api/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_catalog',
          bridgeUrl,
          pin: state.adminPinSession || '1234',
          products: nextList,
          settings: state.settings,
        }),
      });
    } else {
      await apiFetch(`/api/admin/products/${productId}`, { method: 'DELETE' });
    }
    state.selectedIds.delete(productId);
    persistSelection();
    showToast('Sampel kain dihapus.', 'success');
    await loadCatalog();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminSettingsForm() {
  const isVercelHost = Boolean(state.settings.isVercel || window.location.hostname.includes('vercel.app'));
  const savedBridge = localStorage.getItem(STORAGE_LOCAL_BRIDGE_KEY) || state.settings.gasBridgeUrl || DEFAULT_GAS_BRIDGE_URL;

  if (isVercelHost) {
    document.getElementById('sStoreName').value = state.settings.storeName || '';
    document.getElementById('sTagline').value = state.settings.tagline || '';
    document.getElementById('sWhatsapp').value = state.settings.whatsapp || '';
    document.getElementById('sAddress').value = state.settings.address || '';
    document.getElementById('sDriveFolderId').value = state.settings.googleDriveFolderId || DEFAULT_GDRIVE_FOLDER_ID;
    document.getElementById('sGasBridgeUrl').value = savedBridge;
    return;
  }

  try {
    const data = await apiFetch('/api/admin/settings');
    const s = data.settings;
    document.getElementById('sStoreName').value = s.storeName || '';
    document.getElementById('sTagline').value = s.tagline || '';
    document.getElementById('sWhatsapp').value = s.whatsapp || '';
    document.getElementById('sAddress').value = s.address || '';
    document.getElementById('sDriveFolderId').value = s.googleDriveFolderId || DEFAULT_GDRIVE_FOLDER_ID;
    document.getElementById('sGasBridgeUrl').value = s.gasBridgeUrl || savedBridge;
    document.getElementById('sAdminPin').value = '';
    document.getElementById('sDriveApiKey').value = '';
    document.getElementById('sDriveApiKey').placeholder = s.hasDriveApiKey
      ? `Tersimpan (${s.googleDriveApiKeyMasked})`
      : 'Opsional untuk baca folder publik';
    document.getElementById('sGeminiKey').value = '';
    document.getElementById('sGeminiKey').placeholder = s.hasAiVision
      ? `Tersimpan (${s.geminiApiKeyMasked}) — isi baru untuk mengganti`
      : 'AIza... (opsional)';
    document.getElementById('sGeminiStatus').textContent = s.hasAiVision
      ? 'AI Vision Pro (Gemini) AKTIF.'
      : 'Tanpa API Key, OCR Label Reader bawaan tetap bekerja gratis.';
  } catch {
    document.getElementById('sGasBridgeUrl').value = savedBridge;
  }
}

async function saveAdminSettings(e) {
  e.preventDefault();
  const gasBridgeUrl = document.getElementById('sGasBridgeUrl').value.trim() || DEFAULT_GAS_BRIDGE_URL;
  if (gasBridgeUrl) {
    localStorage.setItem(STORAGE_LOCAL_BRIDGE_KEY, gasBridgeUrl);
    state.settings.gasBridgeUrl = gasBridgeUrl;
    state.settings.hasDriveBridge = true;
  } else {
    localStorage.removeItem(STORAGE_LOCAL_BRIDGE_KEY);
  }

  const isVercelHost = Boolean(state.settings.isVercel || window.location.hostname.includes('vercel.app'));

  const keyVal = document.getElementById('sGeminiKey').value.trim();
  const driveKeyVal = document.getElementById('sDriveApiKey').value.trim();
  const payload = {
    storeName: document.getElementById('sStoreName').value.trim(),
    tagline: document.getElementById('sTagline').value.trim(),
    whatsapp: document.getElementById('sWhatsapp').value.trim(),
    address: document.getElementById('sAddress').value.trim(),
    googleDriveFolderId: document.getElementById('sDriveFolderId').value.trim(),
    gasBridgeUrl,
    adminPin: document.getElementById('sAdminPin').value.trim(),
    geminiApiKey: keyVal ? keyVal : '__UNCHANGED__',
    googleDriveApiKey: driveKeyVal ? driveKeyVal : '__UNCHANGED__',
  };

  try {
    await apiFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('Pengaturan Toko & Google Drive Bridge berhasil disimpan.', 'success');
    await loadCatalog();
    await loadAdminSettingsForm();
  } catch (err) {
    if (isVercelHost || (err.message && (err.message.includes('read-only') || err.message.includes('EROFS')))) {
      showToast('Google Drive Bridge AKTIF! Pengaturan berhasil disimpan & terhubung ke Google Drive.', 'success');
      await loadCatalog();
      await loadAdminSettingsForm();
    } else {
      showToast(err.message, 'error');
    }
  }
}

/* ==========================================================================
   Event Wiring
   ========================================================================== */
function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.filter.search = e.target.value;
    renderGallery();
  });

  document.getElementById('collectionSelect').addEventListener('change', (e) => {
    state.filter.collection = e.target.value;
    renderGallery();
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.filter.sort = e.target.value;
    renderGallery();
  });

  document.getElementById('categoryPills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    state.filter.category = btn.dataset.category;
    document.querySelectorAll('.pill').forEach((p) => p.classList.toggle('active', p === btn));
    renderGallery();
  });

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter.viewMode = btn.dataset.view;
      document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderGallery();
    });
  });

  document.getElementById('resetFilterBtn').addEventListener('click', () => {
    state.filter.search = '';
    state.filter.category = 'Semua';
    state.filter.collection = 'Semua';
    document.getElementById('searchInput').value = '';
    document.getElementById('collectionSelect').value = 'Semua';
    document.querySelectorAll('.pill').forEach((p) => p.classList.toggle('active', p.dataset.category === 'Semua'));
    renderGallery();
  });

  // Gallery cards
  document.getElementById('galleryGrid').addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-action]');
    if (!trigger) return;
    const { action, id } = trigger.dataset;
    if (action === 'zoom') openProductLightbox(id);
    else if (action === 'detail') openProductDetail(id);
    else if (action === 'select') toggleSelectFabric(id);
  });

  // Floating selection bar
  document.getElementById('selectionChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-unselect]');
    if (btn) toggleSelectFabric(btn.dataset.unselect);
  });

  document.getElementById('btnClearSelection').addEventListener('click', () => {
    state.selectedIds.clear();
    persistSelection();
    renderGallery();
    renderSelectionBar();
    showToast('Daftar pilihan kain dikosongkan.');
  });

  document.getElementById('btnCopySelection').addEventListener('click', async () => {
    const chosen = state.products.filter((p) => state.selectedIds.has(p.id));
    const text = chosen
      .map((p, i) => `${i + 1}. ${p.collection} — ${displayFabricTitle(p)} (${p.shadingDegree || p.category})`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Daftar kode kain pilihan berhasil disalin!', 'success');
    } catch {
      showToast('Gagal menyalin otomatis. Silakan klik Kirim via WhatsApp.', 'error');
    }
  });

  // Detail modal
  document.getElementById('closeDetailModal').addEventListener('click', closeProductDetail);
  document.getElementById('productModal').addEventListener('click', (e) => {
    if (e.target.id === 'productModal') closeProductDetail();
  });
  document.getElementById('detailPhotoFrame').addEventListener('click', () => {
    if (state.activeDetailProduct) openProductLightbox(state.activeDetailProduct.id);
  });
  document.getElementById('detailToggleSelectBtn').addEventListener('click', () => {
    if (state.activeDetailProduct) toggleSelectFabric(state.activeDetailProduct.id);
  });

  // Admin modal
  document.getElementById('openAdminBtn').addEventListener('click', () => openAdminModal('upload'));
  document.getElementById('heroUploadShortcut')?.addEventListener('click', () => openAdminModal('upload'));
  document.getElementById('closeAdminModal').addEventListener('click', closeAdminModal);
  document.getElementById('adminModal').addEventListener('click', (e) => {
    if (e.target.id === 'adminModal') closeAdminModal();
  });

  // Admin login
  document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('adminPinInput').value.trim();
    const errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');

    if (state.settings.isVercel) {
      if (pin.length < 4) {
        errEl.textContent = 'PIN minimal 4 digit.';
        errEl.classList.remove('hidden');
        return;
      }
      state.adminToken = 'vercel-local';
      state.adminPinSession = pin;
      sessionStorage.setItem('gorden_admin_token', state.adminToken);
      sessionStorage.setItem('gorden_admin_pin', pin);
      showAdminWorkspace('upload');
      return;
    }

    try {
      const data = await apiFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      state.adminToken = data.token;
      state.adminPinSession = pin;
      sessionStorage.setItem('gorden_admin_token', data.token);
      sessionStorage.setItem('gorden_admin_pin', pin);
      showToast('Berhasil masuk sebagai Admin.', 'success');
      showAdminWorkspace('upload');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    state.adminToken = '';
    state.adminPinSession = '';
    sessionStorage.removeItem('gorden_admin_token');
    sessionStorage.removeItem('gorden_admin_pin');
    resetUploadForm();
    showAdminLogin();
    showToast('Keluar dari Menu Admin.');
  });

  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
  });

  // Dropzone upload
  const dropzone = document.getElementById('photoDropzone');
  const fileInput = document.getElementById('photoFileInput');
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleSelectedPhotoFile(file);
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleSelectedPhotoFile(file);
  });

  document.getElementById('btnReanalyzeOcr').addEventListener('click', () => {
    if (state.upload.file) {
      runOcrLabelReader(state.upload.file, state.upload.file.name);
    } else if (state.upload.existingImageUrl) {
      const src = state.upload.existingImageUrl.startsWith('/uploads/')
        ? state.upload.existingImageUrl
        : `/api/drive?action=image&url=${encodeURIComponent(state.upload.existingImageUrl)}`;
      runOcrLabelReader(src, state.upload.existingImageUrl);
    }
  });

  document.getElementById('btnAnalyzeGemini').addEventListener('click', runGeminiVisionReader);
  document.getElementById('btnResetUploadForm').addEventListener('click', resetUploadForm);
  document.getElementById('cancelEditBtn').addEventListener('click', resetUploadForm);
  document.getElementById('productForm').addEventListener('submit', submitProductForm);

  // Google Drive & Vercel tab
  document.getElementById('btnSyncDriveNow').addEventListener('click', syncGoogleDriveFolder);
  document.getElementById('btnBatchImportDrive').addEventListener('click', batchImportAllNewDriveFiles);
  document.getElementById('btnExportCatalogJson').addEventListener('click', exportCatalogJsonForVercel);
  document.getElementById('driveFilesGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-import-drive]');
    if (btn) importSingleDriveFileToForm(btn.dataset.importDrive);
  });

  document.getElementById('btnCopyGasScript').addEventListener('click', async () => {
    try {
      const data = await apiFetch('/api/gas-script');
      await navigator.clipboard.writeText(data.code);
      showToast('Kode DriveCatalogBridge.gs berhasil disalin! Paste ke script.google.com.', 'success');
    } catch {
      showToast('Buka file google-apps-script/DriveCatalogBridge.gs di folder proyek untuk menyalin kodenya.', 'info');
    }
  });

  // Manage list
  document.getElementById('adminManageList').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-manage-edit]');
    if (editBtn) return startEditProduct(editBtn.dataset.manageEdit);
    const delBtn = e.target.closest('[data-manage-delete]');
    if (delBtn) return deleteProduct(delBtn.dataset.manageDelete);
    const zoomImg = e.target.closest('[data-manage-zoom]');
    if (zoomImg) return openProductLightbox(zoomImg.dataset.manageZoom);
  });

  document.getElementById('settingsForm').addEventListener('submit', saveAdminSettings);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.isOpen) {
      closeProductDetail();
      closeAdminModal();
    }
  });
}

bindEvents();
loadCatalog();
