/*
=========================================
Timing core — shared engine for the 4 timing tools.
Configure via window.TIMING_CONFIG = { set, mode } before loading:
  set : "central" | "adlib"      (which lines to step through)
  mode: "display" | "voice"      (capture start/end, or voice segments)
Output uses the GLOBAL line number (position in moonlight.json lyrics),
so it maps straight back to the right entry.
=========================================
*/
(function(){

  const cfg  = window.TIMING_CONFIG || {};
  const set  = cfg.set  || "central";
  const mode = cfg.mode || "display";

  const isAdlib = l => (l.adlib === true) || (typeof l.adlib === "string" && l.adlib.trim() !== "");
  const keep    = set === "adlib" ? isAdlib : (l => !isAdlib(l));

  const accent  = set === "adlib" ? "#df068c" : "#7c5cff";
  const setName = set === "adlib" ? "AD-LIBS" : "CENTRAL";
  const modeName= mode === "voice" ? "VOZ (contador)" : "LETRA en pantalla";
  document.title = "Timing — " + modeName + " · " + setName;

  /* ---------- styles ---------- */
  const style = document.createElement("style");
  style.textContent = `
    :root{ --bg:#0e0e13; --panel:#1a1a22; --accent:${accent}; --text:#f2f2f7; --muted:#9a9aa8; }
    *{ box-sizing:border-box; }
    body{ margin:0; font-family:"Segoe UI",Arial,sans-serif; background:var(--bg); color:var(--text); }
    #tw{ max-width:1100px; margin:0 auto; padding:18px; display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    #title{ grid-column:1/3; font-size:16px; font-weight:800; letter-spacing:1px; color:var(--accent); }
    video{ width:100%; border-radius:12px; background:#000; grid-column:1/2; }
    #right{ grid-column:2/3; display:flex; flex-direction:column; gap:12px; }
    .card{ background:var(--panel); border-radius:12px; padding:16px; }
    #now{ font-size:15px; color:var(--muted); }
    #member{ font-size:26px; font-weight:800; letter-spacing:1px; margin:6px 0; }
    #text{ font-size:19px; font-weight:600; line-height:1.4; min-height:52px; }
    #status{ font-size:22px; font-weight:800; padding:14px; border-radius:10px; text-align:center; }
    .st-a{ background:#1e3a2f; color:#7dffb0; } .st-b{ background:#3a2f1e; color:#ffd27d; } .st-idle{ background:#26262f; color:#cfcfe0; }
    #segs{ font-size:14px; color:var(--accent); min-height:20px; font-family:monospace; }
    #next{ font-size:14px; color:var(--muted); }
    #controls{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; grid-column:1/3; }
    button{ background:var(--accent); color:#fff; border:0; border-radius:8px; padding:9px 14px; font-weight:700; cursor:pointer; font-size:14px; }
    button.sec{ background:#2a2a34; }
    input{ width:70px; background:#2a2a34; color:#fff; border:1px solid #3a3a44; border-radius:6px; padding:6px; }
    kbd{ background:#2a2a34; border:1px solid #444; border-radius:5px; padding:2px 7px; font-weight:700; }
    #bar{ height:10px; background:#2a2a34; border-radius:999px; overflow:hidden; grid-column:1/3; }
    #barfill{ height:100%; width:0; background:var(--accent); }
    textarea{ width:100%; height:210px; background:#0a0a0f; color:#cfe; border:1px solid #333; border-radius:8px; font-family:monospace; font-size:13px; padding:10px; grid-column:1/3; }
    .hint{ font-size:13px; color:var(--muted); grid-column:1/3; line-height:1.5; }
    .nav{ grid-column:1/3; font-size:13px; }
    .nav a{ color:var(--accent); margin-right:14px; }
  `;
  document.head.appendChild(style);

  /* ---------- markup ---------- */
  document.body.innerHTML = `
    <div id="tw">
      <div id="title">Cronometrar: ${modeName} — líneas ${setName}</div>
      <video id="v" src="videos/moonlight.mp4" controls preload="auto"></video>
      <div id="right">
        <div class="card">
          <div id="now">Cargando…</div>
          <div id="member">—</div>
          <div id="text"></div>
        </div>
        <div id="status" class="st-a">—</div>
        <div id="segs" class="card"></div>
        <div id="next" class="card">Siguiente: —</div>
      </div>
      <div id="controls">
        <span>Velocidad:</span>
        <button class="sec" data-rate="0.5">0.5x</button>
        <button class="sec" data-rate="0.75">0.75x</button>
        <button class="sec" data-rate="1">1x</button>
        <span style="margin-left:12px">Compensar reacción (s):</span>
        <input id="offset" type="number" step="0.01" value="0.12">
        <button id="undo" class="sec">↶ Deshacer (Z)</button>
        <button id="reset" class="sec">Reiniciar</button>
        <button id="copy">Copiar</button>
      </div>
      <div id="bar"><div id="barfill"></div></div>
      <div class="hint" id="hint"></div>
      <textarea id="out" readonly></textarea>
      <div class="nav">
        Herramientas:
        <a href="timing-lyric.html">Letra central</a>
        <a href="timing-adlib.html">Letra ad-libs</a>
        <a href="timing-voice.html">Voz central</a>
        <a href="timing-voice-adlib.html">Voz ad-libs</a>
      </div>
    </div>`;

  const v       = document.getElementById("v");
  const elNow   = document.getElementById("now");
  const elMember= document.getElementById("member");
  const elText  = document.getElementById("text");
  const elStatus= document.getElementById("status");
  const elSegs  = document.getElementById("segs");
  const elNext  = document.getElementById("next");
  const elBar   = document.getElementById("barfill");
  const elOut   = document.getElementById("out");
  const elOffset= document.getElementById("offset");
  const elHint  = document.getElementById("hint");

  elHint.innerHTML = (mode === "voice")
    ? `<b>VOZ:</b> <kbd>ESPACIO</kbd> cuando empieza la voz y otra vez cuando para (un segmento). Si vuelve a cantar en la misma línea, otro <kbd>ESPACIO</kbd>. <kbd>ENTER</kbd> pasa a la siguiente. <kbd>Z</kbd> deshace.`
    : `<b>LETRA:</b> <kbd>ESPACIO</kbd> cuando <b>aparece</b> la letra y otra vez cuando <b>desaparece</b>. Pasa sola a la siguiente. <kbd>Z</kbd> deshace.`;

  /* ---------- state ---------- */
  let items = [];            // {gi, line}
  let pos = 0;
  let phase = "start";       // display mode
  let recStart = null;       // voice mode (open segment)
  const disp = [];           // display: disp[pos] = {start,end}
  const voices = [];         // voice:   voices[pos] = [[s,e],...]
  const history = [];

  fetch("data/nctdream/moonlight.json")
    .then(r => r.json())
    .then(d => {
      (d.lyrics || []).forEach((line, gi) => { if(keep(line)) items.push({ gi, line }); });
      render();
    })
    .catch(e => { elMember.textContent = "Error cargando moonlight.json"; console.error(e); });

  function lineText(l){
    const t = [l.original, l.romanization, l.english].filter(Boolean).join("  /  ");
    if(set === "adlib" && typeof l.adlib === "string" && l.adlib.trim() !== "")
      return (t ? t + "  ·  " : "") + "(ad-lib: " + l.adlib + ")";
    return t || "(sin texto)";
  }
  function now(){ const off = parseFloat(elOffset.value) || 0; return Math.max(0, Math.round((v.currentTime - off) * 100) / 100); }

  function render(){
    const total = items.length;
    if(pos >= total){
      elNow.textContent = "¡Terminado! " + total + " / " + total;
      elMember.textContent = "✓ Listo";
      elText.textContent = "Pulsa «Copiar» y pega los tiempos al asistente.";
      elStatus.textContent = "COMPLETADO"; elStatus.className = "st-idle";
      elSegs.textContent = ""; elNext.textContent = "Siguiente: —";
    } else {
      const it = items[pos];
      const l = it.line;
      elNow.textContent = "Línea global #" + (it.gi + 1) + "  ·  " + (pos + 1) + " / " + total + " (" + setName + ")";
      elMember.textContent = (l.members || []).join(" & ");
      elText.textContent = lineText(l);
      if(mode === "voice"){
        if(recStart != null){ elStatus.textContent = "● GRABANDO voz… ESPACIO para PARAR"; elStatus.className = "st-b"; }
        else { elStatus.textContent = "ESPACIO = empieza voz · ENTER = siguiente"; elStatus.className = "st-idle"; }
        const segs = voices[pos] || [];
        elSegs.textContent = "Segmentos: " + (segs.length ? segs.map(s => "["+s[0].toFixed(2)+", "+s[1].toFixed(2)+"]").join(" ") : "—")
                            + (recStart != null ? "  (abierto: "+recStart.toFixed(2)+"…)" : "");
      } else {
        if(phase === "start"){ elStatus.textContent = "ESPACIO en el INICIO (aparece)"; elStatus.className = "st-a"; }
        else { elStatus.textContent = "ESPACIO en el FINAL (desaparece)"; elStatus.className = "st-b"; }
        const d = disp[pos];
        elSegs.textContent = d ? ("inicio: " + d.start.toFixed(2) + (d.end != null ? "  fin: " + d.end.toFixed(2) : "  …")) : "";
      }
      const nx = items[pos + 1];
      elNext.textContent = nx ? ("Siguiente: " + (nx.line.members || []).join(" & ")) : "Siguiente: (última)";
    }
    elBar.style.width = (total ? (pos / total) * 100 : 0) + "%";
    buildOutput();
  }

  function tapSpace(){
    if(pos >= items.length) return;
    const t = now();
    if(mode === "voice"){
      if(recStart == null){ recStart = t; history.push({ type:"open" }); }
      else {
        if(!voices[pos]) voices[pos] = [];
        voices[pos].push([recStart, t]); recStart = null; history.push({ type:"close", pos });
      }
    } else {
      if(phase === "start"){ disp[pos] = { start:t, end:null }; phase = "end"; history.push({ type:"start", pos }); }
      else { disp[pos].end = t; history.push({ type:"end", pos }); pos++; phase = "start"; }
    }
    render();
  }

  function enter(){
    if(mode !== "voice" || pos >= items.length) return;
    if(recStart != null){
      if(!voices[pos]) voices[pos] = [];
      voices[pos].push([recStart, now()]); recStart = null; history.push({ type:"close", pos });
    }
    history.push({ type:"next", pos }); pos++; render();
  }

  function undo(){
    const h = history.pop(); if(!h) return;
    if(h.type === "open"){ recStart = null; }
    else if(h.type === "close"){ if(voices[h.pos] && voices[h.pos].length){ recStart = voices[h.pos].pop()[0]; } }
    else if(h.type === "next"){ pos = h.pos; }
    else if(h.type === "end"){ pos = h.pos; if(disp[pos]) disp[pos].end = null; phase = "end"; }
    else if(h.type === "start"){ disp[h.pos] = undefined; pos = h.pos; phase = "start"; }
    render();
  }

  function buildOutput(){
    const lines = [];
    for(let i = 0; i < items.length; i++){
      const gi = items[i].gi + 1;
      if(mode === "voice"){
        const segs = voices[i];
        if(!segs || !segs.length) continue;
        lines.push(gi + ": voice [" + segs.map(s => "["+s[0].toFixed(2)+","+s[1].toFixed(2)+"]").join(",") + "]");
      } else {
        const d = disp[i];
        if(!d) continue;
        lines.push(gi + ": " + d.start.toFixed(2) + " " + (d.end != null ? d.end.toFixed(2) : "?"));
      }
    }
    elOut.value = lines.join("\n");
  }

  document.addEventListener("keydown", e => {
    if(e.code === "Space"){ e.preventDefault(); tapSpace(); }
    else if(e.code === "Enter"){ e.preventDefault(); enter(); }
    else if(e.key === "z" || e.key === "Z"){ e.preventDefault(); undo(); }
  });
  document.querySelectorAll("[data-rate]").forEach(b =>
    b.addEventListener("click", () => { v.playbackRate = parseFloat(b.dataset.rate); }));
  document.getElementById("undo").addEventListener("click", undo);
  document.getElementById("reset").addEventListener("click", () => {
    pos = 0; phase = "start"; recStart = null; disp.length = 0; voices.length = 0; history.length = 0; render();
  });
  document.getElementById("copy").addEventListener("click", () => {
    elOut.select(); document.execCommand("copy");
    const b = document.getElementById("copy"); const o = b.textContent;
    b.textContent = "¡Copiado!"; setTimeout(() => b.textContent = o, 1200);
  });

})();
