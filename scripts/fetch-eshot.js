#!/usr/bin/env node
/**
 * ESHOT güzergah saatlerini resmi siteden (eshot.gov.tr) çekip
 * sade {gidis, donus, _updated} JSON formatına dönüştürür.
 *
 * Neden bu script: ESHOT açıveri API'si (acikveri.bizizmir.com) güncel
 * tarifeleri yansıtmıyor (örn. yaz tarifesi). Resmi site güncel ama CORS
 * izin vermediği için tarayıcıdan çekilemiyor. Bu script Node.js ile
 * (CORS yok) çeker ve lokal JSON dosyalarını günceller.
 *
 * NOT: ESHOT.gov.tr GitHub Actions (US) IP'lerini coğrafi olarak blokluyor.
 * Bu yüzden script LOKAL olarak (Türkiye IP'siyle) çalıştırılmalıdır.
 * update-eshot.bat ile çift tıklayarak veya zamanlanmış görevle otomatik
 * çalıştırılabilir. Detaylar için README'nin "Veri Güncelleme" bölümü.
 *
 * Kullanım:
 *   node scripts/fetch-eshot.js        # 555 + 776
 *   node scripts/fetch-eshot.js 776    # sadece 776
 *
 * Veri yapısı: ESHOT sitesi tek POST yanıtında birden fazla gün (hafta içi,
 * cumartesi, pazar) ve her gün için iki yön (<h4>DOĞANBEY Kalkış</h4>,
 * <h4>CUMAOVASI AKT. Kalkış</h4>) listeler. İlk günün (en kapsamlı, genelde
 * hafta içi) iki yön listesi çıkarılır.
 *
 *   gidis  = DOĞANBEY → CUMAOVASI (ilk duraktan son durağa)
 *   donus  = CUMAOVASI → DOĞANBEY (son duraktan ilk durağa)
 *
 * Form yapısı:
 *   POST https://www.eshot.gov.tr/tr/UlasimSaatleri/-1
 *   body: hatId=<no>&hatYon=0&bisikletAparatliMi=False
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const ESHOT_URL = 'https://www.eshot.gov.tr/tr/UlasimSaatleri/-1';
const FETCH_TIMEOUT_MS = 30000;
const DEFAULT_HATS = [555, 776];

/**
 * ESHOT sitesine form POST yapar (tek deneme).
 * @param {number} hatNo  Hat numarası (örn. 776)
 * @param {0|1} hatYon    0=GİDİŞ, 1=DÖNÜŞ (site her iki yönü de tek yanıtta verir)
 * @returns {Promise<string>} HTML yanıt
 */
function postForm(hatNo, hatYon) {
  return new Promise((resolve, reject) => {
    const body = `hatId=${hatNo}&hatYon=${hatYon}&bisikletAparatliMi=False`;
    const req = https.request(
      ESHOT_URL,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'travel-timer-build-script/1.0',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      res => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} (hat ${hatNo})`));
          return;
        }
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Timeout (hat ${hatNo})`));
    });
    req.write(body);
    req.end();
  });
}

const timeToMin = t => {
  const p = t.split(':').map(Number);
  return p[0] * 60 + p[1];
};
const uniqueSorted = arr => [...new Set(arr)].sort((a, b) => a - b);

/**
 * Bir HTML bölümünden (bir yön listesi) HH:MM saatlerini çıkarır.
 * ESHOT sitesinde saatler <li><span>HH:MM</span></li> veya
 * <li id="time-HHMM"> yapısında olabilir; her ikisini de yakalar.
 *
 * @param {string} section  Bir <h4> başlığıyla sonraki <h4> arasındaki HTML
 * @returns {number[]}      Sorted + unique gün içi dakika dizisi (0..1439)
 */
function extractTimesFromSection(section) {
  // <li id="time-HHMM"> (ID'li, aktif yön)
  const byId = [...section.matchAll(/id="time-(\d{3,4})"/g)].map(m => {
    const id = m[1];
    const hh = id.length === 3 ? id.slice(0, 1) : id.slice(0, 2);
    const mm = id.slice(-2);
    return parseInt(hh, 10) * 60 + parseInt(mm, 10);
  });
  if (byId.length > 0) return uniqueSorted(byId);
  // <span ...>HH:MM</span> (plain text, pasif yön)
  // Saat desenini ayrı yakala: 2 alternatif (tek/double-digit saat)
  const byText = [...section.matchAll(/<span[^>]*>\s*((?:2[0-3]|[01]?\d):[0-5]\d)\s*<\/span>/g)]
    .map(m => timeToMin(m[1]));
  return uniqueSorted(byText);
}

/**
 * ESHOT HTML yanıtından iki yönün (GİDİŞ, DÖNÜŞ) ilk gün saat listelerini çıkarır.
 *
 * Sayfada birden çok <h4>X Kalkış</h4> başlığı vardır (her gün için 2 tane).
 * İlk "GİDİŞ yönü" (ilk durak adı) ve ilk "DÖNÜŞ yönü" (ikinci durak adı)
 * başlıklarının listesini döndürür.
 *
 * Durak adlarını sayfadaki ilk iki <h4> başlığından otomatik türetir; böylece
 * hat değiştiğinde (DOĞANBEY yerine başka durak) kod güncellenmez.
 *
 * @param {string} html
 * @returns {{gidis: number[], donus: number[], gidisLabel: string, donusLabel: string}}
 */
function parseScheduleHtml(html) {
  const h4matches = [...html.matchAll(/<h4[^>]*>([^<]*Kalkış[^<]*)<\/h4>/g)];
  if (h4matches.length < 2) {
    throw new Error('Yön başlıkları (<h4>...Kalkış</h4>) bulunamadı');
  }

  // İlk iki benzersiz yön başlığı → gidis ve donus etiketleri
  const labels = [];
  for (const m of h4matches) {
    const label = m[1].trim();
    if (!labels.includes(label)) labels.push(label);
    if (labels.length === 2) break;
  }
  const [gidisLabel, donusLabel] = labels;

  // Her etiketin ilk geçtiği yerden saat listesini çıkar (sonraki <h4>'e kadar)
  const listFor = label => {
    const idx = html.indexOf(`<h4`);
    // bu label'ın tüm geçtiği yerleri bul, ilkini al
    const re = new RegExp(`<h4[^>]*>${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/h4>`);
    const m = re.exec(html);
    if (!m) return [];
    const after = html.slice(m.index + m[0].length);
    const nextH4 = after.indexOf('<h4');
    const section = nextH4 > 0 ? after.slice(0, nextH4) : after.slice(0, 10000);
    return extractTimesFromSection(section);
  };

  const gidis = listFor(gidisLabel);
  const donus = listFor(donusLabel);

  return { gidis, donus, gidisLabel, donusLabel };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * postForm'u belirli sayıda dener. ESHOT sitesi CI'dan (US-based) bazen
 * yavaş/timing out oluyor; aralarda bekleme ile tekrar denemek güvenilir.
 */
async function postFormWithRetry(hatNo, hatYon, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await postForm(hatNo, hatYon);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(`    deneme ${attempt}/${retries} başarısız (${err.message}), 5sn sonra tekrar denenecek...`);
        await sleep(5000);
      }
    }
  }
  throw lastErr;
}

/**
 * Bir hat için saatleri çekip parse eder.
 * @returns {Promise<{gidis: number[], donus: number[]}>}
 */
async function fetchHat(hatNo) {
  const html = await postFormWithRetry(hatNo, 0);
  const result = parseScheduleHtml(html);

  if (result.gidis.length === 0) {
    throw new Error(`Hat ${hatNo} GİDİŞ saatleri parse edilemedi (HTML yapısı değişmiş olabilir)`);
  }
  if (result.donus.length === 0) {
    throw new Error(`Hat ${hatNo} DÖNÜŞ saatleri parse edilemedi (HTML yapısı değişmiş olabilir)`);
  }

  return result;
}

function writeJson(hatNo, data) {
  const outPath = path.join(__dirname, '..', `eshot-${hatNo}.json`);
  const payload = { ...data, _updated: new Date().toISOString() };
  // Etiketleri JSON'a ekleme (sadele format)
  delete payload.gidisLabel;
  delete payload.donusLabel;
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return outPath;
}

async function main() {
  const hats = process.argv.slice(2).length
    ? process.argv.slice(2).map(Number)
    : DEFAULT_HATS;

  console.log(`ESHOT veri güncellemesi: hatlar ${hats.join(', ')}`);

  for (const hatNo of hats) {
    try {
      const html = await postForm(hatNo, 0);
      const parsed = parseScheduleHtml(html);
      const outPath = writeJson(hatNo, parsed);
      console.log(
        `  ✓ Hat ${hatNo}: GİDİŞ ${parsed.gidisLabel} (${parsed.gidis.length}), ` +
        `DÖNÜŞ ${parsed.donusLabel} (${parsed.donus.length}) -> ${path.basename(outPath)}`
      );
    } catch (err) {
      console.error(`  ✗ Hat ${hatNo} GÜNCELLENEMEDİ: ${err.message}`);
      console.error(`    Dosyaya dokunulmadı (eski veri korundu).`);
      process.exitCode = 1;
    }
  }
}

// Test edilebilirlik için export
module.exports = { postForm, postFormWithRetry, timeToMin, parseScheduleHtml, extractTimesFromSection, fetchHat };

// Doğrudan çalıştırıldığında main; require ile import edildiğinde çalışmaz.
if (require.main === module) {
  main();
}
