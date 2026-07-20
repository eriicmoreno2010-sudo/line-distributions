@echo off
REM Arrastra un video sobre este archivo para extraer sus subtitulos a .srt
if "%~1"=="" (
    echo Arrastra un archivo de video sobre este .bat, o pasalo como argumento.
    pause
    exit /b
)
powershell -ExecutionPolicy Bypass -File "%~dp0extract-subs.ps1" "%~1"
echo.
pause
