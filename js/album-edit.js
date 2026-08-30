/* Editor del álbum — foto, colores del race, música por canción y música de fondo. */
(function(){
  const P = new URLSearchParams(location.search);
  const ALBUM_URL = P.get("album") || "";
  const desktop = (window.desktop && window.desktop.isDesktop) ? window.desktop : null;
  const el = s => document.querySelector(s);
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmt = t => { t = Math.max(0, t||0); const m=Math.floor(t/60), s=Math.floor(t%60); return m+":"+String(s).padStart(2,"0"); };
  const SONG_COLORS = ["#ff4d6d","#4dabf7","#ffa94d","#cc5de8","#20c997","#ffd43b","#748ffc","#f783ac","#69db7c","#e8590c","#22b8cf","#9775fa"];

  let album = null;
  const loadJSON = p => desktop ? desktop.loadSong(p).then(x => (x && x.ok) ? x.data : null) : fetch(p).then(r=>r.json()).catch(()=>null);
  const save = async () => { if(!desktop) return; try{ await desktop.saveSong(ALBUM_URL, album); }catch(e){} };

  function paintCover(){ el("#cov").innerHTML = album.cover ? '<img src="'+album.cover+'?v='+Date.now()+'">' : "💿"; }

  // reordenar canciones (mueve juntos: canción, su trozo y su color)
  const swapAt = (arr,i,j) => { if(!arr) return; const t=arr[i]; arr[i]=arr[j]; arr[j]=t; };
  async function moveSong(i, dir){
    const j = i+dir, n = (album.songs||[]).length; if(j<0 || j>=n) return;
    swapAt(album.songs, i, j);
    album.clips = album.clips || []; swapAt(album.clips, i, j);
    album.songColors = album.songColors || []; swapAt(album.songColors, i, j);
    await save(); location.reload();
  }

  const sdurEls = {};   // etiqueta de "cuánto dura esta canción en el race" por índice
  const raceDwell = c => Math.max(6, ((c && c.end>c.start) ? (c.end-c.start) : 9) + 0.8);
  function updateRaceDur(){
    const n = (album.songs||[]).length; let est = 0;
    for(let i=0;i<n;i++){ const d = raceDwell((album.clips||[])[i]); est += d;
      if(sdurEls[i]) sdurEls[i].textContent = "⏱ en el race dura " + d.toFixed(1) + " s"; }
    const e2 = el("#racedur"); if(e2) e2.textContent = "⏱ Total ≈ " + Math.round(est+3) + " s";
  }

  // ---- editor de onda reutilizable (recorta un trozo de un audio) ----
  async function buildWave(host, src, clip, onSave){
    const wave = document.createElement("div"); wave.className = "wave";
    wave.innerHTML = '<canvas></canvas><div class="region"><div class="rknob"></div></div>'+
      '<div class="handle hL"></div><div class="handle hR"></div><div class="playhead"><span class="phk"></span></div>';
    host.appendChild(wave);
    const crow = document.createElement("div"); crow.className = "crow";
    crow.innerHTML = '<button class="play pri">▶ Escuchar</button><span class="lbl">—</span>'+
      '<span class="times">inicio <input class="ti" type="number" step="0.1" min="0"> a '+
      '<input class="te" type="number" step="0.1" min="0"> s</span>'+
      '<label style="margin-left:auto"><input type="checkbox" class="fade" checked> atenuar entrada/salida</label>';
    host.appendChild(crow);
    const canvas = wave.querySelector("canvas"), region = wave.querySelector(".region"),
          hL = wave.querySelector(".hL"), hR = wave.querySelector(".hR"),
          head = wave.querySelector(".playhead"), lbl = crow.querySelector(".lbl"),
          playBtn = crow.querySelector(".play"), fadeCb = crow.querySelector(".fade"),
          tiEl = crow.querySelector(".ti"), teEl = crow.querySelector(".te");

    let dur = 0, buf = null;
    try{
      const ab = await fetch(src).then(r=>r.arrayBuffer());
      const actx = new (window.AudioContext||window.webkitAudioContext)();
      buf = await actx.decodeAudioData(ab); dur = buf.duration;
    }catch(e){ lbl.textContent = "No se pudo leer el audio"; }
    if(!dur){ return; }

    if(clip.start==null) clip.start = 0;
    if(clip.end==null || clip.end<=clip.start) clip.end = Math.min(dur, clip.start + 12);
    let phT = clip.start;

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
      if(document.activeElement !== tiEl) tiEl.value = a.toFixed(2);
      if(document.activeElement !== teEl) teEl.value = b.toFixed(2);
    }
    drawWave(); draw();
    window.addEventListener("resize", () => { drawWave(); draw(); });

    const xToT = clientX => { const r = wave.getBoundingClientRect();
      return Math.max(0, Math.min(1,(clientX-r.left)/r.width)) * dur; };
    function drag(kind, e0){
      const t0 = xToT(e0.clientX), a0 = clip.start, b0 = clip.end;
      const move = e => { const d = xToT(e.clientX) - t0;
        if(kind==="L"){ clip.start = Math.max(0, Math.min(xToT(e.clientX), clip.end-0.3)); }
        else if(kind==="R"){ clip.end = Math.min(dur, Math.max(xToT(e.clientX), clip.start+0.3)); }
        else { const len=b0-a0; let na=Math.max(0, Math.min(a0+d, dur-len)); clip.start=na; clip.end=na+len; }
        phT = clip.start; draw(); };
      const up = () => { document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",up); onSave && onSave(); };
      document.addEventListener("pointermove",move); document.addEventListener("pointerup",up);
    }
    hL.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); drag("L",e); });
    hR.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); drag("R",e); });
    region.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); drag("M",e); });
    // arrastrar SOLO la barra blanca (playhead) — no mueve lo morado
    function dragHead(e0){
      const move = e => { phT = xToT(e.clientX); if(au){ try{ au.currentTime = phT; }catch(_){} } draw(); };
      const up = () => { document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",up); };
      document.addEventListener("pointermove",move); document.addEventListener("pointerup",up);
    }
    head.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); dragHead(e); });

    let au = null, raf = 0;
    const stop = () => { if(au){ au.pause(); au=null; } cancelAnimationFrame(raf); playBtn.textContent="▶ Escuchar"; };
    playBtn.onclick = () => {
      if(au){ stop(); return; }
      au = new Audio(src);
      const from = (phT > clip.start && phT < clip.end) ? phT : clip.start;
      au.currentTime = from; au.volume = fadeCb.checked?0:1; playBtn.textContent="⏹ Parar";
      const FADE=1.4;
      const tick = () => { if(!au) return; const ct=au.currentTime; phT = ct; head.style.left = pct(ct)+"%";
        if(fadeCb.checked){ const inn=ct-clip.start, out=clip.end-ct;
          au.volume = Math.max(0,Math.min(1, inn<FADE?inn/FADE:(out<FADE?out/FADE:1))); } else au.volume=1;
        if(ct>=clip.end){ stop(); return; } raf=requestAnimationFrame(tick); };
      au.play().then(()=>{ raf=requestAnimationFrame(tick); }).catch(()=>{});
    };
    fadeCb.checked = clip.fade !== false;
    fadeCb.onchange = () => { clip.fade = fadeCb.checked; onSave && onSave(); };

    // campos numéricos de tiempo (además de arrastrar) para cuadrar exacto
    tiEl.oninput = () => { const v=parseFloat(tiEl.value); if(isFinite(v)){ clip.start=Math.max(0,Math.min(v, clip.end-0.3)); phT=clip.start; draw(); } };
    teEl.oninput = () => { const v=parseFloat(teEl.value); if(isFinite(v)){ clip.end=Math.min(dur, Math.max(v, clip.start+0.3)); draw(); } };
    tiEl.onchange = teEl.onchange = () => { onSave && onSave(); };
  }

  async function buildSong(i, songData){
    album.clips = album.clips || [];
    let clip = album.clips[i] || {}; album.clips[i] = clip;
    album.songColors = album.songColors || [];
    const scol = album.songColors[i] || SONG_COLORS[i % SONG_COLORS.length]; album.songColors[i] = scol;

    const wrap = document.createElement("div"); wrap.className = "song";
    const albumAudio = clip.audio || "";
    const src = albumAudio || songData.audio || songData.instrumental || "";
    const kind = albumAudio ? "audio del álbum" : (songData.audio ? "audio" : (songData.instrumental ? "instrumental" : "sin audio"));
    wrap.innerHTML = '<div class="stitle">'+((i+1)+". "+(songData.song || "Canción "+(i+1)))+' <small>('+kind+')</small>'+
      ' <span class="sdur"></span>'+
      '<span class="reorder"><button class="up" title="subir">↑</button><button class="down" title="bajar">↓</button></span></div>'+
      '<div class="scolor">🎨 Color de la canción (race): <input type="color" class="scol" value="'+scol+'"></div>';
    el("#songs").appendChild(wrap);
    sdurEls[i] = wrap.querySelector(".sdur");
    wrap.querySelector(".scol").oninput = e => { album.songColors[i] = e.target.value; save(); };
    wrap.querySelector(".up").onclick = () => moveSong(i, -1);
    wrap.querySelector(".down").onclick = () => moveSong(i, 1);

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
    await buildWave(wrap, src, clip, () => { album.clips[i]=clip; save(); updateRaceDur(); });
  }

  // color ÚNICO de los nombres y aros de la DERECHA del race
  function buildRaceColors(){
    const host = el("#racecolors"); host.innerHTML = "";
    const c = album.raceColor || "#ffffff"; album.raceColor = c;
    const d = document.createElement("div"); d.className = "onecolor";
    d.innerHTML = '<span style="font-weight:800">Color de nombres y aros:</span> <input type="color" value="'+c+'">';
    host.appendChild(d);
    d.querySelector("input").oninput = e => { album.raceColor = e.target.value; save(); };
  }

  // música de fondo (todas las diapositivas menos el race)
  async function buildBgAudio(){
    album.bgAudio = album.bgAudio || {};
    const host = el("#bgaudio"); host.innerHTML = "";
    const arow = document.createElement("div"); arow.className = "arow";
    arow.innerHTML = '<button class="pickbg ng">🎵 '+(album.bgAudio.src?"Cambiar":"Poner")+' audio de fondo</button>'+
      '<span class="ahint">suena en portada, donut, ranking, nº de veces, average y most/less</span>';
    host.appendChild(arow);
    arow.querySelector(".pickbg").onclick = async () => {
      if(!desktop) return;
      const b=arow.querySelector(".pickbg"); const t0=b.textContent; b.disabled=true; b.textContent="⏳…";
      let res=null; try{ res = await desktop.pickAudio({ group: album.group, song: (album.album||"album")+"_bg" }); }catch(e){}
      b.disabled=false; b.textContent=t0;
      if(res && res.ok){ album.bgAudio = { src: res.audio }; await save(); location.reload(); }
    };
    if(album.bgAudio.src) await buildWave(host, album.bgAudio.src, album.bgAudio, save);
  }

  // versiones (OT7/OT5, con/sin canciones): cada una con nombre + qué canciones y qué miembros
  function buildVersions(songs){
    album.versions = album.versions || [];
    const baseInput = el("#baseName");
    if(baseInput){ baseInput.value = album.baseName || "";
      baseInput.oninput = e => { album.baseName = e.target.value; save(); }; }
    const roster = [], seen = {};
    songs.forEach(sd => (sd && sd.members || []).forEach(m => { if(!seen[m.name]){ seen[m.name]=1; roster.push(m); } }));
    const host = el("#versions");
    const render = () => {
      host.innerHTML = "";
      album.versions.forEach((v, vi) => {
        if(!v.songs) v.songs = songs.map((s,i)=>i);
        if(!v.members) v.members = roster.map(m=>m.name);
        const card = document.createElement("div"); card.className = "vcard";
        card.innerHTML = `
          <div class="vhead">
            <input class="vname" type="text" placeholder="Nombre (p. ej. OT7)" value="${esc(v.name||'')}">
            <button class="vdel ng">✕ quitar</button>
          </div>
          <div class="vgrid">
            <div><div class="vlbl">Canciones</div><div class="vsongs"></div></div>
            <div><div class="vlbl">Miembros</div><div class="vmem"></div></div>
          </div>`;
        host.appendChild(card);
        const sc = card.querySelector(".vsongs");
        songs.forEach((sd,i) => {
          const on = v.songs.indexOf(i) !== -1;
          const l = document.createElement("label");
          l.innerHTML = `<input type="checkbox" ${on?"checked":""}> ${esc(sd ? (sd.song||("Canción "+(i+1))) : ("Canción "+(i+1)))}`;
          l.querySelector("input").onchange = e => {
            if(e.target.checked){ if(v.songs.indexOf(i)===-1) v.songs.push(i); v.songs.sort((a,b)=>a-b); }
            else v.songs = v.songs.filter(x=>x!==i);
            save();
          };
          sc.appendChild(l);
        });
        const mc = card.querySelector(".vmem");
        roster.forEach(m => {
          const on = v.members.indexOf(m.name) !== -1;
          const l = document.createElement("label");
          l.innerHTML = `<input type="checkbox" ${on?"checked":""}> ${esc(m.name)}`;
          l.querySelector("input").onchange = e => {
            if(e.target.checked){ if(v.members.indexOf(m.name)===-1) v.members.push(m.name); }
            else v.members = v.members.filter(x=>x!==m.name);
            save();
          };
          mc.appendChild(l);
        });
        card.querySelector(".vname").oninput = e => { v.name = e.target.value; save(); };
        card.querySelector(".vdel").onclick = () => { album.versions.splice(vi,1); save(); render(); };
      });
    };
    el("#addver").onclick = () => {
      album.versions.push({ name:"", songs: songs.map((s,i)=>i), members: roster.map(m=>m.name) });
      save(); render();
    };
    render();
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
    buildRaceColors();
    buildVersions(songs);
    await buildBgAudio();
    updateRaceDur();
  }
  load();
})();
