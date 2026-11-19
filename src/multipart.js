'use strict';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB for crisp original photos

/**
 * Parse multipart/form-data from an incoming Node.js HTTP request safely (binary-preserving).
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ fields: Record<string, string>, files: Record<string, { filename: string, contentType: string, data: Buffer, size: number }> }>}
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    if (!boundaryMatch) {
      return reject(new Error('Format upload tidak valid (boundary tidak ditemukan).'));
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const chunks = [];
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_UPLOAD_BYTES) {
        req.destroy();
        return reject(new Error('Ukuran file terlalu besar (maksimal 25 MB per foto).'));
      }
      chunks.push(chunk);
    });

    req.on('error', (err) => reject(err));

    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const fields = {};
        const files = {};

        let pos = buffer.indexOf(boundaryBuf);
        while (pos !== -1) {
          pos += boundaryBuf.length;

          // Check for closing boundary "--"
          if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) {
            break;
          }

          // Skip CRLF after boundary
          if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) {
            pos += 2;
          }

          const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), pos);
          if (headerEnd === -1) break;

          const headerStr = buffer.subarray(pos, headerEnd).toString('utf8');
          const dataStart = headerEnd + 4;
          const nextBoundary = buffer.indexOf(boundaryBuf, dataStart);
          if (nextBoundary === -1) break;

          // Trim trailing CRLF before next boundary
          let dataEnd = nextBoundary;
          if (buffer[dataEnd - 2] === 0x0d && buffer[dataEnd - 1] === 0x0a) {
            dataEnd -= 2;
          }

          const partData = buffer.subarray(dataStart, dataEnd);
          const headers = parsePartHeaders(headerStr);
          const disp = headers['content-disposition'] || '';
          const nameMatch = disp.match(/name="([^"]+)"/i);
          const filenameMatch = disp.match(/filename="([^"]*)"/i);

          if (nameMatch) {
            const fieldName = nameMatch[1];
            if (filenameMatch && filenameMatch[1]) {
              files[fieldName] = {
                filename: filenameMatch[1],
                contentType: headers['content-type'] || 'application/octet-stream',
                data: Buffer.from(partData),
                size: partData.length,
              };
            } else {
              fields[fieldName] = partData.toString('utf8');
            }
          }

          pos = nextBoundary;
        }

        resolve({ fields, files });
      } catch (err) {
        reject(err);
      }
    });
  });
}

function parsePartHeaders(headerStr) {
  const result = {};
  const lines = headerStr.split('\r\n');
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parse JSON request body safely.
 */
function parseJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        return reject(new Error('Payload JSON melebihi batas ukuran.'));
      }
      chunks.push(chunk);
    });

    req.on('error', reject);
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Format JSON tidak valid.'));
      }
    });
  });
}

module.exports = {
  parseMultipart,
  parseJsonBody,
  MAX_UPLOAD_BYTES,
};
