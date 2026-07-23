@echo off
REM Abre la app de escritorio (Line Distributions). Doble clic para lanzar.
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
