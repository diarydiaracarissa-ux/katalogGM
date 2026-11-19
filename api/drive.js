'use strict';

const {
  DEFAULT_FOLDER_ID,
  syncDriveFolder,
  postToGasBridge,
  fetchRemoteImageAsBuffer,
} = require('../src/driveService');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const action = req.query.action || (req.body && req.body.action) || 'sync';

    // CORS-safe proxy for reading Google Drive images on Canvas/OCR
    if (req.method === 'GET' && action === 'image') {
      const url = req.query.url;
      if (!url) return res.status(400).json({ ok: false, error: 'Parameter url wajib diisi.' });
      const { buffer, contentType } = await fetchRemoteImageAsBuffer(url);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(buffer);
    }

    const DEFAULT_BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbxXHr_8hjku8KUjKstMe0NGwQhMRe0fNgq7G-6e05bqRDkFSFtrPHtuGk495NNun65f/exec';

    // List/sync files from Google Drive folder
    if (req.method === 'GET' && action === 'sync') {
      const folderId = req.query.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
      const gasBridgeUrl = req.query.bridgeUrl || process.env.GAS_BRIDGE_URL || DEFAULT_BRIDGE_URL;
      const googleDriveApiKey = req.query.driveApiKey || process.env.GOOGLE_DRIVE_API_KEY || '';
      const result = await syncDriveFolder({ folderId, gasBridgeUrl, googleDriveApiKey });
      return res.status(200).json({ ok: true, folderId, ...result });
    }

    // Proxy POST upload / save_catalog / delete_file to Google Apps Script Bridge
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const bridgeUrl = body.bridgeUrl || process.env.GAS_BRIDGE_URL || DEFAULT_BRIDGE_URL;
      if (!bridgeUrl) {
        return res.status(400).json({
          ok: false,
          error: 'Google Apps Script Bridge URL belum diatur. Pasang script DriveCatalogBridge.gs terlebih dahulu agar upload langsung masuk ke Google Drive.',
        });
      }

      const result = await postToGasBridge(bridgeUrl, body);
      return res.status(200).json(result);
    }

    return res.status(405).json({ ok: false, error: 'Method tidak didukung.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
