/* Editor del álbum — foto del álbum + editor de onda por canción (script externo). */
(function(){
  const P = new URLSearchParams(location.search);
  const ALBUM_URL = P.get("album") || "";
  const desktop = (window.desktop && window.desktop.isDesktop) ? window.desktop : null;
  const el = s => document.querySelector(s);
  const fmt = t => { t = Math.max(0, t||0); const m=Math.floor(t/60), s=Math.floor(t%60); return m+":"+String(s).padStart(2,"0"); };

  let album = null;
  const loadJSON = p => desktop ? desktop.loadSong(p).then(x => (x && x.ok) ? x.data : null) : fetch(p).then(r=>r.json()).catch(()=>null);
  const save = async () => { if(!desktop) return; try{ await desktop.saveSong(ALBUM_URL, album); }catch(e){} };

  function paintCover(){
    el("#cov").innerHTML = album.cover ? '<img src="'+album.cover+'?v='+Date.now()+'">' : "💿";
  }

  // Duración del race = suma de los "parones" (cada canción dura su trozo, min 6s) + margen.
  const raceDwell = c => Math.max(6, ((c && c.end>c.start) ? (c.end-c.start) : 9) + 0.8);
  function updateRaceDur(){
    const n = (album.songs||[]).length; let est = 0;
    for(let i=0;i<n;i++) est += raceDwell((album.clips||[])[i]);
    const s = Math.round(est + 3);
    const el2 = el("#racedur"); if(el2) el2.textContent = "⏱ Total seconds ≈ " + s + " s";
  }

  async function buildSong(i, songData){
    album.clips = album.clips || [];
    let clip = album.clips[i] || {}; album.clips[i] = clip;

    const wrap = document.createElement("div"); wrap.className = "song";
    const albumAudio = clip.audio || "";
    const src = albumAudio || songData.audio || songData.instrumental || "";
    const kind = albumAudio ? "audio del álbum" : (songData.audio ? "audio" : (songData.instrumental ? "instrumental" : "sin audio"));
    wrap.innerHTML = '<div class="stitle">'+((i+1)+". "+(songData.song || "Canción "+(i+1)))+' <small>('+kind+')</small></div>';
    el("#songs").appendChild(wrap);

    // fila de audio: poner un audio SOLO para el álbum (no toca la canción ni el vídeo)
    const arow = document.createElement("div"); arow.className = "arow";
    arow.innerHTML = '<button class="pickaud ng">🎵 '+(albumAudio?"Cambiar":"Poner")+' audio del álbum</button>'+
      '<span class="ahint">solo para el álbum · no afecta al vídeo ni a la canción</span>';
    wrap.appendChild(arow);
    arow.querySelector(".pickaud").onclick = async () => {
      if(!desktop) return;
      const b = arow.querySelector(".pickaud"); const t0=b.textContent; b.disabled=true; b.textContent="⏳…";
      let res=null; try{ res = await desktop.pickAudio({ group: album.group, song: (album.album||"album")+"_a"+(i+1) }); }catch(e){}
      b.disabled=false; b.textContent=t0;
      if(res && res.ok){ clip.audio = res.audio; album.clips[i]=clip; await save(); location.reload(); }
    };

    if(!src){ const n=document.createElement("div"); n.className="noaudio";
      n.textContent="Esta canción no tiene audio: pon uno arriba para usarlo en el álbum."; wrap.appendChild(n); return; }

    const wave = document.createElement("div"); wave.className = "wave";
    wave.innerHTML = '<canvas></canvas><div class="region"><div class="rknob"></div></div>'+
      '<div class="handle hL"></div><div class="handle hR"></div><div class="playhead"></div>';
    wrap.appendChild(wave);
    const crow = document.createElement("div"); crow.className = "crow";
    crow.innerHTML = '<button class="play pri">▶ Escuchar</button><span class="lbl">—</span>'+
      '<label style="margin-left:auto"><input type="checkbox" class="fade" checked> atenuar entrada/salida</label>';
    wrap.appendChild(crow);

    const canvas = wave.querySelector("canvas"), region = wave.querySelector(".region"),
          hL = wave.querySelector(".hL"), hR = wave.querySelector(".hR"),
          head = wave.querySelector(".playhead"), lbl = crow.querySelector(".lbl"),
          playBtn = crow.querySelector(".play"), fadeCb = crow.querySelector(".fade");

    let dur = 0, buf = null;
    try{
      const ab = await fetch(src).then(r=>r.arrayBuffer());
      const actx = new (window.AudioContext||window.webkitAudioContext)();
      buf = await actx.decodeAudioData(ab);
      dur = buf.duration;
    }catch(e){ lbl.textContent = "No se pudo leer el audio"; }
    if(!dur){ return; }

    if(clip.start==null) clip.start = 0;
    if(clip.end==null || clip.end<=clip.start) clip.end = Math.min(dur, clip.start + 12);
    album.clips[i] = clip;
    let phT = clip.start;   // posición de la barra blanca (playhead)

    function drawWave(){
      const cw = canvas.clientWidth || wave.clientWidth, ch = canvas.clientHeight || 96;
      canvas.width = cw; canvas.height = ch;
      const g = canvas.getContext("2d"); g.clearRect(0,0,cw,ch);
      const data = buf.getChannelData(0), block = Math.max(1, Math.floor(data.length/cw)), mid = ch/2;
      g.fillStyle = "rgba(154,154,176,.55)";
      for(let x=0;x<cw;x++){ let max=0; for(let k=0;k<block;k++){ const v=Math.abs(data[x*block+k]||0); if(v>max) max=v; }
        const h = Math.max(1, max*ch*0.92); g.fillRect(x, mid-h/2, 1, h); }
    }
    const pct = t => (t/dur*100);
    function draw(){
      const a = Math.max(0, Math.min(clip.start, dur)), b = Math.max(a, Math.min(clip.end, dur));
      region.style.left = pct(a)+"%"; region.style.width = (pct(b)-pct(a))+"%";
      hL.style.left = pct(a)+"%"; hR.style.left = pct(b)+"%";
      head.style.left = pct(Math.max(0,Math.min(phT,dur)))+"%";
      lbl.textContent = fmt(a)+" – "+fmt(b)+"  ("+(b-a).toFixed(1)+"s)";
    }
    drawWave(); draw();
    window.addEventListener("resize", () => { drawWave(); draw(); });

    const xToT = clientX => { const r = wave.getBoundingClientRect();
      return Math.max(0, Math.min(1,(clientX-r.left)/r.width)) * dur; };

    // Se mueve LO MORADO (la región): cuerpo/pomo la desplazan; los bordes recortan.
    function drag(kind, e0){
      const t0 = xToT(e0.clientX), a0 = clip.start, b0 = clip.end;
      const move = e => { const d = xToT(e.clientX) - t0;
        if(kind==="L"){ clip.start = Math.max(0, Math.min(xToT(e.clientX), clip.end-0.3)); }
        else if(kind==="R"){ clip.end = Math.min(dur, Math.max(xToT(e.clientX), clip.start+0.3)); }
        else { const len=b0-a0; let na=Math.max(0, Math.min(a0+d, dur-len)); clip.start=na; clip.end=na+len; }
        phT = clip.start; draw(); };
      const up = () => { document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",up);
        album.clips[i]=clip; save(); updateRaceDur(); };
      document.addEventListener("pointermove",move); document.addEventListener("pointerup",up);
    }
    hL.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); drag("L",e); });
    hR.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); drag("R",e); });
    region.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); drag("M",e); });

    // escuchar (con atenuado). Al pausar, la barra NO vuelve al inicio; sigue desde ahí.
    let au = null, raf = 0;
    const stop = () => { if(au){ au.pause(); au=null; } cancelAnimationFrame(raf); playBtn.textContent="▶ Escuchar"; };
    playBtn.onclick = () => {
      if(au){ stop(); return; }                    // pausa: deja phT donde está
      au = new Audio(src);
      const from = (phT > clip.start && phT < clip.end) ? phT : clip.start;   // reanuda desde la barra si está dentro
      au.currentTime = from; au.volume = fadeCb.checked?0:1;
      playBtn.textContent="⏹ Parar";
      const FADE=1.4;
      const tick = () => { if(!au) return; const ct=au.currentTime; phT = ct; head.style.left = pct(ct)+"%";
        if(fadeCb.checked){ const inn=ct-clip.start, out=clip.end-ct;
          au.volume = Math.max(0,Math.min(1, inn<FADE?inn/FADE:(out<FADE?out/FADE:1))); } else au.volume=1;
        if(ct>=clip.end){ stop(); return; } raf=requestAnimationFrame(tick); };
      au.play().then(()=>{ raf=requestAnimationFrame(tick); }).catch(()=>{});
    };
    fadeCb.onchange = () => { clip.fade = fadeCb.checked; album.clips[i]=clip; save(); };
    if(clip.fade===false) fadeCb.checked=false;
  }

  async function load(){
    if(!ALBUM_URL){ document.body.innerHTML="<p style='padding:40px'>Falta ?album=…</p>"; return; }
    album = await loadJSON(ALBUM_URL);
    if(!album){ document.body.innerHTML="<p style='padding:40px'>No se pudo cargar el álbum.</p>"; return; }
    el("#atitle").innerHTML = (album.album||"Álbum") + " <span>· " + (album.group||"") + "</span>";
    paintCover();
    el("#openview").onclick = () => location.href="album.html?album="+encodeURIComponent(ALBUM_URL);
    el("#pickcover").onclick = async () => {
      if(!desktop) return;
      const b=el("#pickcover"); const t0=b.textContent; b.disabled=true; b.textContent="⏳…";
      let res=null; try{ res=await desktop.pickCover({ group:album.group, song:album.album }); }catch(e){}
      b.disabled=false; b.textContent=t0;
      if(res && res.ok){ album.cover=res.cover; paintCover(); save(); }
    };
    const songs = await Promise.all((album.songs||[]).map(loadJSON));
    for(let i=0;i<songs.length;i++){ if(songs[i]) await buildSong(i, songs[i]); }
    updateRaceDur();
  }
  load();
})();
