/* Donut distribution view: animated pie of who's sung how much, live over the song.
   Standalone page (not the main viewer). Works in the desktop app (song dropdown +
   loadSong) and, as a fallback, on the web with ?song=<path>. */
(function(){
  const $ = s => document.querySelector(s);
  const TAU = Math.PI * 2;
  const CX = 250, CY = 250, R = 205, r = 118, POP_R = 16;  // donut MÁS GRANDE (llena mejor el viewBox 500). POP: solo crece el radio EXTERIOR (sobresale por arriba); el interior no se mueve
  const GAP = 0.03;   // separación angular UNIFORME entre porciones (rad); misma distancia entre todas, no depende del tamaño

  const svgNS = "http://www.w3.org/2000/svg";
  const slicesG = $("#slices"), legendEl = $("#legend");
  const vid = $("#vid"), seek = $("#seek"), timeEl = $("#time"), playBtn = $("#play"), muteBtn = $("#mute");
  const centerLbl = $("#centerlbl"), centerSub = $("#centersub");
  const songSel = $("#songSel");

  let song = null, members = [];
  // manual clock (used when there is no video)
  const clock = { useVideo:false, playing:false, t:0, dur:0, last:0, seeking:false };

  const fmt = t => { t = Math.max(0, t||0); const m=Math.floor(t/60), s=Math.floor(t%60); return m+":"+String(s).padStart(2,"0"); };

  // ---- who sings what, up to time t (same accrual as the ranking) ----
  function buildIntervals(s){
    const map = {}; (s.members||[]).forEach(m => map[m.name] = []);
    const add = (n,a,b) => { if(map[n] && b>a) map[n].push([a,b]); };
    (s.lyrics||[]).forEach(line => {
      if(Array.isArray(line.voice)){
        line.voice.forEach(seg => {
          const who = seg[2] ? (Array.isArray(seg[2]) ? seg[2] : [seg[2]]) : line.members;
          (who||[]).forEach(n => add(n, seg[0], seg[1]));
        });
      } else {
        const a = line.voiceStart ?? line.start, b = line.voiceEnd ?? line.end;
        (line.members||[]).forEach(n => add(n, a, b));
      }
    });
    return map;
  }
  const secondsAt = (iv,t) => { let x=0; for(const s of iv){ if(t>=s[1]) x+=s[1]-s[0]; else if(t>s[0]) x+=t-s[0]; } return x; };
  const activeAt  = (iv,t) => iv.some(s => t>=s[0] && t<s[1]);

  function ringSlice(cx,cy,ri,ro,a0,a1){
    const P = (rad,a) => [(cx+rad*Math.sin(a)).toFixed(2), (cy-rad*Math.cos(a)).toFixed(2)];
    const large = (a1-a0) > Math.PI ? 1 : 0;
    const [x0o,y0o]=P(ro,a0),[x1o,y1o]=P(ro,a1),[x1i,y1i]=P(ri,a1),[x0i,y0i]=P(ri,a0);
    return `M ${x0o} ${y0o} A ${ro} ${ro} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${ri} ${ri} 0 ${large} 0 ${x0i} ${y0i} Z`;
  }

  // ---- build the slices + legend once for a song ----
  function setupSong(s){
    song = s;
    document.body.classList.toggle("theme-light", s.theme === "light");   // claro si la canción es clara
    members = (s.members||[]).map(m => ({ name:m.name, color:m.color||"#888", iv:[], pop:0 }));
    const map = buildIntervals(s);
    members.forEach(m => m.iv = map[m.name] || []);

    slicesG.innerHTML = ""; legendEl.innerHTML = "";
    if(!members.length){ legendEl.innerHTML = '<div class="empty">Esta canción no tiene miembros.</div>'; return; }

    members.forEach(m => {
      const p = document.createElementNS(svgNS, "path");
      p.setAttribute("fill", m.color);
      slicesG.appendChild(p); m.path = p;

      const row = document.createElement("div"); row.className = "lg"; row.style.setProperty("--c", m.color);
      row.innerHTML = `<span class="dot"></span><span class="nm">${m.name}</span><span class="val">0.00s &nbsp; <b>0%</b></span>`;
      legendEl.appendChild(row);
      m.row = row; m.val = row.querySelector(".val");
    });

    // instrumental opcional: si existe, suena el mp3 (y muteamos el vídeo)
    instSrc = s.instrumental || s.resultsAudio || "";
    instAudio = instSrc ? new Audio(instSrc) : null;

    // clock: prefer the MV video (audio + time); else a manual timer over duration
    clock.playing = false; clock.t = 0; clock.seeking = false; clock.dur = s.duration || 0;
    if(s.video){
      clock.useVideo = true; vid.src = s.video; vid.muted = !!instAudio;   // si hay instrumental, mutea el vídeo
      vid.addEventListener("loadedmetadata", () => { if(isFinite(vid.duration)&&vid.duration>0) clock.dur = vid.duration; }, { once:true });
    } else {
      clock.useVideo = false; vid.removeAttribute("src");
    }
    playBtn.textContent = "▶";
  }
  let instSrc = "", instAudio = null;

  function curTime(){ return clock.useVideo ? (vid.currentTime||0) : clock.t; }
  function curDur(){ return clock.useVideo ? (isFinite(vid.duration)&&vid.duration>0 ? vid.duration : clock.dur) : clock.dur; }

  function setPlaying(p){
    clock.playing = p;
    if(clock.useVideo){ p ? vid.play().catch(()=>{}) : vid.pause(); }
    else { clock.last = Date.now(); }
    if(instAudio){ try{ instAudio.currentTime = curTime(); p ? instAudio.play().catch(()=>{}) : instAudio.pause(); }catch(e){} }
    playBtn.textContent = p ? "⏸" : "▶";
  }
  function seekTo(frac){
    const d = curDur() || 0; const t = frac * d;
    if(clock.useVideo){ try{ vid.currentTime = t; }catch(e){} } else { clock.t = Math.min(t, d); clock.last = Date.now(); }
    if(instAudio){ try{ instAudio.currentTime = t; }catch(e){} }
  }

  function frame(){
    // advance manual clock
    if(!clock.useVideo && clock.playing){
      const now = Date.now(); clock.t += (now - clock.last)/1000; clock.last = now;
      if(clock.t >= clock.dur){ clock.t = clock.dur; clock.playing = false; playBtn.textContent = "▶"; }
    }
    if(members.length) render(curTime());
    requestAnimationFrame(frame);
  }

  function render(t){
    const secs = members.map(m => secondsAt(m.iv, t));
    const total = secs.reduce((a,b)=>a+b, 0);
    let cum = 0, singers = [];
    members.forEach((m,i) => {
      const on = activeAt(m.iv, t);
      if(on) singers.push(m);
      m.pop += ((on?1:0) - m.pop) * 0.25;                 // smooth grow/shrink
      const frac = total > 0 ? secs[i]/total : 0;
      const a0 = cum*TAU, a1 = (cum + Math.min(frac, 0.99999))*TAU; cum += frac;
      const outerR = R + m.pop*POP_R;                 // crece hacia fuera; r (interior) fijo
      // separación UNIFORME: recorta el MISMO ángulo (GAP/2) a cada lado de cada
      // porción → el hueco entre porciones vecinas es siempre GAP, sin importar
      // su tamaño (antes solo había un borde y la POP creaba huecos desiguales).
      const pad = Math.min(GAP/2, (a1 - a0) * 0.4);
      m.path.setAttribute("d", frac > 0 ? ringSlice(CX,CY,r,outerR,a0+pad,a1-pad) : "");
      m.path.setAttribute("opacity", frac > 0 ? 1 : 0);
      m.val.innerHTML = secs[i].toFixed(2) + "s &nbsp; <b>" + (total>0 ? (secs[i]/total*100).toFixed(2) : "0.00") + "%</b>";
      m.row.classList.toggle("sing", on);
    });

    // center: quién canta ahora
    if(singers.length){
      const nm = singers.length > 1 ? "VARIOS" : singers[0].name;
      centerLbl.textContent = nm;
      centerLbl.setAttribute("font-size", nm.length > 8 ? 20 : nm.length > 6 ? 25 : nm.length > 4 ? 30 : 34);
      centerSub.textContent = "cantando";
    } else { centerLbl.textContent = "—"; centerLbl.setAttribute("font-size", 34); centerSub.textContent = ""; }

    const d = curDur() || 0;
    if(!clock.seeking) seek.value = d > 0 ? Math.round(t/d*1000) : 0;
    timeEl.textContent = fmt(t) + " / " + fmt(d);
  }

  // ---- controls ----
  playBtn.onclick = () => setPlaying(!clock.playing);
  seek.addEventListener("pointerdown", () => clock.seeking = true);
  seek.addEventListener("pointerup",   () => clock.seeking = false);
  seek.addEventListener("input", () => seekTo(seek.value/1000));
  muteBtn.onclick = () => { vid.muted = !vid.muted; muteBtn.textContent = vid.muted ? "🔇" : "🔊"; };
  $("#back").onclick = () => { location.href = "library.html"; };
  document.addEventListener("keydown", e => {
    if(e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if(e.key === " "){ e.preventDefault(); setPlaying(!clock.playing); }
  });

  // ---- init ----
  (async () => {
    const param = new URLSearchParams(location.search).get("song");
    if(window.desktop && window.desktop.listSongs){
      const list = (await window.desktop.listSongs()) || [];
      list.sort((a,b)=> (a.group+a.song).localeCompare(b.group+b.song));
      songSel.innerHTML = "";
      list.forEach(s => { const o=document.createElement("option"); o.value=s.path; o.textContent=(s.group?s.group+" — ":"")+s.song; songSel.appendChild(o); });
      const pick = async (p) => {
        const r = await window.desktop.loadSong(p);
        if(r.ok) setupSong(r.data); else legendEl.innerHTML = '<div class="empty">Error: '+r.error+'</div>';
      };
      songSel.onchange = () => pick(songSel.value);
      if(list.length){ if(param){ songSel.value = param; } await pick(songSel.value); }
      else legendEl.innerHTML = '<div class="empty">No hay canciones todavía.</div>';
    } else {
      // web fallback: solo la canción del parámetro
      songSel.style.display = "none";
      if(!param){ legendEl.innerHTML = '<div class="empty">Abre con ?song=data/&lt;grupo&gt;/&lt;cancion&gt;.json</div>'; return; }
      try{ setupSong(await fetch(param).then(r=>r.json())); }
      catch(e){ legendEl.innerHTML = '<div class="empty">No se pudo cargar la canción.</div>'; }
    }
    requestAnimationFrame(frame);
  })();
})();
