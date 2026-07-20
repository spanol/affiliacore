@echo off
setlocal
cd /d D:\code\boost-afiliiados
echo.
echo ==========================================
echo   Bootstrap do primeiro admin - Infinity
echo ==========================================
echo.
echo Este script espera a service account do projeto Infinity em:
echo   D:\code\boost-afiliiados\service-account.infinity.json
echo.
if not exist service-account.infinity.json (
  echo ERRO: arquivo service-account.infinity.json nao encontrado.
  echo Gere a chave privada do projeto infinity-affiliacore no Firebase Console
  echo e salve com esse nome na raiz do repo para rodar este bootstrap.
  echo.
  pause
  exit /b 1
)
set GOOGLE_APPLICATION_CREDENTIALS=D:\code\boost-afiliiados\service-account.infinity.json
node scripts\provision\bootstrap-admin.cjs --email infinity@affiliacore.com.br --name "Admin Infinity"
echo.
pause
