'use strict';

const DEFAULT_FOLDER_ID = '1W8wTEg03Aqiv-rJHvoFngwYpg1u-Hjlw';

function buildDriveImageUrls(fileId) {
  return {
    // High-resolution direct image URL from Google Drive (up to 2000px crisp original)
    imageUrl: `https://lh3.googleusercontent.com/d/${fileId}=s2000`,
    rawUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
    viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
  };
}

/**
 * Fetch catalog & file list from Google Apps Script Bridge.
 */
async function fetchFromGasBridge(bridgeUrl, action = 'catalog') {
  const sep = bridgeUrl.includes('?') ? '&' : '?';
  const url = `${bridgeUrl}${sep}action=${encodeURIComponent(action)}`;
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json.ok === false) throw new Error(json.error || 'Bridge error');
    return json;
  } catch (err) {
    if (err.message && !err.message.includes('JSON')) throw err;
    throw new Error('Respons Google Apps Script Bridge tidak valid. Pastikan deployment Web App diatur ke "Anyone".');
  }
}

/**
 * Post action (upload_photo, save_catalog, delete_file) to Google Apps Script Bridge.
 */
async function postToGasBridge(bridgeUrl, payload) {
  const res = await fetch(bridgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json.ok === false) throw new Error(json.error || 'Gagal menyimpan ke Google Drive Bridge.');
    return json;
  } catch (err) {
    if (err.message && !err.message.includes('JSON')) throw err;
    throw new Error('Respons POST Google Apps Script Bridge tidak valid.');
  }
}

/**
 * List image files in a public Google Drive folder via Drive API v3 (if API key provided).
 */
async function listDriveFilesViaApiKey(folderId, apiKey) {
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/' and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,size,createdTime,modifiedTime)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&orderBy=modifiedTime desc&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google Drive API gagal (${res.status}): ${txt.slice(0, 140)}`);
  }
  const data = await res.json();
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType || 'image/jpeg',
    sizeBytes: Number(f.size) || 0,
    createdAt: f.createdTime || new Date().toISOString(),
    updatedAt: f.modifiedTime || new Date().toISOString(),
    ...buildDriveImageUrls(f.id),
  }));
}

/**
 * Lightweight fallback scanner for public Google Drive folders ("Anyone with link can view")
 * without needing an API key.
 */
async function listPublicDriveFolderFiles(folderId = DEFAULT_FOLDER_ID) {
  const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KatalogKainBot/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Tidak dapat membuka folder Google Drive (${res.status}). Pastikan folder dibagikan "Siapa saja yang memiliki link".`);
  }
  const html = await res.text();
  const files = [];
  const seen = new Set();

  // Match entries in embeddedfolderview HTML: href="https://drive.google.com/file/d/{ID}/view..." and flip-entry-title
  const entryRegex = /id="entry-([a-zA-Z0-9_-]{15,})"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = entryRegex.exec(html)) !== null) {
    const id = m[1];
    const name = m[2].replace(/<[^>]+>/g, '').trim();
    if (seen.has(id)) continue;
    if (/\.(jpe?g|png|webp|avif|heic)$/i.test(name) || !name.includes('.')) {
      seen.add(id);
      files.push({
        id,
        name: name || `kain-${id.slice(0, 6)}.jpg`,
        mimeType: name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
        sizeBytes: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...buildDriveImageUrls(id),
      });
    }
  }

  return files;
}

/**
 * Unified list of images from Google Drive folder using best available method.
 */
async function syncDriveFolder({ folderId = DEFAULT_FOLDER_ID, gasBridgeUrl = '', googleDriveApiKey = '' }) {
  if (gasBridgeUrl && gasBridgeUrl.trim()) {
    const res = await fetchFromGasBridge(gasBridgeUrl.trim(), 'sync_files');
    return { method: 'Google Apps Script Bridge', files: res.files || [] };
  }
  if (googleDriveApiKey && googleDriveApiKey.trim()) {
    const files = await listDriveFilesViaApiKey(folderId, googleDriveApiKey.trim());
    return { method: 'Google Drive API v3', files };
  }
  const files = await listPublicDriveFolderFiles(folderId);
  return { method: 'Public Drive Folder', files };
}

/**
 * Fetch remote image bytes from Google Drive safely on the server (avoids browser CORS issues for OCR).
 */
async function fetchRemoteImageAsBuffer(imageUrl) {
  const allowedHosts = ['lh3.googleusercontent.com', 'drive.google.com', 'docs.google.com'];
  const parsed = new URL(imageUrl);
  if (!allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
    throw new Error('URL gambar tidak diizinkan untuk proxy.');
  }
  const res = await fetch(imageUrl, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Gagal mengunduh foto dari Google Drive (${res.status}).`);
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, contentType };
}

module.exports = {
  DEFAULT_FOLDER_ID,
  buildDriveImageUrls,
  fetchFromGasBridge,
  postToGasBridge,
  listDriveFilesViaApiKey,
  listPublicDriveFolderFiles,
  syncDriveFolder,
  fetchRemoteImageAsBuffer,
};
