'use strict';

const { analyzeCurtainWithGemini } = require('../src/geminiVision');
const { fetchRemoteImageAsBuffer } = require('../src/driveService');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Gunakan method POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const apiKey = body.apiKey || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      return res.status(400).json({
        ok: false,
        error: 'Gemini API Key belum diatur (di Pengaturan Admin atau Vercel Environment Variable GEMINI_API_KEY).',
      });
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
      return res.status(400).json({ ok: false, error: 'Kirimkan base64 atau imageUrl foto sampel kain.' });
    }

    const result = await analyzeCurtainWithGemini({
      apiKey,
      imageBuffer,
      mimeType,
      filename,
    });

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
