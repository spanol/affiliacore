@echo off
setlocal
cd /d D:\code\boost-afiliiados
echo.
echo ==========================================
echo   Infinity Preview Local
echo ==========================================
echo.
set GOOGLE_APPLICATION_CREDENTIALS=
set FIREBASE_SERVICE_ACCOUNT_KEY=
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
set GCLOUD_PROJECT=affiliacore
set GOOGLE_CLOUD_PROJECT=affiliacore
set FIREBASE_WEBAPP_CONFIG={"apiKey":"demo-local","authDomain":"127.0.0.1","projectId":"affiliacore","storageBucket":"affiliacore.firebasestorage.app","appId":"1:demo:web:demo"}
set VITE_USE_EMULATORS=true
set VITE_OTG_ENABLED=false
set VITE_BRAND_NAME=Infinity
set VITE_BRAND_SHORT=Infinity
set VITE_BRAND_LOGO_URL=/infinity/logo.svg
set VITE_BRAND_FAVICON_URL=/infinity/favicon.svg
set VITE_BRAND_ACCENT=#8332B9
set VITE_BRAND_CANVAS=#26181C
set VITE_BRAND_SURFACE=#3F1D2B
set PORT=3124
npm run dev
