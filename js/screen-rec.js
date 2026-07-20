/*
=========================================
In-browser recorder — press "R" to start/stop.
Uses getDisplayMedia + MediaRecorder at a very high bitrate so text and
photos stay crisp (no low-bitrate pixelation like some screen recorders).
Downloads a .webm when you stop.
=========================================
*/
(function(){
  const TITLE = document.title;
  let rec = null, chunks = [], stream = null;

  async function start(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
      alert("Tu navegador no soporta la grabación integrada. Usa Chrome/Edge.");
      return;
    }
    try{
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 },
        audio: true                    // marca 'Compartir audio de la pestaña'
      });
    }catch(e){ return; }               // el usuario canceló el diálogo

    chunks = [];
    const opts = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp9",
      "video/webm"
    ];
    const mime = opts.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "video/webm";
    rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 25000000,    // 25 Mbps: nítido pero sin saturar la CPU (audio limpio)
      audioBitsPerSecond: 320000
    });
    rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "line-distribution.webm"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if(stream) stream.getTracks().forEach(t => t.stop());
      stream = null; rec = null;
      document.title = TITLE;
    };
    // si detiene el compartir desde la barra del navegador, finaliza limpio
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if(rec && rec.state !== "inactive") rec.stop();
    });
    rec.start();
    document.title = "● REC — " + TITLE;
  }

  function stop(){ if(rec && rec.state !== "inactive") rec.stop(); }

  document.addEventListener("keydown", e => {
    if(e.key === "r" || e.key === "R"){
      e.preventDefault();
      if(rec && rec.state === "recording") stop(); else start();
    }
  });
})();
