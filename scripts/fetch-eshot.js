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
 * HTML entity decode (min: &#199; → Ç, Çarşamba için).
 * ESHOT sitesi Türkçe karakterleri bazen entity olarak gömer.
 */
function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
          .replace(/&amp;/g, '&').replace(/&ccedil;/g, 'ç').replace(/&Ccedil;/g, 'Ç');
}

/**
 * Türkçe gün adını 3 tarifeye mapler.
 * @returns {'weekday'|'saturday'|'sunday'|null}
 */
function dayNameToTariff(dayName) {
  const d = decodeEntities(dayName).trim();
  if (['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'].includes(d)) return 'weekday';
  if (d === 'Cumartesi') return 'saturday';
  if (d === 'Pazar') return 'sunday';
  return null;
}

/**
 * Bir gün panelinden iki yönün saat listelerini çıkarır.
 * Panel içinde ilk <h4>Kalkış</h4> = gidis (ilk durak), ikincisi = donus.
 *
 * @param {string} panelHtml  Tek bir gün panelinin HTML'i
 * @param {string} gidisLabel İlk durak adı (örn. "DOĞANBEY Kalkış")
 * @param {string} donusLabel İkinci durak adı (örn. "CUMAOVASI AKT. Kalkış")
 * @returns {{gidis: number[], donus: number[]}}
 */
function parsePanel(panelHtml, gidisLabel, donusLabel) {
  // Her etiketin bu panel içindeki ilk geçtiği yerden, sonraki <h4>'e kadar slice.
  // Sonraki <h4> yoksa (yön panelin sonunda) panelin tamamını al.
  const listFor = label => {
    const re = new RegExp(`<h4[^>]*>${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/h4>`);
    const m = re.exec(panelHtml);
    if (!m) return [];
    const after = panelHtml.slice(m.index + m[0].length);
    const nextH4 = after.indexOf('<h4');
    const section = nextH4 > 0 ? after.slice(0, nextH4) : after;
    return extractTimesFromSection(section);
  };
  return { gidis: listFor(gidisLabel), donus: listFor(donusLabel) };
}

/**
 * ESHOT HTML yanıtından 3 tarifenin (weekday/saturday/sunday) saat listelerini çıkarır.
 *
 * Sayfa 8 günlük rolling week verir; her gün bir <div class="panel panel-default">
 * içinde, başlığında <h4><strong>DATE</strong></h4> + <h4>GÜNADI</h4>.
 * Her panelde 2 yön listesi var (ilk durak = gidis, ikinci = donus).
 *
 * Her tarifeden ilk bulunan günü alır (hafta içi, cumartesi, pazar).
 *
 * @param {string} html
 * @returns {{weekday: {gidis,donus}, saturday: {gidis,donus}, sunday: {gidis,donus}, weekdayLabel: string, saturdayLabel: string, sundayLabel: string}}
 */
function parseScheduleHtml(html) {
  // İlk iki benzersiz yön etiketini bul (ilk durak = gidis, ikinci = donus)
  const h4matches = [...html.matchAll(/<h4[^>]*>([^<]*Kalkış[^<]*)<\/h4>/g)];
  if (h4matches.length < 2) {
    throw new Error('Yön başlıkları (<h4>...Kalkış</h4>) bulunamadı');
  }
  const labels = [];
  for (const m of h4matches) {
    const label = m[1].trim();
    if (!labels.includes(label)) labels.push(label);
    if (labels.length === 2) break;
  }
  const [gidisLabel, donusLabel] = labels;

  // Gün panellerini bul: <h4><strong>DATE</strong></h4> + <h4>GÜNADI</h4>
  const dayAnchors = [...html.matchAll(
    /<h4[^>]*><strong>(\d{1,2}\.\d{1,2}\.\d{4})<\/strong><\/h4>\s*<h4[^>]*>([^<]+)<\/h4>/g
  )];

  if (dayAnchors.length === 0) {
    throw new Error('Gün paneli başlıkları bulunamadı (HTML yapısı değişmiş olabilir)');
  }

  // Panelleri tariff'e göre topla (her tarifeden ilk bulunan gün)
  const result = { weekday: null, saturday: null, sunday: null };
  const labels2 = { weekday: 'weekdayLabel', saturday: 'saturdayLabel', sunday: 'sundayLabel' };

  for (let i = 0; i < dayAnchors.length; i++) {
    const [, date, rawDayName] = dayAnchors[i];
    const dayName = decodeEntities(rawDayName).trim();
    const tariff = dayNameToTariff(dayName);
    if (!tariff || result[tariff]) continue;  // zaten bulundu

    // Bu panel: bu anchor'dan bir sonraki anchor'a (veya dosya sonuna) kadar
    const start = dayAnchors[i].index;
    const end = i + 1 < dayAnchors.length ? dayAnchors[i + 1].index : html.length;
    const panelHtml = html.slice(start, end);

    result[tariff] = parsePanel(panelHtml, gidisLabel, donusLabel);
    result[labels2[tariff]] = `${date} ${dayName}`;
  }

  // En az hafta içi tarifesinin gelmiş olması beklenir
  if (!result.weekday) {
    throw new Error('Hafta içi tarifesine ait gün paneli bulunamadı');
  }
  // Cumartesi/Pazar eksikse hafta içine düş (bazı dönemlerde aynı olabilir)
  if (!result.saturday) {
    result.saturday = result.weekday;
    result.saturdayLabel = result.weekdayLabel + ' (hafta içi fallback)';
  }
  if (!result.sunday) {
    result.sunday = result.weekday;
    result.sundayLabel = result.weekdayLabel + ' (hafta içi fallback)';
  }

  return result;
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
 * Bir hat için 3 tarifeyi (weekday/saturday/sunday) çekip parse eder.
 * @returns {Promise<{weekday: {gidis,donus}, saturday: {gidis,donus}, sunday: {gidis,donus}}>}
 */
async function fetchHat(hatNo) {
  const html = await postFormWithRetry(hatNo, 0);
  const result = parseScheduleHtml(html);

  for (const tariff of ['weekday', 'saturday', 'sunday']) {
    if (result[tariff].gidis.length === 0) {
      throw new Error(`Hat ${hatNo} ${tariff} GİDİŞ saatleri parse edilemedi (HTML yapısı değişmiş olabilir)`);
    }
    if (result[tariff].donus.length === 0) {
      throw new Error(`Hat ${hatNo} ${tariff} DÖNÜŞ saatleri parse edilemedi (HTML yapısı değişmiş olabilir)`);
    }
  }

  return result;
}

function writeJson(hatNo, data) {
  const outPath = path.join(__dirname, '..', `eshot-${hatNo}.json`);
  const payload = {
    weekday: data.weekday,
    saturday: data.saturday,
    sunday: data.sunday,
    _updated: new Date().toISOString()
  };
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
      const parsed = await fetchHat(hatNo);
      const outPath = writeJson(hatNo, parsed);
      console.log(`  ✓ Hat ${hatNo} -> ${path.basename(outPath)}`);
      console.log(`      Hafta içi ${parsed.weekdayLabel}: gidis ${parsed.weekday.gidis.length}, donus ${parsed.weekday.donus.length}`);
      console.log(`      Cumartesi ${parsed.saturdayLabel}: gidis ${parsed.saturday.gidis.length}, donus ${parsed.saturday.donus.length}`);
      console.log(`      Pazar ${parsed.sundayLabel}: gidis ${parsed.sunday.gidis.length}, donus ${parsed.sunday.donus.length}`);
    } catch (err) {
      console.error(`  ✗ Hat ${hatNo} GÜNCELLENEMEDİ: ${err.message}`);
      console.error(`    Dosyaya dokunulmadı (eski veri korundu).`);
      process.exitCode = 1;
    }
  }
}

// Test edilebilirlik için export
module.exports = {
  postForm, postFormWithRetry, timeToMin, parseScheduleHtml, extractTimesFromSection,
  fetchHat, parsePanel, dayNameToTariff, decodeEntities
};

// Doğrudan çalıştırıldığında main; require ile import edildiğinde çalışmaz.
if (require.main === module) {
  main();
}
