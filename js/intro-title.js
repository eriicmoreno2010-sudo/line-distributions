/*
=========================================
Intro title — al empezar aparece el título de la canción (grupo · canción ·
LINE DISTRIBUTION) sobre un fondo oscuro y luego se desvanece dejando ver la
app. Se auto-reproduce al cargar (aunque el navegador bloquee el autoplay del
vídeo); en el export frame a frame sigue el reloj del vídeo (determinista).
Autónomo: inyecta sus estilos y su markup.
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
    #intro-title .it-inner{ display:flex; flex-direction:column; align-items:center; gap:1.2vh; }
    /* GRUPO (arriba, pequeño, mayúsculas) */
    #intro-title .it-grp{
      font-size:2.6vh; font-weight:800; letter-spacing:.7vh; text-transform:uppercase;
      color:#e9e9f2;
    }
    /* CANCIÓN (protagonista) */
    #intro-title .it-sng{ font-size:9.2vh; font-weight:900; letter-spacing:.1vh; line-height:1;
      text-shadow:0 2vh 6vh rgba(0,0,0,.6); }
    /* LINE DISTRIBUTION (subtítulo, mayúsculas) */
    #intro-title .it-sub{
      font-size:2.4vh; font-weight:800; letter-spacing:.85vh; text-transform:uppercase;
      color:#cfcfe0; margin-top:.6vh;
    }
    @media(max-width:900px){
      #intro-title .it-sng{ font-size:9vw; }
      #intro-title .it-grp{ font-size:3.4vw; letter-spacing:1vw; }
      #intro-title .it-sub{ font-size:3vw; letter-spacing:1vw; }
    }
  `;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.id = "intro-title";
  el.innerHTML = `<div class="it-inner">
      <div class="it-grp"></div>
      <div class="it-sng"></div>
      <div class="it-sub">Line Distribution</div>
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
  const cur = () => (video && isFinite(video.currentTime)) ? video.currentTime : 0;
  const liveStart = (typeof performance!=="undefined" && performance.now) ? performance.now() : 0;
  const nowMs = () => (typeof performance!=="undefined" && performance.now) ? performance.now() : 0;

  function tick(){
    // Reloj:
    //  - export frame a frame (determinista) -> reloj del vídeo
    //  - vídeo reproduciéndose (>0)          -> reloj del vídeo
    //  - parado en 0 (autoplay bloqueado)    -> reloj de pared: la intro se reproduce sola
    let t;
    if (window.__DET_ANIM)       t = cur();
    else if (cur() > 0.03)       t = cur();
    else                         t = (nowMs() - liveStart) / 1000;

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
