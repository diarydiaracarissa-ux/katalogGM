'use strict';

const { analyzeCurtainWithGemini } = require('../../src/geminiVision');
const { fetchRemoteImageAsBuffer } = require('../../src/driveService');

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Gunakan method POST.' }) };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const apiKey = body.apiKey || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'GEMINI_API_KEY belum diatur di Netlify Environment Variable.' }),
      };
    }

    let imageBuffer;
    let mimeType = body.mimeType || 'image/jpeg';
    const filename = body.filename || 'sampel-kain.jpg';

    if (body.base64) {
      imageBuffer = Buffer.from(body.base64, 'base64');
    } else if (body.imageUrl) {
      const fetched = await fetchRemoteImageAsBuffer(body.imageUrl);
      imageBuffer = fetched.buffer;
      mimeType = fetched.contentType;
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Kirimkan base64 atau imageUrl foto.' }) };
    }

    const result = await analyzeCurtainWithGemini({ apiKey, imageBuffer, mimeType, filename });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, result }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
