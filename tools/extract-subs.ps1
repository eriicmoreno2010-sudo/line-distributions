# =====================================================================
# extract-subs.ps1
# Extrae TODAS las pistas de subtitulos incrustadas de un video, cada
# idioma a su propio archivo .srt (junto al video).
# Uso:  powershell -ExecutionPolicy Bypass -File extract-subs.ps1 "C:\ruta\video.mkv"
#       (o arrastra el video sobre extract-subs.bat)
# =====================================================================
param([Parameter(Mandatory=$true)][string]$Video)

# ffmpeg/ffprobe instalados con winget -> asegurar que estan en el PATH
$env:Path = [Environment]::GetEnvironmentVariable("Path","User") + ";" +
            [Environment]::GetEnvironmentVariable("Path","Machine")

if(-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)){
    Write-Host "ERROR: ffmpeg no esta instalado o no esta en el PATH." -ForegroundColor Red
    Write-Host "Instalalo con:  winget install Gyan.FFmpeg"
    exit 1
}
if(-not (Test-Path $Video)){
    Write-Host "ERROR: no existe el archivo: $Video" -ForegroundColor Red
    exit 1
}

$dir  = Split-Path $Video -Parent
$name = [IO.Path]::GetFileNameWithoutExtension($Video)
$base = Join-Path $dir $name

# Idioma y codec de cada pista de subtitulos (en orden)
$langs  = @(& ffprobe -v error -select_streams s -show_entries stream_tags=language -of csv=p=0 $Video)
$codecs = @(& ffprobe -v error -select_streams s -show_entries stream=codec_name  -of csv=p=0 $Video)

if($codecs.Count -eq 0){
    Write-Host "Este video NO tiene pistas de subtitulos incrustadas." -ForegroundColor Yellow
    Write-Host "(Si los subtitulos estan 'quemados' en la imagen, no se pueden extraer como texto.)"
    exit 0
}

Write-Host ("Encontradas {0} pista(s) de subtitulos." -f $codecs.Count) -ForegroundColor Cyan
$imageSubs = @("hdmv_pgs_subtitle","dvd_subtitle","dvbsub")

for($i=0; $i -lt $codecs.Count; $i++){
    $lang  = if($i -lt $langs.Count -and $langs[$i]){ $langs[$i] } else { "sub$i" }
    $codec = $codecs[$i]

    if($imageSubs -contains $codec){
        Write-Host "  Pista $i ($lang): es de imagen ($codec), no convertible a texto. Se salta." -ForegroundColor Yellow
        continue
    }

    $out = "$base.$lang.srt"
    if(Test-Path $out){ $out = "$base.$lang.$i.srt" }   # evitar sobrescribir si repiten idioma
    Write-Host "  Extrayendo pista $i ($lang, $codec) -> $out"
    & ffmpeg -y -loglevel error -i $Video -map "0:s:$i" $out
}

Write-Host "Listo. Los .srt estan junto al video." -ForegroundColor Green
