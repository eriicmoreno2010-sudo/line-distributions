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

  let dur = 0, inT = 0, outT = 0, srcPath = "";

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
    $("#exportName") && ($("#exportName").textContent = "");
    paint();
  });
  video.addEventListener("timeupdate", paint);
  video.addEventListener("play",  () => $("#play").textContent = "⏸");
  video.addEventListener("pause", () => $("#play").textContent = "▶");

  // ---- timeline: click para buscar, arrastrar manijas / playhead ----
  const timeAt = clientX => {
    const r = timeline.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1) * dur;
  };
  let drag = null;   // "in" | "out" | "seek"
  const onMove = e => {
    if(!drag || !dur) return;
    const t = timeAt(e.clientX);
    if(drag === "in"){ inT = clamp(t, 0, outT - FRAME()); video.currentTime = inT; }
    else if(drag === "out"){ outT = clamp(t, inT + FRAME(), dur); video.currentTime = outT; }
    else { video.currentTime = t; }
    paint();
  };
  const endDrag = () => { drag = null; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", endDrag); };
  const startDrag = kind => e => { e.preventDefault(); e.stopPropagation(); drag = kind;
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", endDrag); };
  hIn.addEventListener("pointerdown", startDrag("in"));
  hOut.addEventListener("pointerdown", startDrag("out"));
  timeline.addEventListener("pointerdown", e => { if(!dur) return; if(e.target===hIn||e.target===hOut) return;
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

  // ---- exportar ----
  const ov = $("#ov"), fill = $("#fill"), ovT = $("#ovT"), ovS = $("#ovS");
  desktop.onCutProgress(m => {
    if(!m) return;
    if(m.phase === "start"){ fill.style.width = "0%"; ovS.textContent = m.msg || ovS.textContent; }
    if(m.pct != null){ fill.style.width = m.pct + "%"; ovT.textContent = "Exportando… " + m.pct + "%"; }
  });
  exportBtn.onclick = async () => {
    if(!dur || !srcPath) return;
    if(!(outT - inT > 0.02)){ alert("Marca un trozo válido (el fin debe ir después del inicio)."); return; }
    ov.classList.add("show"); ovT.textContent = "Exportando…"; fill.style.width = "0%";
    ovS.textContent = "Recodificando fotograma a fotograma, no cierres la app.";
    const res = await desktop.cutVideo({ input: srcPath, start: inT, end: outT, crf: +$("#crf").value });
    ov.classList.remove("show");
    if(res && res.ok){
      const mb = res.size ? (res.size/1048576).toFixed(1) + " MB" : "";
      alert("¡Listo! Recorte guardado en:\n" + res.out + (mb ? ("\n\nTamaño: " + mb) : ""));
    } else if(res && res.canceled){ /* nada */ }
    else alert("Error al exportar: " + ((res && res.error) || "desconocido"));
  };
})();
