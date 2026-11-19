/**
 * High-Accuracy Fabric Swatch OCR Label Reader & Visual Texture Analyzer
 * --------------------------------------------------------------------------
 * Dikalibrasi khusus untuk membaca label sampel kain gorden secara presisi:
 *  - Memisahkan kolom kiri (Collection & Brand) dan kolom kanan (Color, Code & Specs)
 *  - Mencegah salah baca disclaimer "COLOR SHADES MAY SLIGHTLY VARY..." sebagai warna
 *  - Menangkap kode kain format "NB-05D MARZIPAN", "NB-01D PARCHMENT", "BELGIUM A-2", dll.
 */

let tesseractLoadPromise = null;
let tesseractWorkerPromise = null;

function loadTesseractScript() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoadPromise) return tesseractLoadPromise;

  tesseractLoadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => resolve(window.Tesseract || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}

async function getOcrWorker() {
  const Tesseract = await loadTesseractScript();
  if (!Tesseract) return null;
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = Tesseract.createWorker('eng').catch(() => {
      tesseractWorkerPromise = null;
      return null;
    });
  }
  return tesseractWorkerPromise;
}

const FABRIC_COLOR_NAMES = [
  { name: 'Putih Bersih', rgb: [242, 241, 238] },
  { name: 'Putih Gading / Ivory', rgb: [236, 230, 215] },
  { name: 'Krem Linen', rgb: [215, 200, 178] },
  { name: 'Beige Hangat', rgb: [192, 174, 148] },
  { name: 'Abu-abu Frost / Silver', rgb: [204, 206, 206] },
  { name: 'Abu-abu Sterling / Dove', rgb: [152, 155, 158] },
  { name: 'Abu-abu Slate / Iron', rgb: [106, 110, 114] },
  { name: 'Abu-abu Charcoal', rgb: [64, 67, 71] },
  { name: 'Hitam Pekat', rgb: [32, 34, 38] },
  { name: 'Cokelat Taupe / Mocha', rgb: [134, 110, 92] },
  { name: 'Cokelat Tua Espresso', rgb: [78, 58, 46] },
  { name: 'Emas Champagne', rgb: [196, 174, 130] },
  { name: 'Hijau Sage', rgb: [128, 145, 126] },
  { name: 'Hijau Olive', rgb: [104, 112, 76] },
  { name: 'Hijau Emerald', rgb: [36, 94, 76] },
  { name: 'Biru Langit / Ice Blue', rgb: [164, 190, 212] },
  { name: 'Biru Slate', rgb: [92, 116, 138] },
  { name: 'Biru Navy', rgb: [34, 48, 74] },
  { name: 'Terakota', rgb: [176, 96, 72] },
  { name: 'Marun', rgb: [116, 42, 48] },
  { name: 'Dusty Rose', rgb: [194, 150, 154] },
];

function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function colorDist(c1, c2) {
  const rm = (c1[0] + c2[0]) / 2;
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

function matchColorName(rgb) {
  let best = FABRIC_COLOR_NAMES[0];
  let bestD = Infinity;
  for (const c of FABRIC_COLOR_NAMES) {
    const d = colorDist(rgb, c.rgb);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.name;
}

function loadImageSource(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let objectUrl = null;

    img.onload = () => {
      const meta = { width: img.naturalWidth, height: img.naturalHeight };
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve({ img, meta });
    };

    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal memuat foto sampel kain untuk dibaca.'));
    };

    if (source instanceof File || source instanceof Blob) {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    } else if (typeof source === 'string') {
      img.src = source;
    } else {
      reject(new Error('Sumber foto tidak valid.'));
    }
  });
}

/**
 * Enhanced OCR Preprocessing with Local Normalization & Shadow Leveling.
 * Supports specific sub-region bounding boxes (x0, y0, x1, y1).
 */
function buildEnhancedLabelCanvas(img, x0Frac = 0.0, y0Frac = 0.0, x1Frac = 1.0, y1Frac = 1.0) {
  const sx = Math.floor(img.naturalWidth * Math.max(0, Math.min(0.95, x0Frac)));
  const sy = Math.floor(img.naturalHeight * Math.max(0, Math.min(0.95, y0Frac)));
  const sw = Math.floor(img.naturalWidth * Math.max(0.05, Math.min(1.0, x1Frac - x0Frac)));
  const sh = Math.floor(img.naturalHeight * Math.max(0.05, Math.min(1.0, y1Frac - y0Frac)));

  const targetMinWidth = 1200;
  const scale = sw < targetMinWidth ? Math.min(2.8, targetMinWidth / Math.max(1, sw)) : 1.2;
  const w = Math.min(2200, Math.max(180, Math.round(sw * scale)));
  const h = Math.min(1600, Math.max(100, Math.round(sh * scale)));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Grayscale buffer
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  }

  // Integral image for local illumination leveling
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const rowOff = (y + 1) * stride;
    const prevOff = y * stride;
    const gOff = y * w;
    for (let x = 0; x < w; x++) {
      rowSum += gray[gOff + x];
      integral[rowOff + x + 1] = integral[prevOff + x + 1] + rowSum;
    }
  }

  const radius = Math.max(14, Math.round(Math.min(w, h) * 0.05));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    const r0 = y0 * stride;
    const r1 = (y1 + 1) * stride;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[r1 + x1 + 1] - integral[r0 + x1 + 1] - integral[r1 + x0] + integral[r0 + x0];
      const localMean = sum / area;

      const px = gray[y * w + x];
      const diff = px - localMean;
      let out;
      if (diff < -12) {
        out = Math.max(0, Math.round(230 + diff * 4.2));
      } else {
        out = Math.min(255, Math.round(246 + diff * 0.5));
      }
      const pIdx = (y * w + x) * 4;
      d[pIdx] = out;
      d[pIdx + 1] = out;
      d[pIdx + 2] = out;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function analyzeFabricVisuals(img) {
  const w = 150;
  const h = 150;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const isWideLabelCrop = img.naturalWidth / Math.max(1, img.naturalHeight) >= 1.45;
  const sx = img.naturalWidth * 0.12;
  const sy = isWideLabelCrop ? img.naturalHeight * 0.05 : img.naturalHeight * 0.20;
  const sw = img.naturalWidth * 0.76;
  const sh = isWideLabelCrop ? img.naturalHeight * 0.25 : img.naturalHeight * 0.42;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map();
  const lum = new Float32Array(w * h);
  let lumSum = 0;

  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    lumSum += lum[i];

    const key = `${Math.round(r / 18) * 18},${Math.round(g / 18) * 18},${Math.round(b / 18) * 18}`;
    const e = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    e.count++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }

  const sorted = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .map((e) => ({ rgb: [e.r / e.count, e.g / e.count, e.b / e.count] }));

  const distinct = [];
  for (const c of sorted) {
    if (!distinct.some((d) => colorDist(d.rgb, c.rgb) < 34)) {
      distinct.push(c);
      if (distinct.length >= 4) break;
    }
  }

  let edgeHigh = 0;
  let samples = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const idx = y * w + x;
      const mag = Math.abs(lum[idx + 1] - lum[idx - 1]) + Math.abs(lum[idx + w] - lum[idx - w]);
      if (mag > 26) edgeHigh++;
      samples++;
    }
  }

  const detailRatio = edgeHigh / Math.max(1, samples);
  const avgLum = lumSum / (w * h);
  const primaryRgb = distinct[0]?.rgb || [165, 165, 165];

  let patternTexture = isWideLabelCrop
    ? 'Sesuai Sampel Kain Asli'
    : detailRatio > 0.34
      ? 'Motif Tenun Abstrak / Jacquard Bertekstur Timbul'
      : detailRatio > 0.19
        ? 'Tekstur Serat Anyaman Linen Natural'
        : 'Tekstur Anyaman Linen Halus Polos (Matte)';

  return {
    palette: distinct.map((d) => rgbToHex(d.rgb[0], d.rgb[1], d.rgb[2])),
    detectedColorFallback: matchColorName(primaryRgb),
    patternTexture,
    avgLum,
    detailRatio,
    isWideLabelCrop,
  };
}

function normalizeOcrNoise(raw = '') {
  return String(raw)
    .replace(/\r/g, '\n')
    .replace(/[|¦]/g, '   ')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/\b1OO\s*%/gi, '100%')
    .replace(/\bl00\s*%/g, '100%')
    .replace(/(\d)O\s*cm\b/gi, '$10cm')
    .replace(/(\d)O\s*gsm/gi, '$10Gsm')
    .replace(/BIackout/gi, 'Blackout')
    .replace(/MIGHT\s*BLOCK/gi, 'NIGHT BLOCK')
    .replace(/Po[l1i]yester/gi, 'Polyester')
    .replace(/L[i1]nen/gi, 'Linen')
    .replace(/C[o0]l[o0]u?r\s*:/gi, (m) => (m.toLowerCase().includes('u') ? 'Colour:' : 'Color:'))
    .replace(/C[o0][l1]{2}ect[i1][o0]n\s*:/gi, 'Collection:')
    .replace(/Des[i1]gn\s*N[o0]\s*[:.]?/gi, 'Design No:');
}

const STOP_KEYWORDS_RE = /\b(?:shading|recommended|composition|width|weight|washing|usage|guide|instructions?)\b/i;
const COLOR_LINE_IGNORE_RE = /\b(?:shades|vary|dye\s*lot|request|retardant|fastness|instruction|recommended)\b/i;

/**
 * Bulletproof Swatch Label Parser with strict disclaimer filtering.
 */
export function parseSwatchLabelText(rawText = '', filename = '') {
  const cleaned = normalizeOcrNoise(rawText);
  const rawLines = cleaned
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const flat = rawLines.join('\n');

  const result = {
    collection: '',
    code: '',
    colorName: '',
    brand: '',
    shadingDegree: '',
    composition: '',
    width: '',
    weight: '',
    fireRetardant: '',
    category: '',
  };

  let designSubCode = '';

  // -------------------------------------------------------------------------
  // 1. COLLECTION
  // -------------------------------------------------------------------------
  const explicitCol = flat.match(/\b(?:collection|koleksi|series|buku|book|nama\s*kain)\s*[:;\-.]?\s*([A-Z0-9][A-Z0-9 &/'-]{1,34})/i);
  if (explicitCol) {
    result.collection = explicitCol[1]
      .split(STOP_KEYWORDS_RE)[0]
      .split(/\b(?:color|colour|code)\b/i)[0]
      .replace(/[^A-Z0-9 &/'-]/gi, '')
      .trim()
      .toUpperCase();
  }

  const designMatches = [];
  const designRe = /\b(?:design\s*no\.?|design|article|art\.?\s*no\.?)\s*[:;\-.]?\s*([A-Z0-9][A-Z0-9 &/'-]{0,28})/gi;
  let dm;
  while ((dm = designRe.exec(flat)) !== null) {
    const val = dm[1]
      .split(STOP_KEYWORDS_RE)[0]
      .split(/\b(?:colour|color|code)\b/i)[0]
      .replace(/[^A-Z0-9 &/'-]/gi, '')
      .trim()
      .toUpperCase();
    if (val) designMatches.push(val);
  }

  for (const val of designMatches) {
    if (!result.collection && /^[A-Z][A-Z &'-]{2,}$/.test(val)) {
      result.collection = val;
    } else if (!designSubCode && val.length <= 8 && val !== result.collection) {
      designSubCode = val;
    } else if (!result.collection) {
      result.collection = val;
    }
  }

  // -------------------------------------------------------------------------
  // 2. COLOR & CODE (Searches ALL valid lines, skips "COLOR SHADES..." disclaimer)
  // -------------------------------------------------------------------------
  for (const line of rawLines) {
    // Skip disclaimer lines like "COLOR SHADES MAY SLIGHTLY VARY FROM DYE LOT..."
    if (COLOR_LINE_IGNORE_RE.test(line) && !line.includes('NB-') && !/\b(?:color|colour)\s*[:;\-]/i.test(line)) {
      continue;
    }

    // Prioritize explicit Color / Colour label first
    const explicitColMatch = line.match(/\b(?:colou?r|warna)\s*[:;\-.]?\s*([A-Z0-9][A-Z0-9\-_/ .]{0,36})/i);
    const colMatch = explicitColMatch || line.match(/\b(?:kode|code|item)\s*[:;\-.]?\s*([A-Z0-9][A-Z0-9\-_/ .]{1,36})/i);
    if (!colMatch) continue;

    const val = colMatch[1].split(STOP_KEYWORDS_RE)[0].trim();
    if (COLOR_LINE_IGNORE_RE.test(val)) continue;

    // Pattern 1: Code + Color Name (e.g. "NB-05D MARZIPAN", "NB-01D PARCHMENT", "NB-07C STONE", "NB-03A FROST")
    const codePlusColor = val.match(/^([A-Z]{1,6}[-_]?[0-9O]{1,5}[A-Z0-9-]*)\s+([A-Z][A-Z0-9 /&-]{1,24})$/i);
    if (codePlusColor) {
      result.code = codePlusColor[1].replace(/[-_]O(\d)/i, '-0$1').toUpperCase();
      result.colorName = codePlusColor[2].trim().toUpperCase();
      break;
    }

    // Pattern 2: Single fabric code (e.g. "NB-05D" or "NB-07A")
    const singleCode = val.match(/^([A-Z]{1,6}[-_]?[0-9O]{1,5}[A-Z0-9-]*)$/i);
    if (singleCode && !result.code) {
      result.code = singleCode[1].replace(/[-_]O(\d)/i, '-0$1').toUpperCase();
      continue;
    }

    // Pattern 3: Number-only colour code (e.g. "Colour: 2" for BELGIUM table)
    if (/^\d{1,4}[A-Z]?$/i.test(val)) {
      const colNum = val.toUpperCase();
      result.code = designSubCode ? `${designSubCode}-${colNum}` : colNum;
      result.colorName = `COLOUR ${colNum}`;
      break;
    }

    // Pattern 4: Pure color name
    if (val && !result.colorName && val.length >= 3 && !COLOR_LINE_IGNORE_RE.test(val)) {
      result.colorName = val.toUpperCase();
    }
  }

  // Fallback 2a: Direct global scan for "NB-XX[A-Z] [COLORNAME]" anywhere in text
  if (!result.code || !result.colorName) {
    const globalMatch = flat.match(/\b([A-Z]{1,4}[-_]?[0-9O]{1,4}[A-Z0-9]*)\s+([A-Z]{3,20})\b/);
    if (globalMatch) {
      const candidateCode = globalMatch[1].replace(/[-_]O(\d)/i, '-0$1').toUpperCase();
      const candidateColor = globalMatch[2].toUpperCase();
      if (!COLOR_LINE_IGNORE_RE.test(candidateColor) && !STOP_KEYWORDS_RE.test(candidateColor)) {
        if (!result.code) result.code = candidateCode;
        if (!result.colorName || COLOR_LINE_IGNORE_RE.test(result.colorName)) result.colorName = candidateColor;
      }
    }
  }

  // Fallback 2b: Code only
  if (!result.code) {
    const globalCode = flat.match(/\b([A-Z]{1,4}[-_]?[0-9O]{1,4}[A-Z]?)\b/);
    if (globalCode) {
      result.code = globalCode[1].replace(/[-_]O(\d)/i, '-0$1').toUpperCase();
    } else if (designSubCode) {
      result.code = designSubCode;
    }
  }

  // -------------------------------------------------------------------------
  // 3. SHADING DEGREE
  // -------------------------------------------------------------------------
  const shadingMatch = flat.match(/\b(?:shading\s*degree|shading|blackout\s*rate|tingkat\s*cahaya)\s*[:;\-.]?\s*([0-9]{1,3}\s*%\s*[A-Za-z ]{3,18}|[A-Za-z ]{4,20})/i);
  if (shadingMatch) {
    result.shadingDegree = shadingMatch[1]
      .split(STOP_KEYWORDS_RE)[0]
      .replace(/(\d+%)\s*([A-Za-z])/g, '$1 $2')
      .trim();
  } else {
    const pctBo = flat.match(/\b(\d{2,3}\s*%\s*(?:blackout|dimout|shading))/i);
    if (pctBo) {
      result.shadingDegree = pctBo[1].replace(/(\d+%)\s*([A-Za-z])/g, '$1 $2').trim();
    } else if (/\bblackout\b/i.test(flat)) {
      result.shadingDegree = 'Blackout';
    } else if (/\bdimout\b/i.test(flat)) {
      result.shadingDegree = 'Dimout';
    } else if (/\b(?:sheer|vitrase|voile)\b/i.test(flat)) {
      result.shadingDegree = 'Vitrase / Sheer';
    }
  }

  // -------------------------------------------------------------------------
  // 4. COMPOSITION
  // -------------------------------------------------------------------------
  const fiberGlobalRe = /\b(\d{1,3}\s*%\s*(?:linen|polyester|cotton|viscose|rayon|nylon|acrylic|silk|velvet|wool|katun|poliester)(?:\s*[,+/&]?\s*\d{1,3}\s*%\s*(?:linen|polyester|cotton|viscose|rayon|nylon|acrylic|silk|velvet|wool|katun|poliester))*)/i;
  const fiberDirect = flat.match(fiberGlobalRe);
  if (fiberDirect) {
    result.composition = fiberDirect[1]
      .replace(/(\d+)\s*%\s*([A-Za-z])/g, '$1% $2')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    const compInline = flat.match(/\b(?:composition|komposisi|material|bahan)\s*[:;\-.]?\s*([0-9A-Za-z% ,/+.-]{4,48})/i);
    if (compInline) {
      const candidate = compInline[1].split(STOP_KEYWORDS_RE)[0].trim();
      if (candidate && /\d+%|[a-z]{4,}/i.test(candidate)) {
        result.composition = candidate.replace(/(\d+%)\s*([A-Za-z])/g, '$1 $2');
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. WIDTH
  // -------------------------------------------------------------------------
  const widthInline = flat.match(/\b(?:width|lebar)\s*[:;\-.]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:cm|mm|m)\b/i);
  if (widthInline) {
    result.width = `${widthInline[1]} cm`;
  } else {
    const standaloneCm = flat.match(/\b(1[2-9]\d|2[0-9]\d|3[0-6]\d)\s*cm\b/i);
    if (standaloneCm) {
      result.width = `${standaloneCm[1]} cm`;
    }
  }

  // -------------------------------------------------------------------------
  // 6. WEIGHT
  // -------------------------------------------------------------------------
  const weightInline = flat.match(/\b(?:weight|berat|gramasi)\s*[:;\-.]?\s*(\d{2,4}\s*(?:gsm(?:\/sq\.?\s*mtr)?|g\/m[2²]|gr\/m[2²]))/i);
  if (weightInline) {
    result.weight = weightInline[1].replace(/(\d+)\s*(gsm)/i, '$1 Gsm').trim();
  } else {
    const gsmGlobal = flat.match(/\b(\d{2,4}\s*(?:gsm(?:\/sq\.?\s*mtr)?|g\/m[2²]|gr\/m[2²]))/i);
    if (gsmGlobal) {
      result.weight = gsmGlobal[1].replace(/(\d+)\s*gsm/i, '$1 Gsm').trim();
    }
  }

  // -------------------------------------------------------------------------
  // 7. BRAND & FIRE RETARDANT
  // -------------------------------------------------------------------------
  if (/\bNFPA\s*260\b|\bBS\s*4881\b|FIRE\s*RETARDANT/i.test(flat)) {
    const certs = [];
    if (/NFPA\s*260/i.test(flat)) certs.push('NFPA260');
    if (/BS\s*4881/i.test(flat)) certs.push('British BS4881');
    result.fireRetardant = certs.length ? `${certs.join(' / ')} (Upon Request)` : 'Fire Retardant (Upon Request)';
  }
  if (/\bSD\b/.test(flat) || /NIGHT\s*BLOCK/i.test(result.collection)) {
    result.brand = 'SD';
  }

  // -------------------------------------------------------------------------
  // 8. FILENAME FALLBACK (only if code completely missing)
  // -------------------------------------------------------------------------
  const cleanFile = String(filename || '').replace(/\.[^.]+$/, '');
  if (!result.code) {
    const fnCode = cleanFile.match(/\b([A-Z]{1,5}[-_]?\d{1,4}[A-Z]?)\b/i);
    if (fnCode) result.code = fnCode[1].replace('_', '-').toUpperCase();
  }

  // -------------------------------------------------------------------------
  // 9. CATEGORY
  // -------------------------------------------------------------------------
  const shLower = `${result.shadingDegree} ${result.composition} ${result.collection}`.toLowerCase();
  if (/100\s*%\s*blackout|full\s*blackout|night\s*block/.test(shLower)) {
    result.category = 'Blackout 100%';
  } else if (/blackout/.test(shLower)) {
    result.category = 'Blackout 80-90%';
  } else if (/vitrase|sheer|voile/.test(shLower)) {
    result.category = 'Vitrase / Sheer';
  } else if (/dimout/.test(shLower)) {
    result.category = 'Dimout';
  } else if (/jacquard|motif|damask/.test(shLower)) {
    result.category = 'Jacquard / Motif';
  } else if (/linen/.test(shLower)) {
    result.category = 'Linen';
  }

  return result;
}

function scoreParsedResult(p) {
  let score = 0;
  if (p.collection && p.collection !== 'KOLEKSI KAIN GORDEN') score += 3;
  if (p.code && p.code !== 'KAIN-01') score += 4;
  if (p.colorName && !COLOR_LINE_IGNORE_RE.test(p.colorName)) score += 3;
  if (p.shadingDegree) score += 2;
  if (p.composition) score += 2;
  if (p.width) score += 2;
  if (p.weight) score += 1;
  return score;
}

/**
 * Multi-Pass Targeted OCR:
 *  - Pass 1: White Label Strip (lower band y: 0.58-0.90)
 *  - Pass 2: Right Column of Label Strip (x: 0.38-0.98, y: 0.58-0.88) -> ISOLATED COLOR & SPECS!
 *  - Pass 3: Left Column of Label Strip (x: 0.02-0.52, y: 0.58-0.88) -> ISOLATED COLLECTION & BRAND!
 *  - Pass 4: Full/Upper area fallback
 */
export async function analyzeFabricSwatchPhoto(source, filename = '', onProgress = null) {
  const { img, meta } = await loadImageSource(source);

  if (onProgress) onProgress('Menganalisis warna & tekstur sampel kain...');
  const visual = analyzeFabricVisuals(img);

  let bestOcrText = '';
  let bestParsed = parseSwatchLabelText('', filename);
  let bestScore = -1;
  let engine = 'Smart Visual Reader';

  try {
    if (onProgress) onProgress('Meratakan bayangan & membaca teks label kain (OCR)...');
    const worker = await getOcrWorker();
    if (worker) {
      engine = 'OCR Label Reader (Tesseract)';
      const aspect = meta.width / Math.max(1, meta.height);

      const passes =
        aspect >= 1.3
          ? [
              { label: 'Memindai label penuh...', x0: 0.0, y0: 0.0, x1: 1.0, y1: 1.0 },
              { label: 'Memindai kolom kanan label...', x0: 0.38, y0: 0.0, x1: 1.0, y1: 1.0 },
            ]
          : [
              // Pass 1: Targeted white label strip (excludes textured fabric above & dark fingers below)
              { label: 'Memindai strip label kain...', x0: 0.02, y0: 0.58, x1: 0.98, y1: 0.88 },
              // Pass 2: Right column isolated (Color, Code, Specs — no left margin noise!)
              { label: 'Membaca Kode Kain & Warna (Kolom Kanan)...', x0: 0.38, y0: 0.58, x1: 0.98, y1: 0.88 },
              // Pass 3: Left column isolated (Collection, Brand, Fire Retardant)
              { label: 'Membaca Nama Koleksi (Kolom Kiri)...', x0: 0.02, y0: 0.58, x1: 0.52, y1: 0.88 },
              // Pass 4: Upper half if label is placed at top
              { label: 'Memindai area atas foto...', x0: 0.02, y0: 0.0, x1: 0.98, y1: 0.45 },
            ];

      let combinedText = '';
      for (const pass of passes) {
        if (onProgress) onProgress(pass.label);
        const enhancedCanvas = buildEnhancedLabelCanvas(img, pass.x0, pass.y0, pass.x1, pass.y1);
        const res = await worker.recognize(enhancedCanvas);
        const txt = (res?.data?.text || '').trim();
        if (!txt) continue;

        combinedText = combinedText ? `${combinedText}\n${txt}` : txt;
        const parsedSingle = parseSwatchLabelText(txt, filename);
        const parsedCombined = parseSwatchLabelText(combinedText, filename);

        const sSingle = scoreParsedResult(parsedSingle);
        const sCombined = scoreParsedResult(parsedCombined);

        if (sCombined > bestScore) {
          bestScore = sCombined;
          bestParsed = parsedCombined;
          bestOcrText = combinedText;
        }
        if (sSingle > bestScore) {
          bestScore = sSingle;
          bestParsed = parsedSingle;
          bestOcrText = txt;
        }

        // High confidence captured: Collection, Code & Color are all present
        if (bestParsed.collection && bestParsed.code && bestParsed.colorName && bestScore >= 10) {
          break;
        }
      }
    }
  } catch (err) {
    console.warn('[OCR Warning]', err);
  }

  const parsed = bestParsed;
  const collection = parsed.collection || 'KOLEKSI KAIN GORDEN';
  const code = parsed.code || 'KAIN-01';
  const colorName =
    parsed.colorName && !COLOR_LINE_IGNORE_RE.test(parsed.colorName)
      ? parsed.colorName
      : visual.isWideLabelCrop
        ? ''
        : visual.detectedColorFallback.toUpperCase();

  const shadingDegree =
    parsed.shadingDegree ||
    (visual.isWideLabelCrop
      ? ''
      : visual.avgLum < 115
        ? 'Blackout 90%–100%'
        : visual.avgLum > 205
          ? 'Vitrase / Sheer'
          : 'Dimout');

  const category =
    parsed.category ||
    (shadingDegree.includes('100%')
      ? 'Blackout 100%'
      : shadingDegree.toLowerCase().includes('blackout')
        ? 'Blackout 80-90%'
        : shadingDegree.toLowerCase().includes('vitrase')
          ? 'Vitrase / Sheer'
          : 'Dimout');

  const composition = parsed.composition || '';
  const width = parsed.width || '';
  const weight = parsed.weight || '';
  const brand = parsed.brand || '';
  const fireRetardant = parsed.fireRetardant || '';

  const roomRecommendation = category.includes('Blackout')
    ? 'Kamar Tidur Utama, Ruang Tamu Minimalis, Apartemen & Hotel'
    : category.includes('Vitrase')
      ? 'Ruang Tamu Terang, Lapisan Dalam Gorden, Kamar Skandinavia'
      : 'Ruang Tamu, Ruang Keluarga, Kamar Tidur';

  const specPieces = [];
  if (shadingDegree) specPieces.push(`tingkat penahan cahaya ${shadingDegree}`);
  if (composition) specPieces.push(`komposisi ${composition}`);
  if (width) specPieces.push(`lebar kain ${width}`);
  if (weight) specPieces.push(`gramasi ${weight}`);

  const description =
    `Kain gorden koleksi ${collection} kode ${code}${colorName ? ` (${colorName})` : ''}` +
    (specPieces.length ? ` dengan spesifikasi ${specPieces.join(', ')}. ` : '. ') +
    `${visual.patternTexture !== 'Sesuai Sampel Kain Asli' ? `Tampak berkarakter ${visual.patternTexture.toLowerCase()}. ` : ''}` +
    `Periksa foto asli resolusi penuh untuk melihat detail anyaman dan warna sebenarnya.`;

  return {
    collection,
    code,
    colorName,
    brand,
    category,
    shadingDegree,
    composition,
    width,
    weight,
    fireRetardant,
    patternTexture: visual.patternTexture,
    roomRecommendation,
    palette: visual.palette,
    description,
    rawOcrText: bestOcrText,
    analysisEngine: engine,
    imageMeta: meta,
  };
}
