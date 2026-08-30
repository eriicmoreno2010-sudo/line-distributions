/* =========================================================
   CORTADOR DE VÍDEO — modelo "la barra se acorta":
   la línea de tiempo representa el vídeo YA EDITADO. Seleccionas
   una parte y la QUITAS: desaparece de la barra y se une el resto.
   Exporta recodificando (frame-exacto, 1080p/FPS del original).
   ========================================================= */
(function(){
  const $ = s => document.querySelector(s);
  const desktop = window.desktop;
  if(!desktop || !desktop.cutVideo){
    document.body.innerHTML = '<p style="padding:40px;font:800 16px sans-serif;color:#f0f0f6">Esta herramienta solo funciona en la app de escritorio.</p>';
    return;
  }

  const video = $("#video"), empty = $("#empty");
  const timeline = $("#timeline"), cutEl = $("#cut"), hA = $("#hA"), hB = $("#hB"), ph = $("#ph");
  const oaudio = $("#oaudio"), waveCanvas = $("#wave"), offRange = $("#off"), offNum = $("#offNum");
  const audiolane = $("#audiolane"), aph = $("#aph");
  const exportBtn = $("#export"), removeBtn = $("#removeBtn"), undoBtn = $("#undo");

  let dur = 0, srcPath = "";
  let segs = [];                       // trozos CONSERVADOS en tiempo original: [{s,e}]
  let selA = 0, selB = 0, hasSel = false;   // selección (a quitar) en tiempo EDITADO
  let history = [];                    // para deshacer
  let audioPath = "", audioBuf = null, audioOff = 0;

  const fmt = t => { t = Math.max(0, t||0); const m = Math.floor(t/60), s = t - m*60; return m + ":" + (s<10?"0":"") + s.toFixed(2); };
  const fps = () => Math.max(1, +$("#fps").value || 30);
  const FRAME = () => 1 / fps();
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const fileUrl = p => "file:///" + encodeURI(String(p).replace(/\\/g, "/"));

  // ----- mapeo tiempo editado <-> tiempo original -----
  const editedDur = () => segs.reduce((a,s)=> a + (s.e - s.s), 0);
  function origFromEdited(te){ const E = editedDur(); te = clamp(te, 0, E); let acc = 0;
    for(const s of segs){ const len = s.e - s.s; if(te <= acc + len + 1e-9) return s.s + (te - acc); acc += len; }
    const last = segs[segs.length-1]; return last ? last.e : 0; }
  function editedFromOrig(to){ let acc = 0;
    for(const s of segs){ if(to < s.s) return acc; if(to <= s.e) return acc + (to - s.s); acc += s.e - s.s; }
    return acc; }
  const curEdited = () => editedFromOrig(video.currentTime || 0);
  const seekEdited = te => { video.currentTime = origFromEdited(clamp(te, 0, editedDur())); };
  const segContaining = to => { for(const s of segs){ if(to >= s.s - 0.03 && to < s.e - 0.001) return s; } return null; };
  const nextSegAfter = t => { let best = null; for(const s of segs){ if(s.s > t - 0.001 && (!best || s.s < best.s)) best = s; } return best; };
  // quita [a,b] (editado) de segs -> nuevos trozos conservados
  function removeEdited(a, b){
    const oA = origFromEdited(a), oB = origFromEdited(b), next = [];
    for(const s of segs){
      if(oB <= s.s || oA >= s.e){ next.push(s); continue; }
      if(oA > s.s) next.push({ s:s.s, e:oA });
      if(oB < s.e) next.push({ s:oB, e:s.e });
    }
    return next.filter(s => s.e - s.s > 0.02);
  }

  const pctE = te => { const E = editedDur(); return E > 0 ? (te/E*100) : 0; };

  function paint(){
    const E = editedDur();
    ph.style.left = pctE(curEdited()) + "%";
    aph.style.left = pctE(curEdited()) + "%";
    $("#tCur").textContent = fmt(curEdited());
    $("#tDur").textContent = fmt(E);
    cutEl.style.display = hasSel ? "" : "none";
    hA.style.display = hasSel ? "" : "none";
    hB.style.display = hasSel ? "" : "none";
    $("#tSelWrap").style.display = hasSel ? "" : "none";
    if(hasSel){
      cutEl.style.left = pctE(selA) + "%"; cutEl.style.width = pctE(selB - selA) + "%";
      hA.style.left = pctE(selA) + "%"; hB.style.left = pctE(selB) + "%";
      $("#tSel").textContent = fmt(selB - selA);
    }
  }
  function updateButtons(){
    removeBtn.disabled = !(hasSel && selB - selA > 0.02);
    undoBtn.disabled = !history.length;
    exportBtn.disabled = !(dur && editedDur() > 0.02);
  }
  function drawCutmarks(){
    timeline.querySelectorAll(".cutmark").forEach(x => x.remove());
    const E = editedDur(); let acc = 0;
    for(let i=0; i<segs.length-1; i++){ acc += segs[i].e - segs[i].s;
      const el = document.createElement("div"); el.className = "cutmark"; el.style.left = (acc/E*100) + "%"; timeline.appendChild(el); }
  }
  function layout(){ drawCutmarks(); drawWave(); }   // cuando cambian los trozos

  // ----- elegir vídeo -----
  $("#pick").onclick = async () => {
    const r = await desktop.pickCutInput();
    if(!r || !r.ok) return;
    srcPath = r.path; video.src = fileUrl(r.path);
    video.style.display = "block"; empty.style.display = "none"; video.load();
  };
  video.addEventListener("loadedmetadata", () => {
    dur = video.duration || 0; segs = [{ s:0, e:dur }]; hasSel = false; history = [];
    const lim = Math.max(20, Math.ceil(dur)); offRange.min = -lim; offRange.max = lim;
    paint(); layout(); updateButtons();
  });
  video.addEventListener("timeupdate", paint);
  video.addEventListener("play",  () => $("#play").textContent = "⏸");
  video.addEventListener("pause", () => $("#play").textContent = "▶");

  // ----- reproducción: salta los trozos quitados; para al final -----
  function loop(){
    if(dur && !video.paused){
      const to = video.currentTime, seg = segContaining(to);
      if(!seg){ const nx = nextSegAfter(to); if(nx) video.currentTime = nx.s; else video.pause(); }
      else if(to >= seg.e - 0.03){ const nx = nextSegAfter(seg.e + 0.001); if(nx) video.currentTime = nx.s; else { video.pause(); video.currentTime = Math.max(0, seg.e - 0.03); } }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ----- interacción con la barra -----
  const timeAt = clientX => { const r = timeline.getBoundingClientRect(); return clamp((clientX - r.left)/r.width, 0, 1) * editedDur(); };
  const onDrag = mv => { const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); };

  // arrastrar por la barra = seleccionar; clic simple = ir a ese punto
  timeline.addEventListener("pointerdown", e => {
    if(!dur) return;
    if(e.target===hA || e.target===hB || e.target===cutEl || e.target===ph) return;
    const downX = e.clientX, downT = timeAt(e.clientX); let moved = false;
    onDrag(ev => {
      if(!moved && Math.abs(ev.clientX - downX) < 5) return;
      moved = true; const t = timeAt(ev.clientX);
      selA = Math.min(downT, t); selB = Math.max(downT, t); hasSel = true; paint(); updateButtons();
    });
    const up = () => { window.removeEventListener("pointerup", up); if(!moved){ seekEdited(downT); paint(); } };
    window.addEventListener("pointerup", up);
  });
  // arrastrar la barrita blanca = ir a ese punto
  ph.addEventListener("pointerdown", e => { if(!dur) return; e.preventDefault(); e.stopPropagation();
    seekEdited(timeAt(e.clientX)); onDrag(ev => { seekEdited(timeAt(ev.clientX)); paint(); }); });
  // manijas de la selección
  hA.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation();
    onDrag(ev => { selA = clamp(timeAt(ev.clientX), 0, selB - 0.02); seekEdited(selA); paint(); updateButtons(); }); });
  hB.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation();
    onDrag(ev => { selB = clamp(timeAt(ev.clientX), selA + 0.02, editedDur()); seekEdited(selB); paint(); updateButtons(); }); });
  // mover la selección entera
  cutEl.addEventListener("pointerdown", e => { if(e.target !== cutEl) return; e.preventDefault(); e.stopPropagation();
    const base = { grabT: timeAt(e.clientX), a0: selA, len: selB - selA };
    onDrag(ev => { const d = timeAt(ev.clientX) - base.grabT; selA = clamp(base.a0 + d, 0, editedDur() - base.len); selB = selA + base.len; paint(); }); });
  // clic en la pista de audio = ir a ese punto
  audiolane.addEventListener("pointerdown", e => { if(!dur) return; seekEdited(timeAt(e.clientX)); paint();
    onDrag(ev => { seekEdited(timeAt(ev.clientX)); paint(); }); });

  // ----- botones -----
  const step = d => { if(!dur) return; video.pause(); seekEdited(curEdited() + d); paint(); };
  const playPause = () => { if(!dur) return;
    if(video.paused){ if(curEdited() >= editedDur() - 0.05) seekEdited(0); video.play(); if(audioPath){ syncAudio(true); oaudio.play().catch(()=>{}); } }
    else { video.pause(); if(audioPath) try{ oaudio.pause(); }catch(e){} } };
  $("#play").onclick   = playPause;
  $("#prevF").onclick  = () => step(-FRAME());
  $("#nextF").onclick  = () => step(+FRAME());
  $("#markIn").onclick  = () => { const t = curEdited(); selA = t; if(!hasSel || selB <= selA) selB = editedDur(); hasSel = true; paint(); updateButtons(); };
  $("#markOut").onclick = () => { const t = curEdited(); selB = t; if(!hasSel || selA >= selB) selA = 0; hasSel = true; paint(); updateButtons(); };
  removeBtn.onclick = () => {
    if(!hasSel || selB - selA <= 0.02) return;
    const posBefore = clamp(selA, 0, editedDur());          // tras quitar, deja el cursor donde empezaba lo quitado
    history.push(JSON.stringify(segs));
    segs = removeEdited(selA, selB);
    if(!segs.length) segs = [{ s:0, e:0 }];
    hasSel = false;
    seekEdited(Math.min(posBefore, editedDur()));
    paint(); layout(); updateButtons();
  };
  undoBtn.onclick = () => { if(!history.length) return; segs = JSON.parse(history.pop()); hasSel = false; seekEdited(clamp(curEdited(),0,editedDur())); paint(); layout(); updateButtons(); };

  document.addEventListener("keydown", e => {
    if(/^(input|select|textarea)$/i.test((e.target && e.target.tagName)||"")) return;
    if(!dur) return;
    if(e.code === "Space"){ e.preventDefault(); playPause(); }
    else if(e.key === "ArrowLeft"){ e.preventDefault(); step(-FRAME()); }
    else if(e.key === "ArrowRight"){ e.preventDefault(); step(+FRAME()); }
    else if(e.key === "[" ){ $("#markIn").onclick(); }
    else if(e.key === "]" ){ $("#markOut").onclick(); }
    else if((e.key === "Delete" || e.key === "Backspace") && !removeBtn.disabled){ e.preventDefault(); removeBtn.onclick(); }
    else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === "z" && !undoBtn.disabled){ e.preventDefault(); undoBtn.onclick(); }
  });

  // ----- audio oficial -----
  function drawWave(){
    const ctx = waveCanvas.getContext("2d");
    const W = audiolane.clientWidth, H = audiolane.clientHeight, dpr = window.devicePixelRatio || 1;
    if(!W) return;
    waveCanvas.width = W*dpr; waveCanvas.height = H*dpr; waveCanvas.style.width = W+"px"; waveCanvas.style.height = H+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    if(!audioBuf) return;
    const ch = audioBuf.getChannelData(0), sr = audioBuf.sampleRate, alen = audioBuf.duration, mid = H/2, E = editedDur();
    ctx.fillStyle = "rgba(255,255,255,.30)";
    for(let x=0; x<W; x++){
      const te = (x + 0.5)/W * E, at = te + audioOff;   // el audio oficial es CONTINUO sobre el vídeo editado
      if(at < 0 || at > alen) continue;
      const win = E/W;                                       // ventana de este pixel (s)
      const s0 = Math.max(0, Math.floor(at*sr)), s1 = Math.min(ch.length, Math.floor((at+win)*sr));
      let peak = 0; const stp = Math.max(1, Math.floor((s1-s0)/8));
      for(let i=s0; i<s1; i+=stp){ const v = Math.abs(ch[i]||0); if(v>peak) peak = v; }
      const h = Math.max(0.6, peak*mid*0.95); ctx.fillRect(x, mid-h, 1, h*2);
    }
  }
  function syncAudio(force){
    if(!audioPath) return;
    oaudio.muted = false; oaudio.volume = 1;
    // el audio oficial suena CONTINUO sobre el vídeo editado: no se corta con los recortes
    const target = curEdited() + audioOff, alen = oaudio.duration || 1e9;
    if(target < 0 || target > alen){ if(!oaudio.paused){ try{ oaudio.pause(); }catch(e){} } return; }
    if(force || Math.abs((oaudio.currentTime||0) - target) > 0.08){ try{ oaudio.currentTime = target; }catch(e){} }
    if(!video.paused && oaudio.paused){ oaudio.play().catch(()=>{}); }
  }
  const setOff = v => { audioOff = +v || 0; offRange.value = audioOff; offNum.value = audioOff.toFixed(2); drawWave(); syncAudio(true); };
  offRange.oninput = () => setOff(offRange.value);
  offNum.oninput   = () => setOff(offNum.value);
  video.addEventListener("seeked", () => syncAudio(true));
  video.addEventListener("timeupdate", () => syncAudio(false));
  window.addEventListener("resize", drawWave);

  $("#pickAudio").onclick = async () => {
    const r = await desktop.pickCutAudio();
    if(!r || !r.ok) return;
    audioPath = r.path; $("#audioName").textContent = "🎵 " + r.name; $("#offGrp").style.display = "";
    audiolane.style.display = ""; oaudio.src = fileUrl(r.path); oaudio.load(); video.muted = true; audioBuf = null;
    try{ const ab = await fetch(fileUrl(r.path)).then(x => x.arrayBuffer());
      const actx = new (window.AudioContext || window.webkitAudioContext)(); audioBuf = await actx.decodeAudioData(ab); if(actx.close) actx.close();
    }catch(e){ audioBuf = null; }
    drawWave();
    if(!video.paused){ syncAudio(true); oaudio.play().catch(()=>{}); }
  };

  // ----- exportar -----
  const ov = $("#ov"), fill = $("#fill"), ovT = $("#ovT"), ovS = $("#ovS");
  desktop.onCutProgress(m => { if(!m) return;
    if(m.phase === "start"){ fill.style.width = "0%"; ovS.textContent = m.msg || ovS.textContent; }
    if(m.pct != null){ fill.style.width = m.pct + "%"; ovT.textContent = "Exportando… " + m.pct + "%"; } });
  exportBtn.onclick = async () => {
    if(!dur || !srcPath) return;
    const segments = segs.filter(s => s.e - s.s > 0.02).map(s => ({ s:s.s, e:s.e }));
    if(!segments.length){ alert("No queda nada que guardar."); return; }
    ov.classList.add("show"); ovT.textContent = "Exportando…"; fill.style.width = "0%";
    ovS.textContent = (segments.length > 1 ? "Uniendo los trozos" : "Recodificando el recorte") + ", no cierres la app.";
    const res = await desktop.cutVideo({ input: srcPath, segments, crf: +$("#crf").value, audio: audioPath || null, audioOffset: audioOff });
    ov.classList.remove("show");
    if(res && res.ok){ const mb = res.size ? (res.size/1048576).toFixed(1) + " MB" : "";
      alert("¡Listo! Guardado en:\n" + res.out + (mb ? ("\n\nTamaño: " + mb) : "")); }
    else if(res && res.canceled){ /* nada */ }
    else alert("Error al exportar: " + ((res && res.error) || "desconocido"));
  };
})();
