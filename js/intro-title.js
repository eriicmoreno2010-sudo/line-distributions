/*
=========================================
Intro title — al empezar el vídeo aparece el título de la canción (sobre un
fondo oscuro) y luego se desvanece dejando ver toda la app. Se controla con
video.currentTime (no reloj de pared) para que también salga en el vídeo
exportado frame a frame. Autónomo: inyecta sus estilos y su markup.
=========================================
*/
(function(){
  const SONG_URL = new URLSearchParams(location.search).get("song")
      || "data/nctdream/moonlight.json";
  const HOLD = 3.0;   // totalmente visible hasta este segundo
  const FADE = 0.9;   // se desvanece durante estos segundos

  const style = document.createElement("style");
  style.textContent = `
    #intro-title{
      position:fixed; inset:0; z-index:250; pointer-events:none;
      display:flex; align-items:center; justify-content:center; text-align:center;
      background:
        radial-gradient(120% 90% at 50% 38%, #17172a 0%, transparent 60%),
        radial-gradient(120% 90% at 50% 100%, #1a1330 0%, transparent 55%),
        #0b0b11;
      color:#f4f4f8; font-family:"Segoe UI",Inter,Arial,sans-serif;
      opacity:1;
    }
    #intro-title .it-inner{ display:flex; flex-direction:column; align-items:center; gap:2.4vh; }
    #intro-title .it-grp{
      font-size:2.4vh; font-weight:800; letter-spacing:1.1vh; text-transform:uppercase;
      color:#9a9ab0;
    }
    #intro-title .it-bar{ width:8vh; height:.55vh; border-radius:999px;
      background:linear-gradient(90deg, transparent, var(--accent,#7c5cff), transparent); }
    #intro-title .it-sng{ font-size:9.2vh; font-weight:900; letter-spacing:.2vh; line-height:1;
      text-shadow:0 2vh 6vh rgba(0,0,0,.6); }
    @media(max-width:900px){
      #intro-title .it-sng{ font-size:9vw; }
      #intro-title .it-grp{ font-size:3.2vw; letter-spacing:1.4vw; }
    }
  `;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.id = "intro-title";
  el.innerHTML = `<div class="it-inner">
      <div class="it-grp"></div>
      <div class="it-bar"></div>
      <div class="it-sng"></div>
    </div>`;
  document.body.appendChild(el);

  const grpEl = el.querySelector(".it-grp");
  const sngEl = el.querySelector(".it-sng");
  const inner = el.querySelector(".it-inner");

  // nombres: del JSON de la canción; si falla, de la cabecera ya renderizada
  fetch(SONG_URL).then(r=>r.json()).then(s=>{
    grpEl.textContent = s.group || "";
    sngEl.textContent = s.song  || "";
  }).catch(()=>{
    grpEl.textContent = (document.getElementById("group-name")||{}).textContent?.trim() || "";
    sngEl.textContent = (document.getElementById("song-name")||{}).textContent?.trim() || "";
  });

  const video = document.getElementById("video");

  function tick(){
    const t = (video && isFinite(video.currentTime)) ? video.currentTime : 0;
    let op;
    if (t <= HOLD) op = 1;
    else if (t >= HOLD + FADE) op = 0;
    else op = 1 - (t - HOLD) / FADE;
    // suavizado (ease-in-out) del fundido
    const e = op<=0?0 : op>=1?1 : (op<.5 ? 2*op*op : 1-Math.pow(-2*op+2,2)/2);
    el.style.opacity = e.toFixed(3);
    el.style.visibility = e > 0.002 ? "visible" : "hidden";
    inner.style.transform = "translateY(" + (-(1 - e) * 2.4).toFixed(2) + "vh)"; // sube un poco al irse
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
