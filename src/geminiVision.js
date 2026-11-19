'use strict';

/**
 * High-Accuracy AI Vision Swatch Label Reader (Google Gemini 2.5 Flash)
 * Calibrated specifically for curtain fabric swatch books in Indonesia:
 *  - Style 1: Collection + Color/Code + Shading Degree + Composition + Width + Weight (e.g. NIGHT BLOCK / NB-01D PARCHMENT)
 *  - Style 2: Boxed table labels with Design No (Collection) + Design No (Sub-code) + Colour + Composition + Width (e.g. BELGIUM / A / Colour: 2 / 340cm)
 *  - Style 3: Any other textile swatch book label (Article, Series, Code, Item No, Pattern)
 */
async function analyzeCurtainWithGemini({ apiKey, imageBuffer, mimeType, filename }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API Key belum diatur. Isi di Menu Admin -> Pengaturan atau Environment Variable GEMINI_API_KEY.');
  }

  const base64Image = Buffer.isBuffer(imageBuffer) ? imageBuffer.toString('base64') : String(imageBuffer);
  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const prompt = `Anda adalah sistem OCR & Kurator Katalog Buku Sampel Kain Gorden dengan presisi sangat tinggi untuk Gorden Magelang.
TUGAS UTAMA: Baca SEMUA teks tercetak pada label sampel kain secara VERBATIM (huruf & angka harus 100% akurat, bedakan 0 vs O, 1 vs I, D vs 0, A vs 4). JANGAN mengarang angka atau kode yang tidak tertulis pada foto.

PERHATIKAN BERBAGAI FORMAT LABEL KAIN BERIKUT:

Contoh Format 1 (Label Baris / Collection & Color):
Tertulis: "Collection: NIGHT BLOCK", logo "SD", "Color: NB-01D PARCHMENT", "Shading Degree : 100%Blackout", "Composition : 30%Linen 70%Polyester", "Width : 320cm", "Weight : 260Gsm/sq.Mtr", "FIRE RETARDANT NFPA260 BRITISH BS4881 UPON REQUEST"
Hasil JSON yang benar:
- collection: "NIGHT BLOCK"
- code: "NB-01D"
- colorName: "PARCHMENT"
- brand: "SD"
- category: "Blackout 100%"
- shadingDegree: "100% Blackout"
- composition: "30% Linen 70% Polyester"
- width: "320 cm"
- weight: "260 Gsm/sq.Mtr"
- fireRetardant: "NFPA260 / British BS4881 (Upon Request)"

Contoh Format 2 (Label Tabel / Design No & Colour):
Tertulis: "Design No: BELGIUM", "Design No: A", "Colour: 2", "Composition: 100%Polyester", "Width: 340cm"
Hasil JSON yang benar:
- collection: "BELGIUM"
- code: "A-2" (gabungkan sub-design "A" dan nomor colour "2" menjadi kode jelas "A-2")
- colorName: "COLOUR 2" (atau tambahkan warna kain yang terlihat jika area kain tampak di foto, mis. "COLOUR 2")
- brand: ""
- category: tentukan dari jenis kain yang terlihat (jika tidak tertulis blackout/vitrase, pilih "Dimout" atau sesuai tampilan kain)
- shadingDegree: "" (kosongkan jika tidak tertulis pada label dan kain tidak terlihat)
- composition: "100% Polyester"
- width: "340 cm"
- weight: ""
- fireRetardant: ""

ATURAN KETAT:
1. Jika foto hanya berupa potongan label (tanpa terlihat kainnya), fokus baca teks label secara akurat dan jangan mengarang warna/motif yang tidak terlihat.
2. Jika tertulis "Design No: [NAMA KOLEKSI]" dan juga "Design No: [HURUF/ANGKA]" + "Colour: [ANGKA/NAMA]", maka:
   - collection = [NAMA KOLEKSI] (mis. "BELGIUM")
   - code = gabungan sub-design & nomor warna (mis. "A-2")
   - colorName = "COLOUR 2" (atau nama warna bila tertulis kata warna)
3. Normalisasikan spasi secara rapi: "100%Polyester" -> "100% Polyester", "30%Linen 70%Polyester" -> "30% Linen 70% Polyester", "320cm" -> "320 cm", "340cm" -> "340 cm", "100%Blackout" -> "100% Blackout", "260Gsm/sq.Mtr" -> "260 Gsm/sq.Mtr".
4. Nama file referensi (hanya petunjuk sekunder): "${filename || 'sampel-kain.jpg'}".

Kembalikan HANYA JSON valid tanpa markdown fence dengan skema tepat ini:
{
  "collection": "Nama koleksi / buku kain (HURUF BESAR)",
  "code": "Kode kain yang akurat sesuai label (HURUF BESAR, mis. NB-01D atau A-2)",
  "colorName": "Nama atau nomor warna sesuai label (HURUF BESAR, mis. PARCHMENT atau COLOUR 2)",
  "brand": "Merek/logo jika ada pada label (mis. SD), atau string kosong",
  "category": "Salah satu dari: Blackout 100% | Blackout 80-90% | Dimout | Vitrase / Sheer | Jacquard / Motif | Linen",
  "shadingDegree": "Tingkat blackout/shading sesuai label (mis. 100% Blackout), atau string kosong jika tidak tertulis",
  "composition": "Komposisi serat kain sesuai label (mis. 30% Linen 70% Polyester atau 100% Polyester)",
  "width": "Lebar kain sesuai label (mis. 320 cm atau 340 cm)",
  "weight": "Berat/gramasi kain sesuai label (mis. 260 Gsm/sq.Mtr), atau string kosong jika tidak tertulis",
  "fireRetardant": "Info sertifikasi tahan api jika tertulis pada label, atau string kosong",
  "patternTexture": "Deskripsi singkat tekstur/motif kain yang terlihat pada foto (atau 'Sesuai Sampel Foto' jika foto hanya label)",
  "roomRecommendation": "Rekomendasi ruangan ideal dalam Bahasa Indonesia",
  "description": "Penjelasan produk profesional 2-3 kalimat dalam Bahasa Indonesia yang menyebutkan nama koleksi, kode kain, warna, komposisi, lebar, serta keunggulan kain secara akurat sesuai data label di foto.",
  "rawOcrText": "Salinan teks mentah persis seperti yang tercetak pada label foto"
}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType || 'image/jpeg',
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.05,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI Vision gagal merespons (${response.status}): ${errText.slice(0, 180)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('AI Vision tidak mengembalikan hasil pembacaan.');
  }

  const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return {
    ...parsed,
    collection: String(parsed.collection || '').trim().toUpperCase(),
    code: String(parsed.code || '').trim().toUpperCase(),
    colorName: String(parsed.colorName || '').trim().toUpperCase(),
    analysisEngine: 'AI Vision Pro (Gemini)',
  };
}

module.exports = { analyzeCurtainWithGemini };
