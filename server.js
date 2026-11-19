'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseMultipart, parseJsonBody } = require('./src/multipart');
const {
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
} = require('./src/storage');
const { analyzeCurtainWithGemini } = require('./src/geminiVision');
const {
  DEFAULT_FOLDER_ID,
  syncDriveFolder,
  postToGasBridge,
  fetchRemoteImageAsBuffer,
} = require('./src/driveService');

const PORT = Number(process.env.PORT) || 3456;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const GAS_SCRIPT_PATH = path.resolve(__dirname, 'google-apps-script', 'DriveCatalogBridge.gs');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

const adminSessions = new Set();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message });
}

function isAdminAuthorized(req) {
  const token = req.headers['x-admin-token'];
  return typeof token === 'string' && adminSessions.has(token);
}

function serveStaticFile(res, baseDir, relPath, cacheControl = 'no-cache') {
  const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(baseDir, safePath);

  if (!fullPath.startsWith(baseDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(fullPath);

  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  });
  fs.createReadStream(fullPath).pipe(res);
}

function safeParseJson(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function buildFabricRecord(input, existing = {}) {
  const now = new Date().toISOString();
  const palette = Array.isArray(input.palette)
    ? input.palette
    : safeParseJson(input.palette, existing.palette || []);

  const code = String(input.code !== undefined ? input.code : existing.code || '').trim().toUpperCase();
  const colorName = String(input.colorName !== undefined ? input.colorName : existing.colorName || '').trim().toUpperCase();
  const collection = String(input.collection !== undefined ? input.collection : existing.collection || '').trim().toUpperCase();

  return {
    id: existing.id || `kain-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    collection: collection || 'KOLEKSI GORDEN',
    code: code || `KAIN-${Date.now().toString().slice(-4)}`,
    colorName: colorName || '',
    brand: String(input.brand !== undefined ? input.brand : existing.brand || '').trim(),
    category: String(input.category !== undefined ? input.category : existing.category || 'Blackout 100%').trim(),
    shadingDegree: String(input.shadingDegree !== undefined ? input.shadingDegree : existing.shadingDegree || '').trim(),
    composition: String(input.composition !== undefined ? input.composition : existing.composition || '').trim(),
    width: String(input.width !== undefined ? input.width : existing.width || '').trim(),
    weight: String(input.weight !== undefined ? input.weight : existing.weight || '').trim(),
    fireRetardant: String(input.fireRetardant !== undefined ? input.fireRetardant : existing.fireRetardant || '').trim(),
    patternTexture: String(input.patternTexture !== undefined ? input.patternTexture : existing.patternTexture || '').trim(),
    roomRecommendation: String(input.roomRecommendation !== undefined ? input.roomRecommendation : existing.roomRecommendation || '').trim(),
    price: input.price !== undefined ? Math.max(0, Number(input.price) || 0) : existing.price || 0,
    unit: String(input.unit !== undefined ? input.unit : existing.unit || 'per meter').trim(),
    stockStatus: String(input.stockStatus !== undefined ? input.stockStatus : existing.stockStatus || 'Tersedia').trim(),
    description: String(input.description !== undefined ? input.description : existing.description || '').trim(),
    rawOcrText: String(input.rawOcrText !== undefined ? input.rawOcrText : existing.rawOcrText || '').trim(),
    palette: Array.isArray(palette) ? palette.slice(0, 5) : [],
    analysisEngine: String(input.analysisEngine || existing.analysisEngine || 'OCR & Label Reader').trim(),
    driveFileId: String(input.driveFileId !== undefined ? input.driveFileId : existing.driveFileId || '').trim(),
    source: String(input.source || existing.source || 'local').trim(),
    imageUrl: input.imageUrl || existing.imageUrl || '',
    originalFilename: input.originalFilename || existing.originalFilename || '',
    imageMeta: input.imageMeta || existing.imageMeta || { width: 0, height: 0, sizeBytes: 0, mimeType: 'image/jpeg' },
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

async function handleApi(req, res, parsedUrl) {
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const method = req.method.toUpperCase();

  // Public: GET /api/catalog
  if (method === 'GET' && pathname === '/api/catalog') {
    return sendJson(res, 200, {
      ok: true,
      products: getProducts(),
      settings: getPublicSettings(),
    });
  }

  // Public: GET /api/gas-script (for 1-click copy in Admin setup guide)
  if (method === 'GET' && pathname === '/api/gas-script') {
    const code = fs.existsSync(GAS_SCRIPT_PATH) ? fs.readFileSync(GAS_SCRIPT_PATH, 'utf8') : '';
    return sendJson(res, 200, { ok: true, code });
  }

  // Public/Admin: /api/drive (sync Google Drive folder, proxy Drive image for OCR, or POST to Apps Script Bridge)
  if (pathname === '/api/drive') {
    const settings = getSettings();
    const action = parsedUrl.searchParams.get('action') || 'sync';

    if (method === 'GET' && action === 'image') {
      const targetUrl = parsedUrl.searchParams.get('url');
      if (!targetUrl) return sendError(res, 400, 'Parameter url wajib diisi.');
      const { buffer, contentType } = await fetchRemoteImageAsBuffer(targetUrl);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        'Cache-Control': 'public, max-age=3600',
      });
      return res.end(buffer);
    }

    if (method === 'GET' && action === 'sync') {
      const folderId = parsedUrl.searchParams.get('folderId') || settings.googleDriveFolderId || DEFAULT_FOLDER_ID;
      const gasBridgeUrl = parsedUrl.searchParams.get('bridgeUrl') || settings.gasBridgeUrl || '';
      const googleDriveApiKey = parsedUrl.searchParams.get('driveApiKey') || settings.googleDriveApiKey || '';
      const result = await syncDriveFolder({ folderId, gasBridgeUrl, googleDriveApiKey });
      return sendJson(res, 200, { ok: true, folderId, ...result });
    }

    if (method === 'POST') {
      const body = await parseJsonBody(req, 30 * 1024 * 1024);
      const bridgeUrl = body.bridgeUrl || settings.gasBridgeUrl || '';
      if (!bridgeUrl) {
        return sendError(res, 400, 'Google Apps Script Bridge URL belum diatur di Pengaturan.');
      }
      const result = await postToGasBridge(bridgeUrl, body);
      return sendJson(res, 200, result);
    }
  }

  // Public: POST /api/admin/login
  if (method === 'POST' && pathname === '/api/admin/login') {
    const body = await parseJsonBody(req);
    const settings = getSettings();
    const inputPin = String(body.pin || '').trim();
    if (!inputPin || inputPin !== settings.adminPin) {
      return sendError(res, 401, 'PIN Admin salah. Silakan coba lagi.');
    }
    const token = crypto.randomBytes(24).toString('hex');
    adminSessions.add(token);
    return sendJson(res, 200, { ok: true, token, settings: getPublicSettings() });
  }

  // Admin session verify
  if (method === 'GET' && pathname === '/api/admin/session') {
    if (!isAdminAuthorized(req)) return sendError(res, 401, 'Sesi admin tidak valid.');
    return sendJson(res, 200, { ok: true, settings: getPublicSettings() });
  }

  // Protected /api/admin/* endpoints
  if (pathname.startsWith('/api/admin/')) {
    if (!isAdminAuthorized(req)) {
      return sendError(res, 401, 'Akses ditolak. Silakan masuk sebagai Admin terlebih dahulu.');
    }
  }

  // Admin: GET /api/admin/settings
  if (method === 'GET' && pathname === '/api/admin/settings') {
    const s = getSettings();
    return sendJson(res, 200, {
      ok: true,
      settings: {
        storeName: s.storeName,
        tagline: s.tagline,
        whatsapp: s.whatsapp,
        address: s.address,
        googleDriveFolderId: s.googleDriveFolderId || DEFAULT_FOLDER_ID,
        gasBridgeUrl: s.gasBridgeUrl || '',
        hasDriveApiKey: Boolean(s.googleDriveApiKey),
        googleDriveApiKeyMasked: s.googleDriveApiKey ? `${s.googleDriveApiKey.slice(0, 6)}••••` : '',
        hasAiVision: Boolean(s.geminiApiKey),
        geminiApiKeyMasked: s.geminiApiKey ? `${s.geminiApiKey.slice(0, 6)}••••••${s.geminiApiKey.slice(-4)}` : '',
      },
    });
  }

  // Admin: PUT /api/admin/settings
  if (method === 'PUT' && pathname === '/api/admin/settings') {
    const body = await parseJsonBody(req);
    const update = {
      storeName: body.storeName,
      tagline: body.tagline,
      whatsapp: body.whatsapp,
      address: body.address,
      googleDriveFolderId: body.googleDriveFolderId,
      gasBridgeUrl: body.gasBridgeUrl,
    };
    if (body.adminPin && String(body.adminPin).trim().length >= 4) {
      update.adminPin = String(body.adminPin).trim();
    }
    if (typeof body.geminiApiKey === 'string' && body.geminiApiKey !== '__UNCHANGED__') {
      update.geminiApiKey = body.geminiApiKey;
    }
    if (typeof body.googleDriveApiKey === 'string' && body.googleDriveApiKey !== '__UNCHANGED__') {
      update.googleDriveApiKey = body.googleDriveApiKey;
    }
    const saved = saveSettings(update);
    return sendJson(res, 200, {
      ok: true,
      settings: getPublicSettings(),
      hasAiVision: Boolean(saved.geminiApiKey),
    });
  }

  // Analyze Vision (works on both /api/admin/analyze-vision and /api/analyze-vision)
  if (method === 'POST' && (pathname === '/api/admin/analyze-vision' || pathname === '/api/analyze-vision')) {
    const settings = getSettings();
    const contentType = req.headers['content-type'] || '';
    let imageBuffer;
    let mimeType = 'image/jpeg';
    let filename = 'sampel-kain.jpg';
    let apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';

    if (contentType.includes('multipart/form-data')) {
      const { files } = await parseMultipart(req);
      const photo = files.photo;
      if (!photo || !photo.data || photo.data.length === 0) {
        return sendError(res, 400, 'File foto sampel kain tidak ditemukan.');
      }
      imageBuffer = photo.data;
      mimeType = photo.contentType || 'image/jpeg';
      filename = photo.filename || 'sampel-kain.jpg';
    } else {
      const body = await parseJsonBody(req, 30 * 1024 * 1024);
      if (body.apiKey) apiKey = body.apiKey;
      filename = body.filename || filename;
      mimeType = body.mimeType || mimeType;
      if (body.base64) {
        imageBuffer = Buffer.from(body.base64, 'base64');
      } else if (body.imageUrl) {
        if (body.imageUrl.startsWith('/uploads/')) {
          const absPath = getUploadAbsolutePath(body.imageUrl);
          if (!absPath) return sendError(res, 404, 'File foto lokal tidak ditemukan.');
          imageBuffer = fs.readFileSync(absPath);
          const ext = path.extname(absPath).toLowerCase();
          mimeType = MIME_TYPES[ext] || 'image/jpeg';
          filename = path.basename(absPath);
        } else {
          const fetched = await fetchRemoteImageAsBuffer(body.imageUrl);
          imageBuffer = fetched.buffer;
          mimeType = fetched.contentType;
        }
      } else {
        return sendError(res, 400, 'Foto belum disediakan.');
      }
    }

    if (!apiKey) {
      return sendError(
        res,
        400,
        'Gemini API Key belum diatur di Pengaturan. Gunakan OCR Label Reader gratis atau isi Gemini API Key untuk AI Vision Pro.'
      );
    }

    const result = await analyzeCurtainWithGemini({ apiKey, imageBuffer, mimeType, filename });
    return sendJson(res, 200, { ok: true, result });
  }

  // Admin: POST /api/admin/products (supports multipart file upload OR JSON with Google Drive URL)
  if (method === 'POST' && pathname === '/api/admin/products') {
    const contentType = req.headers['content-type'] || '';
    const settings = getSettings();
    let fields = {};
    let photo = null;

    if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipart(req);
      fields = parsed.fields;
      photo = parsed.files.photo || null;
    } else {
      fields = await parseJsonBody(req, 10 * 1024 * 1024);
    }

    let imageUrl = fields.imageUrl || '';
    let originalFilename = fields.originalFilename || '';
    let driveFileId = fields.driveFileId || '';
    let source = fields.source || 'local';
    let imageMeta = safeParseJson(fields.imageMeta, {});

    if (photo && photo.data && photo.data.length > 0) {
      // Save lossless locally
      const codeHint = `${fields.code || ''}-${fields.colorName || ''}`.trim();
      const savedLocal = saveUploadedPhoto(photo, codeHint);
      imageUrl = savedLocal.imageUrl;
      originalFilename = photo.filename || savedLocal.filename;
      imageMeta = {
        width: Number(imageMeta.width) || 0,
        height: Number(imageMeta.height) || 0,
        sizeBytes: savedLocal.sizeBytes,
        mimeType: savedLocal.mimeType,
      };

      // If Google Apps Script Bridge is configured, also mirror the original photo directly to Google Drive!
      if (settings.gasBridgeUrl && fields.uploadToDrive !== 'false') {
        try {
          const uploadedDrive = await postToGasBridge(settings.gasBridgeUrl, {
            action: 'upload_photo',
            pin: settings.adminPin,
            filename: savedLocal.filename,
            mimeType: savedLocal.mimeType,
            base64: photo.data.toString('base64'),
          });
          if (uploadedDrive.ok && uploadedDrive.file) {
            driveFileId = uploadedDrive.file.id;
            imageUrl = uploadedDrive.file.imageUrl;
            source = 'gdrive';
          }
        } catch (err) {
          console.warn('[Drive Bridge Upload Warning]', err.message);
        }
      }
    }

    if (!imageUrl) {
      return sendError(res, 400, 'Foto sampel kain wajib diunggah atau berasal dari Google Drive.');
    }

    const newFabric = buildFabricRecord({
      ...fields,
      imageUrl,
      originalFilename,
      driveFileId,
      source,
      imageMeta,
    });

    const products = getProducts();
    products.unshift(newFabric);
    saveProducts(products);

    // Sync catalog JSON to Google Drive Bridge if active
    if (settings.gasBridgeUrl) {
      postToGasBridge(settings.gasBridgeUrl, {
        action: 'save_catalog',
        pin: settings.adminPin,
        products,
        settings: getPublicSettings(),
      }).catch((e) => console.warn('[Drive Catalog Sync Warning]', e.message));
    }

    return sendJson(res, 201, { ok: true, product: newFabric });
  }

  // Admin: PUT /api/admin/products/:id
  const productIdMatch = pathname.match(/^\/api\/admin\/products\/([a-zA-Z0-9_-]+)$/);
  if (productIdMatch && method === 'PUT') {
    const id = productIdMatch[1];
    const products = getProducts();
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return sendError(res, 404, 'Data kain tidak ditemukan.');

    const existing = products[idx];
    const settings = getSettings();
    const contentType = req.headers['content-type'] || '';
    let updates = {};
    let newPhoto = null;

    if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipart(req);
      updates = parsed.fields;
      if (parsed.files.photo && parsed.files.photo.data?.length > 0) {
        newPhoto = parsed.files.photo;
      }
    } else {
      updates = await parseJsonBody(req);
    }

    let imageUrl = updates.imageUrl || existing.imageUrl;
    let originalFilename = updates.originalFilename || existing.originalFilename;
    let driveFileId = updates.driveFileId !== undefined ? updates.driveFileId : existing.driveFileId;
    let source = updates.source || existing.source;
    let imageMeta = existing.imageMeta || {};

    if (newPhoto) {
      const codeHint = `${updates.code || existing.code}-${updates.colorName || existing.colorName}`;
      const savedLocal = saveUploadedPhoto(newPhoto, codeHint);
      deleteUploadedPhotoIfCustom(existing.imageUrl);
      imageUrl = savedLocal.imageUrl;
      originalFilename = newPhoto.filename || savedLocal.filename;
      const incomingMeta = safeParseJson(updates.imageMeta, {});
      imageMeta = {
        width: Number(incomingMeta.width) || 0,
        height: Number(incomingMeta.height) || 0,
        sizeBytes: savedLocal.sizeBytes,
        mimeType: savedLocal.mimeType,
      };
      source = 'local';
    }

    const updated = buildFabricRecord(
      { ...updates, imageUrl, originalFilename, driveFileId, source, imageMeta },
      existing
    );

    products[idx] = updated;
    saveProducts(products);

    if (settings.gasBridgeUrl) {
      postToGasBridge(settings.gasBridgeUrl, {
        action: 'save_catalog',
        pin: settings.adminPin,
        products,
        settings: getPublicSettings(),
      }).catch(() => {});
    }

    return sendJson(res, 200, { ok: true, product: updated });
  }

  // Admin: DELETE /api/admin/products/:id
  if (productIdMatch && method === 'DELETE') {
    const id = productIdMatch[1];
    const products = getProducts();
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return sendError(res, 404, 'Data kain tidak ditemukan.');

    const [removed] = products.splice(idx, 1);
    saveProducts(products);
    deleteUploadedPhotoIfCustom(removed.imageUrl);

    const settings = getSettings();
    if (settings.gasBridgeUrl) {
      postToGasBridge(settings.gasBridgeUrl, {
        action: 'save_catalog',
        pin: settings.adminPin,
        products,
        settings: getPublicSettings(),
      }).catch(() => {});
    }

    return sendJson(res, 200, { ok: true, deletedId: id });
  }

  return sendError(res, 404, 'Endpoint API tidak ditemukan.');
}

initStorage(true);

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, parsedUrl);
    }

    if (pathname.startsWith('/uploads/')) {
      const filename = pathname.slice('/uploads/'.length);
      const inUploads = path.join(UPLOADS_DIR, path.basename(filename));
      const base = fs.existsSync(inUploads) ? UPLOADS_DIR : PUBLIC_UPLOADS_DIR;
      return serveStaticFile(res, base, filename, 'public, max-age=3600');
    }

    const relPublicPath = pathname === '/' ? 'index.html' : pathname.slice(1);
    return serveStaticFile(res, PUBLIC_DIR, relPublicPath, 'no-cache');
  } catch (err) {
    console.error('[Server Error]', err);
    if (!res.headersSent) {
      sendError(res, 500, err.message || 'Terjadi kesalahan internal server.');
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n=================================================================`);
  console.log(`  Katalog Kain Gorden Studio — Swatch Reader + Google Drive`);
  console.log(`  Server aktif di   : http://${HOST}:${PORT}`);
  console.log(`  Folder GDrive     : https://drive.google.com/drive/folders/${getSettings().googleDriveFolderId}`);
  console.log(`  PIN Admin default : 1234`);
  console.log(`=================================================================\n`);
});
