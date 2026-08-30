/* =========================================================
   CORTADOR DE VÍDEO (tipo LosslessCut) — corte frame-exacto
   recodificando (mantiene resolución, FPS y calidad).
   ========================================================= */
(function(){
  const $ = s => document.querySelector(s);
  const desktop = window.desktop;
  if(!desktop || !desktop.cutVideo){
    document.body.innerHTML = '<p style="padding:40px;font:800 16px sans-serif;color:#f0f0f6">Esta herramienta solo funciona en la app de escritorio.</p>';
    return;
  }

  const video = $("#video"), empty = $("#empty");
  const timeline = $("#timeline"), selEl = $("#sel"), hIn = $("#hIn"), hOut = $("#hOut"), ph = $("#ph");
  const exportBtn = $("#export");
  const oaudio = $("#oaudio"), waveCanvas = $("#wave"), offRange = $("#off"), offNum = $("#offNum");

  let dur = 0, inT = 0, outT = 0, srcPath = "";
  let audioPath = "", audioBuf = null, audioOff = 0;   // audio oficial + desfase (audio = video + off)
  let holes = [], holeEls = [];                          // huecos rojos DENTRO de lo azul (se eliminan)

  const fmt = t => { t = Math.max(0, t||0); const m = Math.floor(t/60), s = t - m*60;
    return m + ":" + (s<10?"0":"") + s.toFixed(2); };
  const fps = () => Math.max(1, +$("#fps").value || 30);
  const FRAME = () => 1 / fps();
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const fileUrl = p => "file:///" + encodeURI(String(p).replace(/\\/g, "/"));

  function paint(){
    const pct = t => dur > 0 ? (t/dur*100) : 0;
    hIn.style.left  = pct(inT) + "%";
    hOut.style.left = pct(outT) + "%";
    selEl.style.left = pct(inT) + "%";
    selEl.style.width = pct(outT - inT) + "%";
    ph.style.left = pct(video.currentTime || 0) + "%";
    $("#tCur").textContent = fmt(video.currentTime || 0);
    $("#tDur").textContent = fmt(dur);
    $("#tIn").textContent  = fmt(inT);
    $("#tOut").textContent = fmt(outT);
    $("#tSel").textContent = fmt(outT - inT);
    positionHoles();
  }

  // ---- huecos rojos (trozos a quitar de dentro de lo azul) ----
  const pctT = t => dur > 0 ? (t/dur*100) : 0;
  function positionHoles(){
    holes.forEach((h,i) => { const el = holeEls[i]; if(!el) return;
      el.style.left = pctT(h.s) + "%"; el.style.width = pctT(h.e - h.s) + "%"; });
  }
  function dragMove(mv){ const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); }
  function makeHole(h){
    const el = document.createElement("div"); el.className = "hole";
    el.innerHTML = `<div class="hh hh-in" style="left:0"></div><div class="hh hh-out" style="left:100%"></div><div class="hx">✕</div>`;
    timeline.appendChild(el);
    el.addEventListener("pointerdown", e => { if(e.target !== el) return; e.preventDefault(); e.stopPropagation();
      const base = { grabT: timeAt(e.clientX), s0: h.s, len: h.e - h.s };
      dragMove(ev => { const d = timeAt(ev.clientX) - base.grabT;
        h.s = clamp(base.s0 + d, inT, outT - base.len); h.e = h.s + base.len; positionHoles(); }); });
    el.querySelector(".hh-in").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation();
      dragMove(ev => { h.s = clamp(timeAt(ev.clientX), inT, h.e - FRAME()); video.currentTime = h.s; positionHoles(); paint(); }); });
    el.querySelector(".hh-out").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation();
      dragMove(ev => { h.e = clamp(timeAt(ev.clientX), h.s + FRAME(), outT); video.currentTime = h.e; positionHoles(); paint(); }); });
    const hx = el.querySelector(".hx");
    hx.addEventListener("pointerdown", e => e.stopPropagation());
    hx.addEventListener("click", e => { e.stopPropagation(); const idx = holes.indexOf(h); if(idx>=0) holes.splice(idx,1); rebuildHoles(); });
    return el;
  }
  function rebuildHoles(){
    timeline.querySelectorAll(".hole").forEach(x => x.remove());
    holeEls = holes.map(makeHole); positionHoles();
  }
  // lo que se conserva = [inT,outT] menos los huecos -> lista de trozos
  function clampHoles(){ holes.forEach(h => { h.s = clamp(h.s, inT, outT); h.e = clamp(h.e, inT, outT); }); positionHoles(); }
  function computeSegments(){
    let pieces = [[inT, outT]];
    const hs = holes.map(h => [clamp(Math.min(h.s,h.e), inT, outT), clamp(Math.max(h.s,h.e), inT, outT)])
                    .filter(h => h[1]-h[0] > 0.02).sort((a,b)=>a[0]-b[0]);
    for(const [hs0, he0] of hs){
      const next = [];
      for(const [s,e] of pieces){
        if(he0 <= s || hs0 >= e){ next.push([s,e]); continue; }
        if(hs0 > s) next.push([s, hs0]);
        if(he0 < e) next.push([he0, e]);
      }
      pieces = next;
    }
    return pieces.filter(p => p[1]-p[0] > 0.02).map(p => ({ s:p[0], e:p[1] }));
  }

  // ---- elegir vídeo ----
  $("#pick").onclick = async () => {
    const r = await desktop.pickCutInput();
    if(!r || !r.ok) return;
    srcPath = r.path;
    video.src = fileUrl(r.path);
    video.style.display = "block"; empty.style.display = "none";
    video.load();
  };
  video.addEventListener("loadedmetadata", () => {
    dur = video.duration || 0; inT = 0; outT = dur;
    exportBtn.disabled = false;
    paint();
    if(typeof drawWave === "function") drawWave();
  });
  video.addEventListener("timeupdate", paint);
  video.addEventListener("play",  () => $("#play").textContent = "⏸");
  video.addEventListener("pause", () => $("#play").textContent = "▶");

  // ---- timeline: click para buscar, arrastrar manijas / playhead ----
  const timeAt = clientX => {
    const r = timeline.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1) * dur;
  };
  let drag = null;   // "in" | "out" | "seek" | "move"
  let moveBase = null;   // para arrastrar la franja entera: {grabT, in0, len}
  const onMove = e => {
    if(!drag || !dur) return;
    const t = timeAt(e.clientX);
    if(drag === "in"){ inT = clamp(t, 0, outT - FRAME()); video.currentTime = inT; clampHoles(); }
    else if(drag === "out"){ outT = clamp(t, inT + FRAME(), dur); video.currentTime = outT; clampHoles(); }
    else if(drag === "move"){                        // mover el trozo marcado sin cambiar su duración
      const d = t - moveBase.grabT;
      inT = clamp(moveBase.in0 + d, 0, dur - moveBase.len);
      outT = inT + moveBase.len;
      video.currentTime = inT;
    }
    else { video.currentTime = t; }
    paint();
  };
  const endDrag = () => { drag = null; moveBase = null;
    window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", endDrag); };
  const startDrag = kind => e => { e.preventDefault(); e.stopPropagation(); drag = kind;
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", endDrag); };
  hIn.addEventListener("pointerdown", startDrag("in"));
  hOut.addEventListener("pointerdown", startDrag("out"));
  // arrastrar la franja azul entera (mueve inicio y fin juntos)
  selEl.addEventListener("pointerdown", e => { if(!dur) return;
    e.preventDefault(); e.stopPropagation();
    moveBase = { grabT: timeAt(e.clientX), in0: inT, len: outT - inT };
    startDrag("move")(e);
  });
  // arrastrar la barrita blanca (playhead) para desplazarse
  ph.addEventListener("pointerdown", e => { if(!dur) return;
    e.preventDefault(); e.stopPropagation();
    video.currentTime = timeAt(e.clientX); startDrag("seek")(e); });
  timeline.addEventListener("pointerdown", e => { if(!dur) return; if(e.target===hIn||e.target===hOut||e.target===selEl||e.target===ph) return;
    video.currentTime = timeAt(e.clientX); startDrag("seek")(e); });

  // ---- botones ----
  const step = d => { if(!dur) return; video.pause(); video.currentTime = clamp((video.currentTime||0) + d, 0, dur); paint(); };
  $("#play").onclick   = () => { if(!dur) return; video.paused ? video.play() : video.pause(); };
  $("#prevF").onclick  = () => step(-FRAME());
  $("#nextF").onclick  = () => step(+FRAME());
  $("#setIn").onclick  = () => { inT = clamp(video.currentTime||0, 0, outT - FRAME()); paint(); };
  $("#setOut").onclick = () => { outT = clamp(video.currentTime||0, inT + FRAME(), dur); paint(); };
  $("#goIn").onclick   = () => { video.currentTime = inT; paint(); };
  $("#goOut").onclick  = () => { video.currentTime = outT; paint(); };

  document.addEventListener("keydown", e => {
    if(/^(input|select|textarea)$/i.test((e.target && e.target.tagName)||"")) return;
    if(!dur) return;
    if(e.code === "Space"){ e.preventDefault(); video.paused ? video.play() : video.pause(); }
    else if(e.key === "ArrowLeft"){ e.preventDefault(); step(-FRAME()); }
    else if(e.key === "ArrowRight"){ e.preventDefault(); step(+FRAME()); }
    else if(e.key === "i" || e.key === "I"){ $("#setIn").onclick(); }
    else if(e.key === "o" || e.key === "O"){ $("#setOut").onclick(); }
    else if(e.key === "Home"){ e.preventDefault(); $("#goIn").onclick(); }
    else if(e.key === "End"){ e.preventDefault(); $("#goOut").onclick(); }
  });

  // ---- añadir un hueco (trozo a quitar de dentro de lo azul) ----
  $("#addHole").onclick = () => { if(!dur) return;
    const t = clamp(video.currentTime || 0, inT, outT);
    const len = Math.min(3, Math.max(0.5, (outT - inT) / 6));
    let s = clamp(t, inT, outT - 0.1), e = clamp(s + len, s + 0.1, outT);
    if(e - s < 0.1){ s = clamp(outT - len, inT, outT - 0.1); e = outT; }
    holes.push({ s, e }); rebuildHoles();
  };

  // ---- audio oficial: cargar, silenciar el vídeo, sincronizar y dibujar la onda ----
  function drawWave(){
    const ctx = waveCanvas.getContext("2d");
    const W = timeline.clientWidth, H = timeline.clientHeight, dpr = window.devicePixelRatio || 1;
    waveCanvas.width = W*dpr; waveCanvas.height = H*dpr;
    waveCanvas.style.width = W+"px"; waveCanvas.style.height = H+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    if(!audioBuf || !dur) return;
    const ch = audioBuf.getChannelData(0), sr = audioBuf.sampleRate, alen = audioBuf.duration, mid = H/2;
    ctx.fillStyle = "rgba(255,255,255,.30)";
    const spp = dur / W;                              // segundos por pixel (en tiempo de vídeo)
    for(let x=0; x<W; x++){
      const at0 = x*spp + audioOff, at1 = at0 + spp;  // ventana de audio de este pixel
      if(at1 < 0 || at0 > alen) continue;
      const s0 = Math.max(0, Math.floor(at0*sr)), s1 = Math.min(ch.length, Math.floor(at1*sr));
      let peak = 0; const stepN = Math.max(1, Math.floor((s1-s0)/10));
      for(let i=s0; i<s1; i+=stepN){ const v = Math.abs(ch[i]||0); if(v>peak) peak = v; }
      const h = Math.max(0.6, peak*mid*0.95);
      ctx.fillRect(x, mid-h, 1, h*2);
    }
  }
  function syncAudio(force){
    if(!audioPath) return;
    const target = (video.currentTime||0) + audioOff;
    if(target < 0){ try{ oaudio.pause(); }catch(e){} return; }
    if(force || Math.abs((oaudio.currentTime||0) - target) > 0.08){ try{ oaudio.currentTime = target; }catch(e){} }
  }
  const setOff = v => { audioOff = +v || 0; offRange.value = audioOff; offNum.value = audioOff.toFixed(2); drawWave(); syncAudio(true); };
  offRange.oninput = () => setOff(offRange.value);
  offNum.oninput   = () => setOff(offNum.value);
  video.addEventListener("play",  () => { if(audioPath){ syncAudio(true); oaudio.play().catch(()=>{}); } });
  video.addEventListener("pause", () => { if(audioPath) try{ oaudio.pause(); }catch(e){} });
  video.addEventListener("seeked", () => syncAudio(true));
  video.addEventListener("timeupdate", () => syncAudio(false));
  window.addEventListener("resize", drawWave);

  $("#pickAudio").onclick = async () => {
    const r = await desktop.pickCutAudio();
    if(!r || !r.ok) return;
    audioPath = r.path;
    $("#audioName").textContent = "🎵 " + r.name;
    $("#offGrp").style.display = "";
    oaudio.src = fileUrl(r.path); oaudio.load();
    video.muted = true;                               // como en la web, se silencia el audio del vídeo
    audioBuf = null;
    try{
      const ab = await fetch(fileUrl(r.path)).then(x => x.arrayBuffer());
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      audioBuf = await actx.decodeAudioData(ab);
      if(actx.close) actx.close();
    }catch(e){ audioBuf = null; }
    drawWave();
  };

  // ---- exportar ----
  const ov = $("#ov"), fill = $("#fill"), ovT = $("#ovT"), ovS = $("#ovS");
  desktop.onCutProgress(m => {
    if(!m) return;
    if(m.phase === "start"){ fill.style.width = "0%"; ovS.textContent = m.msg || ovS.textContent; }
    if(m.pct != null){ fill.style.width = m.pct + "%"; ovT.textContent = "Exportando… " + m.pct + "%"; }
  });
  exportBtn.onclick = async () => {
    if(!dur || !srcPath) return;
    const segments = computeSegments();
    if(!segments.length){ alert("No queda nada que guardar. Revisa la franja azul y los huecos."); return; }
    ov.classList.add("show"); ovT.textContent = "Exportando…"; fill.style.width = "0%";
    ovS.textContent = (segments.length > 1 ? "Uniendo los trozos" : "Recodificando el recorte") + ", no cierres la app.";
    const res = await desktop.cutVideo({
      input: srcPath, segments, crf: +$("#crf").value,
      audio: audioPath || null, audioOffset: audioOff
    });
    ov.classList.remove("show");
    if(res && res.ok){
      const mb = res.size ? (res.size/1048576).toFixed(1) + " MB" : "";
      alert("¡Listo! Recorte guardado en:\n" + res.out + (mb ? ("\n\nTamaño: " + mb) : ""));
    } else if(res && res.canceled){ /* nada */ }
    else alert("Error al exportar: " + ((res && res.error) || "desconocido"));
  };
})();
