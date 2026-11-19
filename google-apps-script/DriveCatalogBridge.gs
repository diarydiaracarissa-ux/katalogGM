/**
 * ============================================================================
 * GordenKain Studio — Google Drive Bridge untuk Deploy Vercel
 * Folder Google Drive Target: 1W8wTEg03Aqiv-rJHvoFngwYpg1u-Hjlw
 *
 * CARA PASANG (1 Menit, 100% Gratis):
 * 1. Buka https://script.google.com -> Klik "Project Baru"
 * 2. Hapus kode lama, lalu paste seluruh kode file ini
 * 3. Klik "Deploy" -> "New deployment" -> Pilih "Web app"
 *    - Execute as : Me (email Google Anda)
 *    - Who has access : Anyone
 * 4. Klik "Deploy", izinkan akses Google Drive, lalu salin "Web app URL"
 * 5. Paste URL tersebut ke Menu Admin -> Pengaturan -> "Google Apps Script Bridge URL"
 *    (atau set Environment Variable GAS_BRIDGE_URL di Vercel)
 * ============================================================================
 */

const FOLDER_ID = '1W8wTEg03Aqiv-rJHvoFngwYpg1u-Hjlw';
const CATALOG_FILENAME = 'catalog-kain-gorden.json';
const ADMIN_PIN = '1234'; // Ganti jika ingin PIN berbeda di sisi Apps Script

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'catalog';
    const folder = DriveApp.getFolderById(FOLDER_ID);

    if (action === 'sync_files') {
      const files = listImageFilesInFolder(folder);
      return jsonResponse({ ok: true, folderId: FOLDER_ID, files });
    }

    const catalog = readCatalogJson(folder);
    const files = listImageFilesInFolder(folder);
    return jsonResponse({
      ok: true,
      folderId: FOLDER_ID,
      products: catalog.products || [],
      settings: catalog.settings || null,
      driveFiles: files,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const pin = String(payload.pin || '').trim();
    if (pin !== ADMIN_PIN) {
      return jsonResponse({ ok: false, error: 'PIN Admin Google Drive Bridge tidak cocok.' });
    }

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const action = payload.action || '';

    if (action === 'upload_photo') {
      const base64Data = payload.base64;
      const mimeType = payload.mimeType || 'image/jpeg';
      const filename = sanitizeFilename(payload.filename || ('kain-' + Date.now() + '.jpg'));

      const decoded = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(decoded, mimeType, filename);
      const created = folder.createFile(blob);

      // Pastikan foto dapat ditampilkan publik di website katalog Vercel
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      const fileId = created.getId();
      return jsonResponse({
        ok: true,
        file: {
          id: fileId,
          name: created.getName(),
          mimeType: created.getMimeType(),
          sizeBytes: created.getSize(),
          imageUrl: 'https://lh3.googleusercontent.com/d/' + fileId + '=s2000',
          rawUrl: 'https://drive.google.com/uc?export=view&id=' + fileId,
          viewUrl: 'https://drive.google.com/file/d/' + fileId + '/view',
        },
      });
    }

    if (action === 'save_catalog') {
      const dataToSave = {
        updatedAt: new Date().toISOString(),
        products: Array.isArray(payload.products) ? payload.products : [],
        settings: payload.settings || null,
      };
      writeCatalogJson(folder, dataToSave);
      return jsonResponse({ ok: true, count: dataToSave.products.length });
    }

    if (action === 'delete_file' && payload.fileId) {
      try {
        DriveApp.getFileById(payload.fileId).setTrashed(true);
      } catch (ignore) {}
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: 'Action tidak dikenal: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function listImageFilesInFolder(folder) {
  const results = [];
  const iterator = folder.getFiles();
  while (iterator.hasNext()) {
    const f = iterator.next();
    const mime = f.getMimeType() || '';
    if (mime.indexOf('image/') === 0) {
      // Pastikan file dapat dilihat pengunjung website
      try {
        if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK &&
            f.getSharingAccess() !== DriveApp.Access.ANYONE) {
          f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        }
      } catch (ignore) {}

      const id = f.getId();
      results.push({
        id: id,
        name: f.getName(),
        mimeType: mime,
        sizeBytes: f.getSize(),
        createdAt: f.getDateCreated().toISOString(),
        updatedAt: f.getLastUpdated().toISOString(),
        imageUrl: 'https://lh3.googleusercontent.com/d/' + id + '=s2000',
        rawUrl: 'https://drive.google.com/uc?export=view&id=' + id,
      });
    }
  }
  results.sort(function (a, b) {
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return results;
}

function readCatalogJson(folder) {
  const files = folder.getFilesByName(CATALOG_FILENAME);
  if (!files.hasNext()) {
    return { products: [], settings: null };
  }
  const file = files.next();
  try {
    return JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  } catch (e) {
    return { products: [], settings: null };
  }
}

function writeCatalogJson(folder, obj) {
  const content = JSON.stringify(obj, null, 2);
  const files = folder.getFilesByName(CATALOG_FILENAME);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    folder.createFile(CATALOG_FILENAME, content, MimeType.PLAIN_TEXT);
  }
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
