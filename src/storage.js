'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PUBLIC_UPLOADS_DIR = path.join(ROOT_DIR, 'public', 'uploads');
const PUBLIC_CATALOG_FILE = path.join(ROOT_DIR, 'public', 'data', 'catalog.json');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULT_GDRIVE_FOLDER_ID = '1W8wTEg03Aqiv-rJHvoFngwYpg1u-Hjlw';

const ALLOWED_MIME_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

const PROTECTED_SAMPLE_FILES = new Set([
  'NB-03A-FROST.jpg',
  'NB-07A-STERLING.jpg',
]);

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(PUBLIC_CATALOG_FILE), { recursive: true });
}

const DEFAULT_SETTINGS = {
  storeName: 'Gorden Magelang',
  mainWebsite: 'https://www.gordenmagelang.web.id',
  tagline: 'Foto sampel asli HD — Klik foto untuk zoom detail serat & label, pilih kode favorit Anda lalu kirim langsung ke WhatsApp.',
  whatsapp: '6285734103666',
  address: 'Gorden Magelang — Survey & Ukur Gratis Magelang dan Sekitarnya',
  adminPin: '1234',
  geminiApiKey: '',
  googleDriveFolderId: DEFAULT_GDRIVE_FOLDER_ID,
  googleDriveApiKey: '',
  gasBridgeUrl: '',
};

const SEED_FABRICS = [
  {
    id: 'kain-nb-03a-frost',
    collection: 'NIGHT BLOCK',
    code: 'NB-03A',
    colorName: 'FROST',
    brand: 'SD',
    category: 'Blackout 100%',
    shadingDegree: '100% Blackout',
    composition: '30% Linen 70% Polyester',
    width: '320 cm',
    weight: '260 Gsm/sq.Mtr',
    fireRetardant: 'NFPA260 / British BS4881 (Upon Request)',
    patternTexture: 'Tekstur Anyaman Linen Halus Polos (Matte)',
    roomRecommendation: 'Kamar Tidur Utama, Ruang Tamu Minimalis, Apartemen',
    price: 0,
    unit: 'per meter',
    stockStatus: 'Tersedia',
    imageUrl: '/uploads/NB-03A-FROST.jpg',
    originalFilename: 'NB-03A-FROST.jpg',
    driveFileId: '',
    source: 'local',
    imageMeta: {
      width: 768,
      height: 1024,
      sizeBytes: 0,
      mimeType: 'image/jpeg',
    },
    palette: ['#D2D3D1', '#A5A8AA', '#85888A', '#E3E3E1'],
    description:
      'Kain gorden koleksi NIGHT BLOCK kode NB-03A warna FROST (abu-abu silver terang sejuk) dengan tingkat penahan cahaya 100% Blackout. Terbuat dari perpaduan 30% Linen dan 70% Polyester bertekstur anyaman halus yang elegan, lebar ekstra 320 cm (minim sambungan untuk jendela tinggi), dengan gramasi 260 Gsm/sq.Mtr.',
    rawOcrText:
      'Collection: NIGHT BLOCK | Brand: SD | Color: NB-03A FROST | Shading Degree: 100% Blackout | Composition: 30% Linen 70% Polyester | Width: 320cm | Weight: 260Gsm/sq.Mtr | Fire Retardant NFPA260 British BS4881 Upon Request',
    analysisEngine: 'OCR & Label Reader',
    createdAt: '2026-11-18T14:20:00.000Z',
    updatedAt: '2026-11-18T14:20:00.000Z',
  },
  {
    id: 'kain-nb-07a-sterling',
    collection: 'NIGHT BLOCK',
    code: 'NB-07A',
    colorName: 'STERLING',
    brand: 'SD',
    category: 'Blackout 100%',
    shadingDegree: '100% Blackout',
    composition: '30% Linen 70% Polyester',
    width: '320 cm',
    weight: '260 Gsm/sq.Mtr',
    fireRetardant: 'NFPA260 / British BS4881 (Upon Request)',
    patternTexture: 'Motif Tenun Abstrak Geometris Modern (Jacquard Matte)',
    roomRecommendation: 'Ruang Tamu Modern, Kamar Tidur Utama, Ruang Kerja / Hotel',
    price: 0,
    unit: 'per meter',
    stockStatus: 'Tersedia',
    imageUrl: '/uploads/NB-07A-STERLING.jpg',
    originalFilename: 'NB-07A-STERLING.jpg',
    driveFileId: '',
    source: 'local',
    imageMeta: {
      width: 768,
      height: 1024,
      sizeBytes: 0,
      mimeType: 'image/jpeg',
    },
    palette: ['#9DA0A2', '#C5C7C8', '#707375', '#DFDFDD'],
    description:
      'Kain gorden koleksi NIGHT BLOCK kode NB-07A warna STERLING dengan motif tenun abstrak abu-abu modern yang artistik dan kemampuan blokir cahaya penuh 100% Blackout. Menggunakan komposisi 30% Linen dan 70% Polyester berkualitas tinggi, lebar kain 320 cm dan berat 260 Gsm/sq.Mtr, ideal untuk tampilan ruang modern berkelas.',
    rawOcrText:
      'Collection: NIGHT BLOCK | Brand: SD | Color: NB-07A STERLING | Shading Degree: 100% Blackout | Composition: 30% Linen 70% Polyester | Width: 320cm | Weight: 260Gsm/sq.Mtr | Fire Retardant NFPA260 British BS4881 Upon Request',
    analysisEngine: 'OCR & Label Reader',
    createdAt: '2026-11-18T14:22:00.000Z',
    updatedAt: '2026-11-18T14:22:00.000Z',
  },
];

function hydrateFileSizes(products) {
  return products.map((item) => {
    if (item.imageUrl && item.imageUrl.startsWith('/uploads/')) {
      const filename = path.basename(item.imageUrl);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        return {
          ...item,
          imageMeta: {
            ...(item.imageMeta || {}),
            sizeBytes: stat.size,
          },
        };
      }
    }
    return item;
  });
}

function syncPublicStaticCatalog(products, settings) {
  try {
    ensureDirs();
    const publicPayload = {
      updatedAt: new Date().toISOString(),
      settings: {
        storeName: settings.storeName,
        tagline: settings.tagline,
        whatsapp: settings.whatsapp,
        address: settings.address,
        googleDriveFolderId: settings.googleDriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
      },
      products,
    };
    fs.writeFileSync(PUBLIC_CATALOG_FILE, JSON.stringify(publicPayload, null, 2), 'utf8');
  } catch {
    // Ignore on read-only environments
  }
}

function initStorage(forceResetIfOldSchema = true) {
  ensureDirs();
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
  }
  let shouldSeed = !fs.existsSync(CATALOG_FILE);
  if (!shouldSeed && forceResetIfOldSchema) {
    try {
      const existing = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      // Upgrade seamlessly if previous seed was old curtain-room demo without fabric `code` & `collection`
      if (Array.isArray(existing) && existing.length > 0 && !existing[0].code && !existing[0].collection) {
        shouldSeed = true;
      }
    } catch {
      shouldSeed = true;
    }
  }

  if (shouldSeed) {
    const hydrated = hydrateFileSizes(SEED_FABRICS);
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(hydrated, null, 2), 'utf8');
    syncPublicStaticCatalog(hydrated, getSettings());
  } else if (!fs.existsSync(PUBLIC_CATALOG_FILE)) {
    syncPublicStaticCatalog(getProducts(), getSettings());
  }
}

function getSettings() {
  ensureDirs();
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (!merged.googleDriveFolderId) merged.googleDriveFolderId = DEFAULT_GDRIVE_FOLDER_ID;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function extractDriveFolderId(input = '') {
  const trimmed = String(input).trim();
  if (!trimmed) return DEFAULT_GDRIVE_FOLDER_ID;
  const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed;
}

function saveSettings(partial) {
  const current = getSettings();
  const next = {
    ...current,
    storeName: typeof partial.storeName === 'string' && partial.storeName.trim() ? partial.storeName.trim() : current.storeName,
    tagline: typeof partial.tagline === 'string' && partial.tagline.trim() ? partial.tagline.trim() : current.tagline,
    whatsapp: typeof partial.whatsapp === 'string' ? partial.whatsapp.replace(/[^\d]/g, '') || current.whatsapp : current.whatsapp,
    address: typeof partial.address === 'string' ? partial.address.trim() : current.address,
    adminPin: typeof partial.adminPin === 'string' && partial.adminPin.trim().length >= 4 ? partial.adminPin.trim() : current.adminPin,
    geminiApiKey: typeof partial.geminiApiKey === 'string' ? partial.geminiApiKey.trim() : current.geminiApiKey,
    googleDriveFolderId:
      typeof partial.googleDriveFolderId === 'string'
        ? extractDriveFolderId(partial.googleDriveFolderId)
        : current.googleDriveFolderId,
    googleDriveApiKey:
      typeof partial.googleDriveApiKey === 'string'
        ? partial.googleDriveApiKey.trim()
        : current.googleDriveApiKey,
    gasBridgeUrl:
      typeof partial.gasBridgeUrl === 'string'
        ? partial.gasBridgeUrl.trim()
        : current.gasBridgeUrl,
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  syncPublicStaticCatalog(getProducts(), next);
  return next;
}

function getPublicSettings() {
  const s = getSettings();
  return {
    storeName: s.storeName,
    mainWebsite: s.mainWebsite || 'https://www.gordenmagelang.web.id',
    tagline: s.tagline,
    whatsapp: s.whatsapp,
    address: s.address,
    googleDriveFolderId: s.googleDriveFolderId || DEFAULT_GDRIVE_FOLDER_ID,
    googleDriveFolderUrl: `https://drive.google.com/drive/folders/${s.googleDriveFolderId || DEFAULT_GDRIVE_FOLDER_ID}`,
    hasAiVision: Boolean(s.geminiApiKey && s.geminiApiKey.trim()),
    hasDriveBridge: Boolean(s.gasBridgeUrl && s.gasBridgeUrl.trim()),
    hasDriveApiKey: Boolean(s.googleDriveApiKey && s.googleDriveApiKey.trim()),
  };
}

function getProducts() {
  initStorage();
  try {
    const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
    const items = JSON.parse(raw);
    return hydrateFileSizes(Array.isArray(items) ? items : []);
  } catch {
    return hydrateFileSizes(SEED_FABRICS);
  }
}

function saveProducts(products) {
  ensureDirs();
  const tmpFile = `${CATALOG_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(products, null, 2), 'utf8');
  fs.renameSync(tmpFile, CATALOG_FILE);
  syncPublicStaticCatalog(products, getSettings());
}

function saveUploadedPhoto(fileObj, codeHint = '') {
  ensureDirs();
  const mime = (fileObj.contentType || '').toLowerCase().split(';')[0].trim();
  let ext = ALLOWED_MIME_MAP[mime];
  if (!ext) {
    const origExt = path.extname(fileObj.filename || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(origExt)) {
      ext = origExt === '.jpeg' ? '.jpg' : origExt;
    } else {
      throw new Error('Format foto tidak didukung. Gunakan JPG, PNG, WEBP, atau AVIF.');
    }
  }

  const baseName = codeHint || path.basename(fileObj.filename || 'kain', path.extname(fileObj.filename || ''));
  const safeSlug = baseName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'KAIN';

  const uniqueId = crypto.randomBytes(3).toString('hex');
  const finalName = `${safeSlug}-${Date.now()}-${uniqueId}${ext}`;
  const fullPath = path.join(UPLOADS_DIR, finalName);
  const publicPath = path.join(PUBLIC_UPLOADS_DIR, finalName);

  // Save verbatim original bytes (lossless) to both uploads/ and public/uploads/ (Vercel-ready)
  fs.writeFileSync(fullPath, fileObj.data);
  fs.writeFileSync(publicPath, fileObj.data);

  return {
    filename: finalName,
    imageUrl: `/uploads/${finalName}`,
    sizeBytes: fileObj.data.length,
    mimeType: mime || 'image/jpeg',
  };
}

function deleteUploadedPhotoIfCustom(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
  const filename = path.basename(imageUrl);
  if (PROTECTED_SAMPLE_FILES.has(filename)) return;
  for (const dir of [UPLOADS_DIR, PUBLIC_UPLOADS_DIR]) {
    const fullPath = path.join(dir, filename);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // Ignore
      }
    }
  }
}

function getUploadAbsolutePath(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return null;
  const filename = path.basename(imageUrl);
  const p1 = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(PUBLIC_UPLOADS_DIR, filename);
  return fs.existsSync(p2) ? p2 : null;
}

module.exports = {
  DEFAULT_GDRIVE_FOLDER_ID,
  UPLOADS_DIR,
  PUBLIC_UPLOADS_DIR,
  initStorage,
  getSettings,
  saveSettings,
  getPublicSettings,
  getProducts,
  saveProducts,
  saveUploadedPhoto,
  deleteUploadedPhotoIfCustom,
  getUploadAbsolutePath,
};
