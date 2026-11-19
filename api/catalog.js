'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_FOLDER_ID, fetchFromGasBridge } = require('../src/driveService');

function readBundledCatalog() {
  try {
    return require('../data/catalog.json');
  } catch {}
  try {
    return require('../public/data/catalog.json');
  } catch {}
  try {
    const file = path.join(process.cwd(), 'public', 'data', 'catalog.json');
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {
    // fallback empty
  }
  return { products: [], settings: {} };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const bridgeUrl = req.query.bridgeUrl || process.env.GAS_BRIDGE_URL || '';
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
    const bundled = readBundledCatalog();

    let products = bundled.products || [];
    let remoteSettings = {};

    if (bridgeUrl) {
      try {
        const remote = await fetchFromGasBridge(bridgeUrl, 'catalog');
        if (Array.isArray(remote.products) && remote.products.length > 0) {
          products = remote.products;
        }
        if (remote.settings) {
          remoteSettings = remote.settings;
        }
      } catch (err) {
        console.warn('[Vercel Catalog] Bridge fallback:', err.message);
      }
    }

    const settings = {
      storeName: remoteSettings.storeName || bundled.settings?.storeName || 'Gorden Magelang',
      mainWebsite: remoteSettings.mainWebsite || bundled.settings?.mainWebsite || 'https://www.gordenmagelang.web.id',
      tagline:
        remoteSettings.tagline ||
        bundled.settings?.tagline ||
        'Katalog Buku Sampel Kain Digital — Pilih sendiri jenis kain & kode warna favorit Anda dari foto asli resolusi penuh.',
      whatsapp: remoteSettings.whatsapp || bundled.settings?.whatsapp || '6285734103666',
      address:
        remoteSettings.address ||
        bundled.settings?.address ||
        'Gorden Magelang — Survey & Ukur Gratis Magelang dan Sekitarnya',
      googleDriveFolderId: remoteSettings.googleDriveFolderId || folderId,
      googleDriveFolderUrl: `https://drive.google.com/drive/folders/${remoteSettings.googleDriveFolderId || folderId}`,
      hasAiVision: Boolean(process.env.GEMINI_API_KEY),
      hasDriveBridge: Boolean(bridgeUrl),
      isVercel: true,
    };

    return res.status(200).json({ ok: true, products, settings });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
