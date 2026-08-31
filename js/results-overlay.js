/*
=========================================
Results overlay — fades in over the app when the song ends, showing the
donut + ranking + evenness. Press "T" to toggle it (for testing).
Self-contained: injects its own styles and markup.
=========================================
*/
(function(){

  const SONG_URL = new URLSearchParams(location.search).get("song")
      || "data/nctdream/moonlight.json";
  const CX=200, CY=200, R=185, RIN=52;
  const PHOTO_VER = (typeof window.PHOTO_VER !== "undefined") ? window.PHOTO_VER : 2;

  function polar(r,deg){ const a=(deg-90)*Math.PI/180; return {x:CX+r*Math.cos(a), y:CY+r*Math.sin(a)}; }
  function sector(a0,a1){
    const p1=polar(R,a0),p2=polar(R,a1),p3=polar(RIN,a1),p4=polar(RIN,a0);
    const large=(a1-a0)>180?1:0;
    return `M ${p1.x} ${p1.y} A ${R} ${R} 0 ${large} 1 ${p2.x} ${p2.y} `
         + `L ${p3.x} ${p3.y} A ${RIN} ${RIN} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
  }
  function totalsFrom(song){
    const t={}; song.members.forEach(m=>t[m.name]=0);
    const add=(n,s,e)=>{ if(t[n]!==undefined && e>s) t[n]+=(e-s); };
    (song.lyrics||[]).forEach(line=>{
      if(Array.isArray(line.voice)){
        line.voice.forEach(seg=>{
          const who=seg[2]?(Array.isArray(seg[2])?seg[2]:[seg[2]]):line.members;
          who.forEach(n=>add(n,seg[0],seg[1]));
        });
      } else {
        const s=line.voiceStart??line.start, e=line.voiceEnd??line.end;
        (line.members||[]).forEach(n=>add(n,s,e));
      }
    });
    return t;
  }

  /* ---------- styles ---------- */
  const style=document.createElement("style");
  style.textContent=`
    /* Deslizante: los resultados esperan fuera de pantalla (abajo) y suben.
       El ranking+letra (#app) sube y se va — NO se difumina. */
    #results-overlay{
      position:fixed; inset:0; z-index:300;
      transform:translateY(100%); will-change:transform;
      transition:transform 1s cubic-bezier(.65,0,.2,1);
      background:
        radial-gradient(120% 90% at 20% 10%, #17172a 0%, transparent 55%),
        radial-gradient(120% 90% at 90% 90%, #1a1330 0%, transparent 55%),
        #0b0b11;
      color:#f4f4f8; font-family:var(--app-font,"Segoe UI",Inter,Arial,sans-serif);
    }
    #results-overlay.show{ transform:translateY(0); }
    /* el canvas principal sube y sale por arriba, en sincronía con el donut */
    #app{ transition:transform 1s cubic-bezier(.65,0,.2,1); will-change:transform; }
    body.results-up #app{ transform:translateY(-100%); }
    #results-overlay #ro-main{ height:100vh; display:flex; align-items:stretch; gap:2vw; padding:3.2vh 3vw; }
    #results-overlay #ro-left{ flex:0 0 46vw; display:flex; flex-direction:column; justify-content:space-between; align-items:flex-start; min-height:0; }
    #results-overlay #ro-head .grp{ font-size:1.9vh; letter-spacing:.5vh; color:#7c7c8a; font-weight:800; }
    #results-overlay #ro-head .sng{ font-size:4vh; font-weight:900; letter-spacing:.2vh; line-height:1; margin-top:.4vh; }
    #results-overlay #ro-chart{ flex:1 1 auto; width:100%; display:flex; align-items:center; justify-content:center; min-height:0; }
    #results-overlay svg{ display:block; height:min(74vh,42vw); width:auto; filter:drop-shadow(0 2vh 4vh rgba(0,0,0,.5)); }
    #results-overlay .seg{ fill:#2c2c37; stroke:#0b0b11; stroke-width:2.5; transition:fill .5s ease; }
    #results-overlay #ro-even .lbl{ font-size:1.8vh; letter-spacing:.5vh; color:#7c7c8a; font-weight:800; margin-bottom:.9vh; }
    #results-overlay #ro-even .val{
      display:inline-block; padding:.7vh 2.4vh; border-radius:1.2vh;
      background:color-mix(in srgb, var(--ev,#888) 16%, #15151d);
      border:1px solid color-mix(in srgb, var(--ev,#888) 55%, transparent);
      color:var(--ev,#888); font-size:4vh; font-weight:900; font-variant-numeric:tabular-nums;
      transition:color .5s ease, background-color .5s ease, border-color .5s ease;
    }
    #results-overlay #ro-list{ flex:1 1 auto; height:100%; display:flex; flex-direction:column; gap:1vh; min-width:0; }
    #results-overlay .row{
      flex:1 1 0; min-height:0; display:grid; grid-template-columns:var(--rphoto,9vh) 1fr auto; align-items:center; gap:1.6vh;
      background:#15151d; border:.42vh solid #2b2b3a; border-radius:1.4vh; padding:1vh 1.8vh;
      opacity:.5; transition:opacity .45s ease, background-color .45s ease, border-color .45s ease, box-shadow .45s ease;
    }
    #results-overlay .row .photo{ width:var(--rphoto,9vh); height:var(--rphoto,9vh); border-radius:50%; object-fit:cover; object-position:center 45%;
      background:#000; filter:grayscale(1) brightness(.75); transition:filter .5s ease, box-shadow .5s ease; }
    #results-overlay .row .name{ font-size:2.5vh; font-weight:900; letter-spacing:.4px; color:#7c7c8a; transition:color .5s ease; line-height:1.1; }
    #results-overlay .row .bar{ margin-top:.8vh; height:1.2vh; border-radius:999px; background:#1c1c25; overflow:hidden; }
    #results-overlay .row .fill{ height:100%; width:0; border-radius:999px; background:#2c2c37; transition:width .6s cubic-bezier(.3,1,.4,1), background-color .5s ease; }
    #results-overlay .row .stats{ text-align:right; font-variant-numeric:tabular-nums; }
    #results-overlay .row .pct{ font-size:2.4vh; font-weight:900; color:#7c7c8a; transition:color .5s ease; line-height:1; }
    #results-overlay .row .sec{ font-size:1.5vh; color:#7c7c8a; margin-top:.4vh; }
    #results-overlay .row.lit{ opacity:1; background:var(--rowbg); border-color:color-mix(in srgb, var(--c) 55%, transparent);
      box-shadow:0 1.5vh 4vh -2vh color-mix(in srgb, var(--c) 70%, transparent); }
    #results-overlay .row.lit .photo{ filter:none; box-shadow:0 0 0 .3vh var(--c); }
    #results-overlay .row.lit .name{ color:var(--c); }
    #results-overlay .row.lit .fill{ background:var(--c); }
    #results-overlay .row.lit .pct{ color:color-mix(in srgb, var(--c) 55%, #fff); }
    #results-overlay .row.lit .sec{ color:#f4f4f8; }
    /* Many members (>10): two thick columns — ranks fill the left column
       top-to-bottom, then the right — so rows are tall enough for the photos */
    #results-overlay #ro-list.two-col{
      display:grid; grid-template-columns:1fr 1fr;
      grid-template-rows:repeat(var(--rows,7), 1fr);
      grid-auto-flow:column; gap:1vh 1.4vh;
    }
    #results-overlay #ro-list.two-col .row{ flex:none; }

    /* Mobile: stack the donut above the ranking and let it scroll */
    @media(max-width:900px){
      #results-overlay{ overflow-y:auto; }
      #results-overlay #ro-main{ flex-direction:column; height:auto; min-height:100vh; padding:3vh 5vw; gap:2.4vh; }
      #results-overlay #ro-left{ flex:none; width:100%; align-items:center; }
      #results-overlay #ro-head{ text-align:center; }
      #results-overlay #ro-head .sng{ font-size:5vw; }
      #results-overlay svg{ height:auto; width:min(64vw, 42vh); }
      #results-overlay #ro-list{ height:auto; width:100%; gap:1.2vh; }
      #results-overlay #ro-list.two-col{ display:flex; flex-direction:column; }
      #results-overlay .row{ flex:0 0 auto; min-height:9vh; }
      #results-overlay .row .name{ font-size:4.4vw; }
      #results-overlay .row .pct{ font-size:4.4vw; }
    }

    /* ----- Tema CLARO: si la canción es clara, la pantalla de resultados también ----- */
    body.theme-light #results-overlay{
      background:
        radial-gradient(120% 90% at 20% 10%, #e9ebf4 0%, transparent 55%),
        radial-gradient(120% 90% at 90% 90%, #eae6f2 0%, transparent 55%),
        #eff1f6;
      color:#14151c;
    }
    body.theme-light #results-overlay .seg{ fill:#d2d5df; stroke:#eff1f6; }
    body.theme-light #results-overlay #ro-head .grp{ color:#7b8090; }
    body.theme-light #results-overlay #ro-even .lbl{ color:#7b8090; }
    body.theme-light #results-overlay .row .bar{ background:#d6d9e2; }
    /* filas AÚN sin encender: gris atenuado */
    body.theme-light #results-overlay .row:not(.lit){ background:#e3e5ee; border-color:#d1d4de; opacity:.55; }
    body.theme-light #results-overlay .row:not(.lit) .name{ color:#8890a0; }
    body.theme-light #results-overlay .row:not(.lit) .pct{ color:#8890a0; }
    body.theme-light #results-overlay .row:not(.lit) .sec{ color:#a0a6b3; }
    body.theme-light #results-overlay .row:not(.lit) .fill{ background:#c9cdd8; }
    /* filas ENCENDIDAS: tinte claro del color del miembro (se nota bien sobre claro) */
    body.theme-light #results-overlay .row.lit{ opacity:1;
      background:color-mix(in srgb, var(--c) 16%, #fff);
      border-color:color-mix(in srgb, var(--c) 55%, transparent); }
    body.theme-light #results-overlay .row.lit .name{ color:color-mix(in srgb, var(--c) 74%, #000); }
    body.theme-light #results-overlay .row.lit .pct{ color:color-mix(in srgb, var(--c) 64%, #000); }
    body.theme-light #results-overlay .row.lit .sec{ color:#14151c; }
    body.theme-light #results-overlay .row.lit .fill{ background:var(--c); }
  `;
  document.head.appendChild(style);

  /* ---------- markup ---------- */
  const ov=document.createElement("div");
  ov.id="results-overlay";
  ov.innerHTML=`
    <div id="ro-main">
      <div id="ro-left">
        <div id="ro-head"><div class="grp" id="ro-grp"></div><div class="sng" id="ro-sng"></div></div>
        <div id="ro-chart"><svg id="ro-svg" viewBox="0 0 400 400"></svg></div>
        <div id="ro-even"><div class="lbl">EVENNESS</div><div class="val" id="ro-ev">—</div></div>
      </div>
      <div id="ro-list"></div>
    </div>`;
  document.body.appendChild(ov);

  let ranked=[], built=false, revealTimer=null;
  let instSrc="", instAudio=null, instStart=0, instEnd=0, instFade=false;   // instrumental (trozo + atenuado) en resultados

  fetch(SONG_URL).then(r=>r.json()).then(SONG=>{ buildResults(SONG); built=true; })
    .catch(e=>console.error("results-overlay:", e));

  function playInstrumental(){
    if(!instSrc) return;
    if(!instAudio){ instAudio=new Audio(instSrc); instAudio.preload="auto"; }
    try{ instAudio.currentTime=instStart; instAudio.volume=1; instAudio.play().catch(()=>{}); }catch(e){}
    requestAnimationFrame(instVolLoop);
  }
  // Suena UNA vez: al llegar al fin del trozo se para (no se reactiva). Atenúa el
  // último tramo si está marcado.
  function instVolLoop(){
    if(!instAudio || instAudio.paused) return;
    const FADE=1.5, ct=instAudio.currentTime;
    if(instEnd>instStart && ct>=instEnd){ try{ instAudio.pause(); }catch(e){} return; }
    instAudio.volume = (instFade && instEnd>instStart && instEnd-ct < FADE)
      ? Math.max(0, (instEnd-ct)/FADE) : 1;
    requestAnimationFrame(instVolLoop);
  }
  function stopInstrumental(){ if(instAudio){ try{ instAudio.pause(); }catch(e){} } }

  function buildResults(SONG){
    instSrc = SONG.instrumental || SONG.resultsAudio || "";
    instStart = +SONG.instrumentalStart || 0;
    instEnd = +SONG.instrumentalEnd || 0;
    instFade = !!SONG.instrumentalFade;
    document.getElementById("ro-grp").textContent=SONG.group;
    document.getElementById("ro-sng").textContent=SONG.song;

    const totals=totalsFrom(SONG);
    const sum=Math.max(0.0001, SONG.members.reduce((a,m)=>a+totals[m.name],0));
    ranked=SONG.members.map(m=>({name:m.name,color:m.color,image:m.image,
              sec:totals[m.name],pct:totals[m.name]/sum*100})).sort((a,b)=>b.sec-a.sec);
    const maxPct=ranked.length?ranked[0].pct:1;

    // evenness (Simpson) coloured red->yellow->green
    const N=ranked.length;
    const sumsq=ranked.reduce((a,m)=>a+Math.pow(m.pct/100,2),0);
    const evenness=(N&&sumsq>0)?1/(N*sumsq):0;
    const hue=Math.max(0,Math.min(120,evenness*120));
    document.getElementById("ro-ev").textContent=(evenness*100).toFixed(2)+"%";
    document.getElementById("ro-even").style.setProperty("--ev",`hsl(${hue.toFixed(0)},80%,50%)`);

    // donut
    const svg=document.getElementById("ro-svg"); let ang=0;
    ranked.forEach(m=>{
      const span=m.pct/100*360;
      const path=document.createElementNS("http://www.w3.org/2000/svg","path");
      path.setAttribute("d",sector(ang,ang+span));
      path.setAttribute("class","seg"); path.style.setProperty("--c",m.color);
      svg.appendChild(path); m.seg=path; ang+=span;
    });

    // rows
    const list=document.getElementById("ro-list");
    ranked.forEach(m=>{
      const row=document.createElement("div"); row.className="row";
      row.style.setProperty("--c",m.color);
      row.style.setProperty("--rowbg",`color-mix(in srgb, ${m.color} 15%, #15151d)`);
      row.innerHTML=`
        <img class="photo" src="${m.image}?v=${PHOTO_VER}" alt="">
        <div class="info"><div class="name">${m.name}</div><div class="bar"><div class="fill"></div></div></div>
        <div class="stats"><div class="pct">${m.pct.toFixed(2)}%</div><div class="sec">${m.sec.toFixed(2)}s</div></div>`;
      list.appendChild(row);
      m.row=row; m.fill=row.querySelector(".fill"); m.fillW=(m.pct/maxPct)*100;
      m.fill.style.width=m.fillW+"%";
    });

    // >10 members: lay the list out in two thick columns (like the ranking)
    if(ranked.length > 10){
      list.classList.add("two-col");
      list.style.setProperty("--rows", Math.ceil(ranked.length/2));
    }

    // Fit the avatar to the row height so it never overflows/touches the card
    // edges on crowded columns (9–10 members = short rows). Capped at 9vh.
    const fitPhotos = () => {
      const row = list.querySelector(".row"); if(!row) return;
      const cs = getComputedStyle(row);
      const avail = row.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if(avail > 0){
        const size = Math.max(40, Math.min(0.09 * window.innerHeight, avail - 8));
        list.style.setProperty("--rphoto", Math.round(size) + "px");
      }
    };
    requestAnimationFrame(fitPhotos);
    window.addEventListener("resize", fitPhotos);
  }

  function setLit(m,on){ m.seg.style.fill=on?m.color:""; m.row.classList.toggle("lit",on); }
  function reset(){ ranked.forEach(m=>setLit(m,false)); }

  function autoReveal(){
    reset();
    if(revealTimer) clearInterval(revealTimer);
    let i=0;
    // start after the fade-in, reveal top-down with a stagger
    setTimeout(()=>{
      revealTimer=setInterval(()=>{
        if(i>=ranked.length){ clearInterval(revealTimer); return; }
        setLit(ranked[i], true); i++;
      }, 700);
    }, 900);
  }

  let instTimer=0;
  function show(){ if(!built || ov.classList.contains("show")) return;
    document.body.classList.add("results-up"); ov.classList.add("show"); autoReveal();
    // el instrumental empieza cuando los resultados YA cubren toda la pantalla
    // (tras la subida de 1s del overlay), no mientras están subiendo.
    clearTimeout(instTimer);
    instTimer = setTimeout(()=>{ if(ov.classList.contains("show")) playInstrumental(); }, 1050); }
  function hide(){ ov.classList.remove("show"); document.body.classList.remove("results-up");
    clearTimeout(instTimer); if(revealTimer) clearInterval(revealTimer); reset(); stopInstrumental(); }

  const video=document.getElementById("video");
  if(video) video.addEventListener("ended", show);
  // preview hook: ?results=1 shows the results screen once it's built
  if(new URLSearchParams(location.search).get("results")==="1"){
    const t=setInterval(()=>{ if(built){ clearInterval(t); show(); } }, 100);
  }
  document.addEventListener("keydown", e=>{
    if(e.key==="t"||e.key==="T"){ ov.classList.contains("show")?hide():show(); }
  });

})();
