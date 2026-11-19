'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_FOLDER_ID, fetchFromGasBridge } = require('../../src/driveService');

function readBundledCatalog() {
  try {
    return require('../../data/catalog.json');
  } catch {}
  try {
    return require('../../public/data/catalog.json');
  } catch {}
  try {
    const file = path.join(process.cwd(), 'public', 'data', 'catalog.json');
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {
    // ignore
  }
  return { products: [], settings: {} };
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    const params = event.queryStringParameters || {};
    const bridgeUrl = params.bridgeUrl || process.env.GAS_BRIDGE_URL || '';
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
    const bundled = readBundledCatalog();

    let products = bundled.products || [];
    let remoteSettings = {};

    if (bridgeUrl) {
      try {
        const remote = await fetchFromGasBridge(bridgeUrl, 'catalog');
        if (Array.isArray(remote.products) && remote.products.length > 0) products = remote.products;
        if (remote.settings) remoteSettings = remote.settings;
      } catch (err) {
        console.warn('[Netlify Catalog] Bridge fallback:', err.message);
      }
    }

    const settings = {
      storeName: remoteSettings.storeName || bundled.settings?.storeName || 'Gorden Magelang',
      mainWebsite: remoteSettings.mainWebsite || bundled.settings?.mainWebsite || 'https://www.gordenmagelang.web.id',
      tagline: remoteSettings.tagline || bundled.settings?.tagline || '',
      whatsapp: remoteSettings.whatsapp || bundled.settings?.whatsapp || '6285734103666',
      address: remoteSettings.address || bundled.settings?.address || 'Gorden Magelang — Survey & Ukur Gratis Magelang dan Sekitarnya',
      googleDriveFolderId: remoteSettings.googleDriveFolderId || folderId,
      googleDriveFolderUrl: `https://drive.google.com/drive/folders/${remoteSettings.googleDriveFolderId || folderId}`,
      hasAiVision: Boolean(process.env.GEMINI_API_KEY),
      hasDriveBridge: Boolean(bridgeUrl),
      isVercel: true,
    };

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, products, settings }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
