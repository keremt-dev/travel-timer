@echo off
REM ============================================================
REM  ESHOT Veri Güncelleme (Lokal Otomasyon)
REM ============================================================
REM  ESHOT.gov.tr güncel sefer saatlerini çekip eshot-*.json
REM  dosyalarını günceller ve GitHub'a commit+push yapar.
REM
REM  Çalıştırma: çift tıkla veya komut satırından:
REM    scripts\update-eshot.bat
REM
REM  NOT: ESHOT sitesi yurt dışı IP'leri blokladığı için bu script
REM  Türkiye IP'siyle (lokal bilgisayar) çalıştırılmalıdır.
REM ============================================================

setlocal
cd /d "%~dp0\.."

echo === ESHOT Veri Güncellemesi ===
echo.

REM 1) Node.js kontrolü
where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden kurun.
  pause
  exit /b 1
)

REM 2) En son veriyi çek (main branch'te olunduğundan emin ol)
echo [1/4] Git durumu senkronize ediliyor...
git fetch origin
git checkout main
git pull --ff-only origin main

REM 3) ESHOT verisini çek
echo.
echo [2/4] ESHOT sitesinden veri cekiliyor...
node scripts/fetch-eshot.js
if errorlevel 1 (
  echo.
  echo [HATA] ESHOT verisi guncellenemedi. Dosyalar degismedi, commit atlaniyor.
  pause
  exit /b 1
)

REM 4) Değişiklik kontrolü
echo.
echo [3/4] Degisiklik kontrol ediliyor...
git diff --quiet -- eshot-555.json eshot-776.json
if not errorlevel 1 (
  echo Degisiklik yok. ESHOT tarifesinde guncelleme yok.
  echo.
  pause
  exit /b 0
)

REM 5) Commit + push
echo.
echo [4/4] Degisiklikler commit+push ediliyor...
git add eshot-555.json eshot-776.json
git commit -m "chore: ESHOT veri guncellemesi (lokal otomasyon)"
git push origin main

echo.
echo === Tamamlandi. Vercel otomatik yeniden deploy edecek. ===
echo.
pause
