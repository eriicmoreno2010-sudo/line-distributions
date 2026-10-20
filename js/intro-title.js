/*
=========================================
Intro title — al empezar aparece el título de la canción sobre un fondo y luego
se desvanece dejando ver la app.

  · layout classic (o sin layout) -> grupo + canción + "Lyrics + Line Distribution"
  · layout coded -> pantalla completa PROPIA, fondo BLANCO: fotos de los miembros
    arriba y debajo el título grande (estilo CCL) + "Grupo | Color Coded Lyrics"

Se auto-reproduce al cargar (aunque el navegador bloquee el autoplay del vídeo);
en el export frame a frame sigue el reloj del vídeo (determinista).
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
      color:#f4f4f8; font-family:var(--app-font,"Segoe UI",Inter,Arial,sans-serif);
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
    /* Si la canción es de tema CLARO, la intro también es clara (fondo blanco, texto oscuro) */
    body.theme-light #intro-title{
      background:
        radial-gradient(120% 90% at 50% 38%, #ffffff 0%, transparent 60%),
        radial-gradient(120% 90% at 50% 100%, #eceef4 0%, transparent 55%),
        #f4f5f9;
      color:#14151c;
    }
    body.theme-light #intro-title .it-grp{ color:#3a3d49; }
    body.theme-light #intro-title .it-sub{ color:#5a5f6c; }
    body.theme-light #intro-title .it-sng{ text-shadow:0 2vh 6vh rgba(0,0,0,.12); }

    /* ========== INTRO CODED ==========
       Pantalla completa PROPIA (fixed, como la clásica): fondo BLANCO, fotos de los
       miembros arriba y el título debajo. Todas las reglas llevan el prefijo
       "html body" para que NO las pisen ni el tema claro/oscuro ni la intro clásica. */
    html body #intro-title.intro-coded{
      position:fixed; inset:0; z-index:250; pointer-events:none;
      display:block; text-align:center;
      background:#fff; color:#14151c;
      font-family:var(--app-font,"Segoe UI",Inter,Arial,sans-serif);
    }
    html body #intro-title.intro-coded .it-coded{
      width:100%; height:100%; display:flex; flex-direction:column;
    }
    /* fila de fotos (arriba) */
    html body #intro-title.intro-coded .it-photos{
      flex:none; width:100%; height:52vh;
      display:flex; justify-content:center; background:#fff;
    }
    html body #intro-title.intro-coded .it-ph{
      position:relative; flex:1 1 0; min-width:0; max-width:20vw; overflow:hidden;
      container-type:inline-size;
      background:color-mix(in srgb, var(--c) 28%, #fff);
    }
    html body #intro-title.intro-coded .it-ph img{
      width:100%; height:100%; display:block; object-fit:cover;
    }
    /* degradado con el color del miembro en el borde inferior de su foto */
    html body #intro-title.intro-coded .it-ph::after{
      content:""; position:absolute; left:0; right:0; bottom:0; height:5%;
      background:linear-gradient(to top, var(--c) 0%, transparent 100%); opacity:.7;
    }
    /* nombre del miembro: relleno de su color y contorno blanco (como en la tira real) */
    html body #intro-title.intro-coded .it-nm{
      position:absolute; left:2%; right:2%; bottom:2.2vh; z-index:1; text-align:center;
      font-family:"Jua", var(--app-font,"Segoe UI",Inter,Arial,sans-serif); font-weight:400;
      font-size:min(16cqw, calc(143cqw / var(--n, 7)));
      line-height:1.1; white-space:nowrap;
      color:var(--c); -webkit-text-stroke:.16em #fff; paint-order:stroke fill;
      text-shadow:0 2px 6px rgba(0,0,0,.45);
    }
    /* título (abajo) */
    html body #intro-title.intro-coded .it-coded-body{
      flex:1 1 auto; min-height:0;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      background:#fff; gap:1.8vh; padding:0 3vw 2vh; text-align:center;
    }
    html body #intro-title.intro-coded .it-sng-wrap{
      display:flex; justify-content:center; max-width:100%;
    }
    html body #intro-title.intro-coded .it-sng{
      font-size:var(--it-title-size, 24vh); font-weight:900; font-style:italic;
      letter-spacing:-.07em; line-height:.82;
      text-transform:uppercase; text-shadow:none;
      transform:scaleX(.76); transform-origin:center;
      color:var(--intro-c, #2a8f82);
      background:linear-gradient(180deg,
        color-mix(in srgb, var(--intro-c) 55%, #fff) 0%,
        var(--intro-c) 42%,
        color-mix(in srgb, var(--intro-c) 72%, #000) 100%);
      -webkit-background-clip:text; background-clip:text;
      -webkit-text-fill-color:transparent;
      filter:drop-shadow(0 .35vh 0 color-mix(in srgb, var(--intro-c) 45%, #000))
             drop-shadow(0 1.4vh 2.2vh rgba(0,0,0,.16));
      max-width:100%;
    }
    html body #intro-title.intro-coded .it-sub{
      font-size:2.35vh; font-weight:700; letter-spacing:.32vh;
      text-transform:none; color:#5a6270; margin-top:0;
    }
    @media(max-width:900px){
      html body #intro-title.intro-coded .it-photos{ height:40vh; }
      html body #intro-title.intro-coded .it-ph{ max-width:none; }
      html body #intro-title.intro-coded .it-sng{ font-size:18vw; }
      html body #intro-title.intro-coded .it-sub{ font-size:3.2vw; letter-spacing:.4vw; }
    }
  `;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.id = "intro-title";
  el.innerHTML = `<div class="it-inner">
      <div class="it-grp"></div>
      <div class="it-sng"></div>
      <div class="it-sub">Lyrics + Line Distribution</div>
    </div>`;
  document.body.appendChild(el);

  const grpEl = el.querySelector(".it-grp");
  const sngEl = el.querySelector(".it-sng");
  let inner = el.querySelector(".it-inner");

  function prettyName(s){
    return String(s || "").replace(/\w\S*/g, w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }

  function titleColor(hex){
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if(!m) return "#2a8f82";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if(lum <= 0.52) return "#" + m[1];
    const d = 0.52 / Math.max(lum, 0.01);
    const R = Math.round(r * d), G = Math.round(g * d), B = Math.round(b * d);
    return "#" + [R, G, B].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  function titleSize(text){
    const n = String(text || "").replace(/\s+/g, " ").trim().length;
    if(n > 22) return "10vh";
    if(n > 16) return "14vh";
    if(n > 12) return "18vh";
    if(n > 8)  return "22vh";
    return "26vh";
  }

  // versión de las fotos (la guarda ranking.js); si no existe, 1
  function photoVer(){
    try{ if(typeof PHOTO_VER !== "undefined") return PHOTO_VER; }catch(e){}
    return window.PHOTO_VER || 1;
  }

  // resuelve cuando todas las fotos han cargado (o fallado), con un tope de espera
  function whenPhotosReady(imgs, maxMs){
    return new Promise(resolve => {
      let left = imgs.length;
      if(!left){ resolve(); return; }
      const one = () => { left--; if(left <= 0) resolve(); };
      imgs.forEach(im => {
        if(im.complete) one();
        else {
          im.addEventListener("load", one, { once:true });
          im.addEventListener("error", one, { once:true });
        }
      });
      setTimeout(resolve, maxMs);
    });
  }

  function buildCoded(s){
    const members = s.members || [];
    const c0 = titleColor(members[0] && members[0].color);

    el.classList.add("intro-coded");
    el.style.setProperty("--intro-c", c0);
    el.style.setProperty("--it-title-size", titleSize(s.song));

    // La capa se queda en <body> (pantalla completa de la ventana, como la clásica).
    el.innerHTML = `<div class="it-coded">
      <div class="it-photos"></div>
      <div class="it-coded-body">
        <div class="it-sng-wrap"><div class="it-sng"></div></div>
        <div class="it-sub"></div>
      </div>
    </div>`;

    // fotos de los miembros (misma ruta y ajuste "focus" que usa la tira real)
    const photos = el.querySelector(".it-photos");
    const imgs = [];
    members.forEach(m => {
      const cell = document.createElement("div");
      cell.className = "it-ph";
      cell.style.setProperty("--c", m.color || "#888");
      if(m.image){
        const img = document.createElement("img");
        img.alt = m.name || "";
        img.style.objectPosition = "center " + (m.focus != null ? m.focus : 45) + "%";
        img.addEventListener("error", () => { img.style.visibility = "hidden"; });
        img.src = m.image + (m.image.indexOf("?") < 0 ? "?" : "&") + "v=" + photoVer();
        cell.appendChild(img);
        imgs.push(img);
      }
      const nm = document.createElement("div");
      nm.className = "it-nm";
      nm.textContent = m.name || "";
      nm.style.setProperty("--n", String(Math.max(1, (m.name || "").length)));
      cell.appendChild(nm);
      photos.appendChild(cell);
    });

    const title = el.querySelector(".it-sng");
    const sub = el.querySelector(".it-sub");
    if(title) title.textContent = s.song || "";
    if(sub) sub.textContent = (s.group || "") + "  |  Color Coded Lyrics";
    inner = el.querySelector(".it-sng-wrap");
    return imgs;
  }

  function buildClassic(s){
    grpEl.textContent = (s && s.group) || "";
    sngEl.textContent = (s && s.song) || "";
  }

  // nombres: del JSON de la canción; si falla, de la cabecera ya renderizada
  fetch(SONG_URL).then(r=>r.json()).then(s=>{
    // tema claro/oscuro cuanto antes, para que la intro classic salga del color correcto
    document.body.classList.toggle("theme-light", s.theme === "light");
    if(s.layout === "coded"){
      const imgs = buildCoded(s);
      // el reloj de la intro arranca cuando las fotos ya están (espera máx. 1,5 s)
      whenPhotosReady(imgs, 1500).then(() => {
        if(!done && cur() <= 0.03) liveStart = nowMs();
      });
    } else buildClassic(s);
  }).catch(()=>{
    grpEl.textContent = (document.getElementById("group-name")||{}).textContent?.trim() || "";
    sngEl.textContent = (document.getElementById("song-name")||{}).textContent?.trim() || "";
  });

  const video = document.getElementById("video");
  const cur = () => (video && isFinite(video.currentTime)) ? video.currentTime : 0;
  let liveStart = (typeof performance!=="undefined" && performance.now) ? performance.now() : 0;
  const nowMs = () => (typeof performance!=="undefined" && performance.now) ? performance.now() : 0;

  let done = false;   // pestillo: la intro se muestra UNA sola vez
  function tick(){
    if (done) return;
    // Reloj:
    //  - export frame a frame (determinista) -> reloj del vídeo
    //  - vídeo reproduciéndose (>0)          -> reloj del vídeo
    //  - parado en 0 (autoplay bloqueado)    -> reloj de pared: la intro se reproduce sola
    let t;
    if (window.__DET_ANIM)       t = cur();
    else if (cur() > 0.03)       t = cur();
    else                         t = (nowMs() - liveStart) / 1000;

    // ya terminó -> quitar del todo y no volver a mostrarla (aunque rebobines)
    if (t >= HOLD + FADE){ done = true; el.remove(); return; }

    const op = (t <= HOLD) ? 1 : 1 - (t - HOLD) / FADE;
    // suavizado (ease-in-out) del fundido
    const e = op<=0?0 : op>=1?1 : (op<.5 ? 2*op*op : 1-Math.pow(-2*op+2,2)/2);

    el.style.opacity = e.toFixed(3);
    el.style.visibility = e > 0.002 ? "visible" : "hidden";
    if(inner) inner.style.transform = "translateY(" + (-(1 - e) * 2.4).toFixed(2) + "vh)";
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
