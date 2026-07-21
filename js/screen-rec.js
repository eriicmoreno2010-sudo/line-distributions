/*
=========================================
In-browser recorder — press "R" to start/stop.
Uses getDisplayMedia + MediaRecorder at a high bitrate so text and photos
stay crisp. Exports .mp4 if the browser supports it, otherwise .webm.
=========================================
*/
(function(){
  const TITLE = document.title;
  let rec = null, chunks = [], stream = null, ext = "webm";

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
        audio:true
      });
    }catch(e){ return; }

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
    };
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if(rec && rec.state !== "inactive") rec.stop();
    });
    rec.start();
    document.title = "● REC — " + TITLE;

    // el video se queda en pausa en 0 (no arranca solo); dale a ESPACIO
    const v = document.getElementById("video");
    if(v){ try{ v.pause(); v.currentTime = 0; }catch(e){} }
  }

  function stop(){ if(rec && rec.state !== "inactive") rec.stop(); }

  document.addEventListener("keydown", e => {
    if(e.key === "r" || e.key === "R"){
      e.preventDefault();
      (rec && rec.state === "recording") ? stop() : start();
    }
  });
})();
