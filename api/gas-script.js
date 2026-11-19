'use strict';

const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  try {
    const file = path.join(process.cwd(), 'google-apps-script', 'DriveCatalogBridge.gs');
    const code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return res.status(200).json({ ok: true, code });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
