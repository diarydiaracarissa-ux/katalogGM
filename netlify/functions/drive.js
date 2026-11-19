'use strict';

const {
  DEFAULT_FOLDER_ID,
  syncDriveFolder,
  postToGasBridge,
  fetchRemoteImageAsBuffer,
} = require('../../src/driveService');

exports.handler = async (event) => {
  const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    const params = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    const action = params.action || body.action || 'sync';

    if (event.httpMethod === 'GET' && action === 'image') {
      if (!params.url) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Parameter url wajib diisi.' }) };
      }
      const { buffer, contentType } = await fetchRemoteImageAsBuffer(params.url);
      return {
        statusCode: 200,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
        body: buffer.toString('base64'),
        isBase64Encoded: true,
      };
    }

    if (event.httpMethod === 'GET' && action === 'sync') {
      const folderId = params.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
      const gasBridgeUrl = params.bridgeUrl || process.env.GAS_BRIDGE_URL || '';
      const googleDriveApiKey = params.driveApiKey || process.env.GOOGLE_DRIVE_API_KEY || '';
      const result = await syncDriveFolder({ folderId, gasBridgeUrl, googleDriveApiKey });
      return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ ok: true, folderId, ...result }) };
    }

    if (event.httpMethod === 'POST') {
      const bridgeUrl = body.bridgeUrl || process.env.GAS_BRIDGE_URL || '';
      if (!bridgeUrl) {
        return {
          statusCode: 400,
          headers: jsonHeaders,
          body: JSON.stringify({ ok: false, error: 'GAS_BRIDGE_URL belum diatur di Pengaturan / Netlify Environment Variable.' }),
        };
      }
      const result = await postToGasBridge(bridgeUrl, body);
      return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify(result) };
    }

    return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Method tidak didukung.' }) };
  } catch (err) {
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
