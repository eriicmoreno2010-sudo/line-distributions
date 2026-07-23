/*
=========================================
Export button — self-serve, one-click video export.
Records the app in real time (smooth, all animations) at high bitrate and
downloads the file. No extra tools. Press the button or "E".
When Chrome asks what to share, pick "This tab / Esta pestaña" so the app's
own audio is included and there is no sharing bar in the recording.
Hidden in the special ?rec / ?render / ?auto modes.
=========================================
*/
(function(){
  const p = new URLSearchParams(location.search);
  if(p.get("rec") || p.get("render") || p.get("auto")) return;

  let rec = null, chunks = [], stream = null, ext = "webm", recording = false;

  function pickMime(){
    const cands = [
      "video/mp4;codecs=avc1.640028,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    for(const c of cands)
      if(window.MediaRecorder && MediaRecorder.isTypeSupported(c)){
        ext = c.indexOf("mp4") >= 0 ? "mp4" : "webm";
        return c;
      }
    ext = "webm"; return "video/webm";
  }

  const btn = document.createElement("button");
  btn.id = "export-btn";
  btn.type = "button";
  btn.textContent = "⬇  Exportar vídeo";
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:2147483000;" +
    "padding:13px 20px;font:800 15px system-ui,Segoe UI,sans-serif;letter-spacing:.3px;" +
    "border:0;border-radius:12px;background:#7c5cff;color:#fff;cursor:pointer;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.45);transition:background .2s";
  btn.onmouseenter = () => { if(!recording) btn.style.background = "#6a49f2"; };
  btn.onmouseleave = () => { if(!recording) btn.style.background = "#7c5cff"; };

  const hint = document.createElement("div");
  hint.style.cssText =
    "position:fixed;bottom:70px;right:20px;z-index:2147483000;max-width:320px;" +
    "padding:10px 14px;font:600 13px system-ui,sans-serif;line-height:1.4;" +
    "background:#15151d;color:#cfcfe0;border:1px solid #33334a;border-radius:10px;display:none";

  function showHint(t){ hint.textContent = t; hint.style.display = "block"; }
  function hideHint(){ hint.style.display = "none"; }

  async function start(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
      alert("Tu navegador no soporta la exportación integrada. Usa Chrome o Edge.");
      return;
    }
    try{
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 },
        audio: true,
        preferCurrentTab: true
      });
    }catch(e){ return; }   // user cancelled the picker

    chunks = [];
    rec = new MediaRecorder(stream, {
      mimeType: pickMime(),
      videoBitsPerSecond: 40000000,
      audioBitsPerSecond: 320000
    });
    rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: (rec && rec.mimeType) || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "moonlight-line-distribution." + ext; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      if(stream) stream.getTracks().forEach(t => t.stop());
      stream = null; rec = null; recording = false;
      btn.textContent = "⬇  Exportar vídeo";
      btn.style.background = "#7c5cff";
      showHint("¡Listo! Se ha descargado el vídeo. Súbelo a YouTube.");
      setTimeout(hideHint, 6000);
    };
    // if the user stops sharing from Chrome's UI, finish cleanly
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if(rec && rec.state !== "inactive") rec.stop();
    });

    recording = true;
    btn.textContent = "■  Detener y guardar";
    btn.style.background = "#d23b5b";
    rec.start(2000);   // flush every 2s so long recordings never break

    const v = document.getElementById("video");
    if(v){
      try{ v.currentTime = 0; v.play(); }catch(e){}
      showHint("Grabando la canción entera… se descargará sola al terminar. (Puedes pulsar Detener cuando quieras.)");
      v.addEventListener("ended", () => { if(rec && rec.state !== "inactive") rec.stop(); }, { once:true });
    }
  }

  function stop(){ if(rec && rec.state !== "inactive") rec.stop(); }

  // ---- Desktop app path: real frame-by-frame 4K export (no recording) ----
  const desktop = window.desktop && window.desktop.isDesktop ? window.desktop : null;
  let exporting = false;

  async function desktopExport(){
    if(exporting) return;
    exporting = true;
    btn.textContent = "⏳  Exportando…";
    btn.style.background = "#d29a3b";
    const song = new URLSearchParams(location.search).get("song") || null;
    showHint("Renderizando fotograma a fotograma en 4K… puede tardar varios minutos. No cierres la app.");
    const res = await window.desktop.exportVideo({ song });
    exporting = false;
    btn.textContent = "⬇  Exportar vídeo (4K)";
    btn.style.background = "#7c5cff";
    if(res && res.ok){ showHint("¡Listo! Vídeo 4K guardado en:\n" + res.out); }
    else if(res && res.canceled){ hideHint(); }
    else { showHint("Error al exportar: " + ((res && res.error) || "desconocido")); }
    setTimeout(hideHint, 9000);
  }

  if(desktop){
    btn.textContent = "⬇  Exportar vídeo (4K)";
    window.desktop.onProgress(p => {
      const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
      const label = p.phase === "results" ? "resultados" : "canción";
      btn.textContent = `⏳  Exportando ${label} ${pct}%`;
    });
    btn.onclick = desktopExport;
  }else{
    btn.onclick = () => { recording ? stop() : start(); };
  }

  document.addEventListener("keydown", e => {
    if(e.key === "e" || e.key === "E"){
      e.preventDefault();
      if(desktop) desktopExport();
      else (recording ? stop() : start());
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(hint);
    document.body.appendChild(btn);
  });
})();
