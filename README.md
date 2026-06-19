# İZBAN Aktarma Saatleri

İZBAN aktarmaları için sefer saatleri hesaplama uygulaması. 555/776 ESHOT hatları ile İZBAN arasındaki aktarma saatlerini tablo halinde gösterir.

Tek dosya statik web uygulaması (`index.html`). Backend yok.

## Çalıştırma

```bash
npx serve . -l 3737
# veya scripts/update-eshot.bat ile başlatma (aşağıya bakın)
```

Tarayıcıda http://localhost:3737 açılır.

## Veri Kaynakları

- **ESHOT (555, 776):** `eshot-555.json`, `eshot-776.json` dosyalarından okunur. Veri resmi ESHOT sitesinden (`eshot.gov.tr`) build script ile çekilir (aşağıya bakın). Dosya okunamazsa gömülü yedeğe (`ESHOT_FALLBACK`) düşer.
- **İZBAN:** Çalışma anında `openapi.izmir.bel.tr` API'sinden çekilir (CORS açık). Erişilemezse boş liste kullanılır.

## ESHOT Veri Güncelleme

ESHOT açıveri API'si güncel tarifeleri yansıtmadığı için (örn. yaz tarifesi gecikmeli), veri resmi ESHOT web sitesinden çekilir. ESHOT sitesi CORS vermediği için tarayıcıdan çekilemez; **Node.js build script** (CORS yok) ile lokal olarak çalıştırılır.

### Otomatik (önerilen)

`scripts/update-eshot.bat` dosyasına çift tıklayın. Script:
1. `main` branch'i senkronize eder
2. ESHOT'tan güncel veriyi çeker (`node scripts/fetch-eshot.js`)
3. Değişiklik varsa commit + push yapar
4. Vercel otomatik yeniden deploy eder

### Manuel

```bash
node scripts/fetch-eshot.js          # 555 + 776
node scripts/fetch-eshot.js 776      # sadece 776
git add eshot-*.json && git commit -m "chore: ESHOT güncelleme" && git push
```

### Önemli notlar

- **Türkiye IP'si gerekli.** ESHOT.gov.tr yurt dışı (US vb.) IP'leri coğrafi olarak blokluyor. Bu yüzden GitHub Actions ile otomatik cron yapılamadı; lokal çalıştırma gerekir.
- Veri **hafta içi (Cuma) tarifesidir**. Cumartesi/Pazar daha az sefer var.
- Build script ESHOT sitesinin HTML yapısına bağımlıdır (`<h4>...Kalkış</h4>` başlıkları, `<li id="time-HHMM">`). Markup değişirse `node tests/fetch-eshot.test.js` ile kontrol edin.

## Zamanlanmış görev (opsiyonel)

Windows Görev Zamanlayıcı ile `scripts/update-eshot.bat`'ı günlük çalışacak şekilde ayarlayabilirsiniz. Örnek: her gün 06:00.

## Testler

```bash
node tests/index.test.js          # uygulama hesaplama testleri
node tests/fetch-eshot.test.js    # build script parser testleri
```

## Mimari

```
index.html              Tek dosya uygulama (HTML + CSS + JS)
eshot-555.json          555 hattı sefer saatleri (build script üretir)
eshot-776.json          776 hattı sefer saatleri (build script üretir)
scripts/
  fetch-eshot.js        ESHOT sitesinden veri çekme + JSON üretme (Node.js)
  update-eshot.bat      Lokal otomasyon (fetch + commit + push)
tests/
  index.test.js         Uygulama hesaplama testleri
  fetch-eshot.test.js   Parser testleri (yön ayrımı dahil)
```
