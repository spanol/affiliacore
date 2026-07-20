@echo off
setlocal
cd /d D:\code\boost-afiliiados
echo.
echo ==========================================
echo   AffiliaCore Demo - start 1 clique
echo ==========================================
echo.
node scripts\provision\start-affiliacore-demo.cjs
echo.
echo Se quiser, abra o arquivo de credenciais em:
echo D:\code\boost-afiliiados\.demo-runtime\affiliacore\latest-demo-credentials.txt
echo.
pause
