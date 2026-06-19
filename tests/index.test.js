const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createAppContext(overrides = {}) {
  const html = fs.readFileSync('index.html', 'utf8');
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match, 'script block should exist');

  const storage = new Map();
  const sessionStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    sessionStorage,
    fetch: async () => {
      throw new Error('network unavailable');
    },
    ...overrides
  };

  vm.createContext(context);
  const script = match[1].replace(/\ninit\(\);\s*$/, '\n');
  vm.runInContext(script, context);
  return context;
}

async function run() {
  const app = createAppContext();

  assert.equal(
    app.findFirstAfter([20, 360, 1420], 23 * 60 + 50),
    0,
    'findFirstAfter should wrap to the next-day 00:20 service'
  );

  const routeData = {
    eshot555: { gidis: [], donus: [550, 650] },
    eshot776: { gidis: [600], donus: [500] },
    izbanCumaHalk: [{ h: 510, v: 540 }, { h: 610, v: 640 }],
    izbanCumaAlay: [{ h: 510, v: 540 }, { h: 610, v: 640 }]
  };

  const r1Donus = app.calculateR1Donus(routeData, {
    sure776: 0,
    cumaYuru: 5,
    halkYuru: 5
  });
  assert.equal(r1Donus[0].cols[0], '08:20', 'R1 dönüş should use 776 DONUS_SAATI');

  const r2Donus = app.calculateR2Donus(routeData, {
    sure776: 0,
    cumaYuru: 5
  });
  assert.equal(r2Donus[0].cols[0], '08:20', 'R2 dönüş should use 776 DONUS_SAATI');

  // ── Kritik #2: R2 "Toplam Yolculuk" sütunu gerçek toplam yolculuk süresini göstermeli ──
  // Gidis: İZBAN(08:30) → Cumaovası(09:00) + 5dk yürüyüş → 776(10:00) kalkış
  //        Alaybey yürüyüşü 5dk: toplam = 10:00 - (08:30 - 5dk) = 95 dk
  const r2GidisData = {
    eshot776: { gidis: [600], donus: [] },
    izbanAlayCuma: [{ h: 510, v: 540 }]
  };
  const r2Gidis = app.calculateR2Gidis(r2GidisData, { alayYuru: 5, cumaYuru: 5, sure776: 0 });
  // cols: [İZBAN Klk, Cuma, 776 Klk, 776 Bkl, Toplam Yolculuk]
  assert.equal(r2Gidis[0].cols[3], '55 dk', 'R2 gidis 776 bekleme = 10:00 - (09:00 + 5) = 55 dk');
  assert.equal(r2Gidis[0].cols[4], '95 dk', 'R2 gidis Toplam Yolculuk = 10:00 - (08:30 - 5) = 95 dk (duplikat değil)');
  assert.notEqual(r2Gidis[0].cols[4], r2Gidis[0].cols[3], 'R2 gidis Toplam sütunu 776 Bkl ile aynı olmamalı');

  // Dönüş: 776(08:20) → Cumaovası(08:20+0) + 5dk → İZBAN(09:00) kalkış → Alaybey(09:00) varış
  //        toplam = 09:00 - 08:20 = 40 dk  |  İZBAN bekleme = 09:00 - 08:25 = 5 dk
  const r2DonusToplam = app.calculateR2Donus(routeData, { sure776: 0, cumaYuru: 5 });
  // cols: [776 Klk, Cuma, İZBAN Klk, İZBAN Bkl, Alay, Toplam Yolculuk]
  assert.equal(r2DonusToplam[0].cols[3], '5 dk', 'R2 dönüş İZBAN bekleme = 09:00 - (08:20 + 5) = 5 dk');
  assert.equal(r2DonusToplam[0].cols[5], '40 dk', 'R2 dönüş Toplam Yolculuk = 09:00 - 08:20 = 40 dk (duplikat değil)');
  assert.notEqual(r2DonusToplam[0].cols[5], r2DonusToplam[0].cols[3], 'R2 dönüş Toplam sütunu İZBAN Bkl ile aynı olmamalı');

  // ── Kritik #1: fetchIzban forceApi=true cache'i atlamalı ──
  const sessionState = new Map();
  const trackingSession = {
    getItem: k => (sessionState.has(k) ? sessionState.get(k) : null),
    setItem: (k, v) => sessionState.set(k, String(v)),
    removeItem: k => sessionState.delete(k)
  };
  let fetchCount = 0;
  const trackingApp = createAppContext({
    sessionStorage: trackingSession,
    fetch: async () => {
      fetchCount++;
      return {
        ok: true,
        json: async () => [{ HareketSaati: '08:30:00', VarisSaati: '09:00:00' }]
      };
    }
  });
  // İlk çağrı API'den çeker ve cache'ler
  await trackingApp.fetchIzban(21, 32);
  // forceApi=false (varsayılan) cache'den döner — fetch sayısı artmaz
  await trackingApp.fetchIzban(21, 32, false);
  assert.equal(fetchCount, 1, 'fetchIzban varsayılan olarak cache kullanmalı');
  // forceApi=true cache'i atlar — fetch sayısı artar
  await trackingApp.fetchIzban(21, 32, true);
  assert.equal(fetchCount, 2, 'fetchIzban forceApi=true cache atlayıp API çekmeli');

  const quietConsole = Object.assign(Object.create(console), { warn() {} });
  const noNetworkApp = createAppContext({ console: quietConsole });
  const eshotRows = await noNetworkApp.fetchEshot(555);
  assert.ok(eshotRows.gidis.length > 0, 'fetchEshot should use embedded fallback when local JSON fetch fails');
  assert.ok(eshotRows.donus.length > 0, 'fetchEshot fallback should include return trips');

  const izbanRows = await noNetworkApp.fetchIzban(21, 32);
  assert.equal(izbanRows.length, 0, 'fetchIzban should degrade to an empty schedule when API is unavailable');

  const allData = await noNetworkApp.loadAllData();
  assert.ok(allData.eshot555.gidis.length > 0, 'loadAllData should resolve with fallback ESHOT data when fetch is unavailable');
  assert.equal(allData.izbanHalkCuma.length, 0, 'loadAllData should keep resolving when IZBAN fetch is unavailable');
  assert.equal(allData.izbanOk, false, 'loadAllData should flag izbanOk=false when IZBAN fetch fails');

  // ── #5: clampParam input değerlerini min/max içinde tutmalı ──
  const makeDoc = inputs => ({
    getElementById: id => inputs[id] || { value: '0', min: '0', max: '0' }
  });
  const clampApp = createAppContext({
    document: makeDoc({
      'p-555-sure':   { value: '500', min: '0', max: '120' }, // 500 -> 120
      'p-halk-yuru':  { value: '-5',  min: '0', max: '30' },  // -5  -> 0
      'p-cuma-yuru':  { value: '',    min: '0', max: '30' },  // boş -> 0
      'p-776-sure':   { value: '40',  min: '0', max: '180' }  // 40  -> 40 (aranalıkta)
    })
  });
  assert.equal(clampApp.clampParam('p-555-sure'), 120, 'clampParam max üst sınırı uygulamalı');
  assert.equal(clampApp.clampParam('p-halk-yuru'), 0, 'clampParam min alt sınırı uygulamalı');
  assert.equal(clampApp.clampParam('p-cuma-yuru'), 0, 'clampParam boş değeri 0 yapmalı');
  assert.equal(clampApp.clampParam('p-776-sure'), 40, 'clampParam aralıktaki değeri korumalı');

  console.log('tests passed');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
