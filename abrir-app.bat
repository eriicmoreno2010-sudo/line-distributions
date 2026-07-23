@echo off
title Line Distributions
REM Lanzador de la app de escritorio. No cierres esta ventana mientras uses la app.
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"

echo ============================================
echo   Abriendo Line Distributions...
echo   (no cierres esta ventana negra)
echo ============================================
echo.

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo ERROR: no se encuentra Electron en node_modules.
  echo La app no esta instalada del todo.
  echo.
  pause
  exit /b 1
)

"%~dp0node_modules\electron\dist\electron.exe" "%~dp0"

echo.
echo La app se ha cerrado (codigo %errorlevel%).
pause
