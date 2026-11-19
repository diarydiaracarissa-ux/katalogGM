'use strict';

const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  try {
    const file = path.join(process.cwd(), 'google-apps-script', 'DriveCatalogBridge.gs');
    const code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, code }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
