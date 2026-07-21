/*
=========================================
In-browser recorder — click the "Grabar" button (or press "R").
Uses getDisplayMedia + MediaRecorder at a high bitrate so text and photos
stay crisp. Exports .mp4 if the browser supports it, otherwise .webm.
=========================================
*/
(function(){
  const TITLE = document.title;
  let rec = null, chunks = [], stream = null, ext = "webm";

  /* ---- floating record button ---- */
  const style = document.createElement("style");
  style.textContent = `
    #rec-btn{
      position:fixed; right:18px; bottom:16px; z-index:400;
      display:flex; align-items:center; gap:9px;
      background:#e03050; color:#fff; border:0; border-radius:999px;
      padding:11px 18px; font:700 15px "Segoe UI",Arial,sans-serif; cursor:pointer;
      box-shadow:0 6px 20px -6px rgba(224,48,80,.8);
    }
    #rec-btn .dot{ width:11px; height:11px; border-radius:50%; background:#fff; }
    #rec-btn.recording{ background:#333; }
    #rec-btn.hidden{ display:none; }
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "rec-btn";
  btn.innerHTML = `<span class="dot"></span>Grabar`;
  btn.title = "Grabar (o tecla R)";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(btn));
  if(document.readyState !== "loading") document.body.appendChild(btn);

  function pickMime(){
    const cands = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp9",
      "video/webm"
    ];
    for(const c of cands){
      if(window.MediaRecorder && MediaRecorder.isTypeSupported(c)){
        ext = c.indexOf("mp4") >= 0 ? "mp4" : "webm";
        return c;
      }
    }
    ext = "webm"; return "video/webm";
  }

  async function start(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
      alert("Tu navegador no soporta la grabación integrada. Usa Chrome o Edge.");
      return;
    }
    try{
      stream = await navigator.mediaDevices.getDisplayMedia({
        video:{ frameRate:60 },
        audio:true                       // marca 'Compartir audio de la pestaña'
      });
    }catch(e){ return; }                  // cancelado

    chunks = [];
    rec = new MediaRecorder(stream, {
      mimeType: pickMime(),
      videoBitsPerSecond: 25000000,
      audioBitsPerSecond: 320000
    });
    rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec ? rec.mimeType : "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "line-distribution." + ext; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if(stream) stream.getTracks().forEach(t => t.stop());
      stream = null; rec = null;
      document.title = TITLE;
      btn.classList.remove("recording", "hidden");
      btn.innerHTML = `<span class="dot"></span>Grabar`;
    };
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if(rec && rec.state !== "inactive") rec.stop();
    });
    rec.start();
    document.title = "● REC — " + TITLE;
    btn.classList.add("hidden");          // se oculta para no salir en la grabacion

    // arrancar el video desde el principio para que la grabacion pille todo
    const v = document.getElementById("video");
    if(v){
      try{ v.pause(); v.currentTime = 0; }catch(e){}
      // pequeño respiro para que el seek a 0 se aplique antes de reproducir
      setTimeout(() => { v.play().catch(()=>{}); }, 250);
    }
  }

  function stop(){ if(rec && rec.state !== "inactive") rec.stop(); }
  function toggle(){ (rec && rec.state === "recording") ? stop() : start(); }

  btn.addEventListener("click", toggle);
  document.addEventListener("keydown", e => {
    if(e.key === "r" || e.key === "R"){ e.preventDefault(); toggle(); }
  });
})();
