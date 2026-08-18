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
rem A Infinity real liga o marketplace (apphosting.infinity.yaml) — o preview acompanha.
set VITE_MARKETPLACE_ENABLED=true
set VITE_BRAND_NAME=Infinity
set VITE_BRAND_SHORT=Infinity
set VITE_BRAND_LOGO_URL=/infinity/logo.svg
set VITE_BRAND_FAVICON_URL=/infinity/favicon.svg
rem Logo por tema (∞ roxo): "sidebar-dark" = texto escuro -> tema CLARO e vice-versa.
set VITE_BRAND_LOGO_LIGHT_URL=/infinity/logo-sidebar-dark.svg
set VITE_BRAND_LOGO_DARK_URL=/infinity/logo-sidebar-white.svg
set VITE_BRAND_ACCENT=#8332B9
rem CANVAS/SURFACE removidos (2026-07-29): a instancia real NAO os declara — o
rem preview pinava o vinho antigo e nao representava o app (apphosting.infinity.yaml).
set PORT=3124
rem dev:server = servidor cru; "npm run dev" e o orquestrador da demo AffiliaCore
npm run dev:server
