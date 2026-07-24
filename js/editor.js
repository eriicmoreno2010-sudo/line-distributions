/* Line editor (desktop app): assign singers + times per line, playing the MV. */
(function(){
  const $ = s => document.querySelector(s);
  const video = $("#vid"), listEl = $("#list");
  let song = null, songPath = null, sel = 0, awaitingEnd = false;

  // Timing modes: LETRA (display start/end) vs VOZ (voiceStart/voiceEnd, which
  // the ranking counts), each for the central lines or the ad-lib lines.
  const MODES = {
    "lyric-central": { kind:"lyric", fields:["start","end"], adlib:false },
    "lyric-adlib":   { kind:"lyric", fields:["start","end"], adlib:true  },
    "voice-central": { kind:"voice", adlib:false },
    "voice-adlib":   { kind:"voice", adlib:true  }
  };
  let mode = MODES["lyric-central"];

  const fmt = t => { t = Math.max(0, t||0); const m=Math.floor(t/60), s=(t%60); return m+":"+String(Math.floor(s)).padStart(2,"0"); };
  const abbr = n => n.slice(0,3).toUpperCase();
  const isAdlib = l => l.adlib === true || (typeof l.adlib === "string" && l.adlib.trim() !== "");

  async function init(){
    songPath = new URLSearchParams(location.search).get("song");
    if(!window.desktop || !songPath){ listEl.textContent = "Abre el editor desde la biblioteca."; return; }
    const res = await window.desktop.loadSong(songPath);
    if(!res.ok){ listEl.textContent = "Error al cargar: " + res.error; return; }
    song = res.data;
    song.lyrics = song.lyrics || [];
    video.src = song.video;
    $("#title").textContent = song.song || "";
    $("#grp").textContent = song.group || "";
    renderLines();
    updateTapUI();
    syncModeUI();
    requestAnimationFrame(tick);
  }

  function renderLines(){
    listEl.innerHTML = "";
    song.lyrics.forEach((l, i) => listEl.appendChild(makeRow(l, i)));
    highlightSel();
  }

  function syncModeUI(){
    const btn = $("#addadlib");
    if(btn) btn.style.display = mode.adlib ? "" : "none";
  }
  // Add a brand-new ad-lib line (ad-lib modes start empty; you build them here).
  function addAdlib(){
    song.lyrics.push({ start:0, end:0, members:[], original:"", romanization:"", english:"", adlib:true });
    sel = song.lyrics.length - 1;
    awaitingEnd = false;
    renderLines(); updateTapUI();
    const r = listEl.children[sel];
    if(r){ const inp = r.querySelector(".f.orig"); if(inp) inp.focus(); }
  }

  function makeRow(l, i){
    const row = document.createElement("div");
    row.className = "row"; row.dataset.i = i;

    const num = document.createElement("div"); num.className = "num"; num.textContent = i+1;
    num.title = "seleccionar"; num.onclick = () => { sel = i; awaitingEnd = false; highlightSel(); updateTapUI(); };

    const txt = document.createElement("div"); txt.className = "txt";
    const mkf = (cls, val, ph) => { const inp = document.createElement("input"); inp.className = "f " + cls; inp.value = val || ""; inp.placeholder = ph; return inp; };
    const fo = mkf("orig", l.original, "original (coreano)");
    const fr = mkf("rom", l.romanization, "romanización");
    const fe = mkf("eng", l.english, "inglés");
    fo.onchange = () => l.original = fo.value;
    fr.onchange = () => l.romanization = fr.value;
    fe.onchange = () => l.english = fe.value;
    txt.append(fo, fr, fe);

    const chips = document.createElement("div"); chips.className = "chips";
    (song.members||[]).forEach(m => {
      const c = document.createElement("button");
      c.className = "chip"; c.style.setProperty("--c", m.color); c.textContent = abbr(m.name);
      c.title = m.name;
      if((l.members||[]).includes(m.name)) c.classList.add("on");
      c.onclick = () => { toggleMember(i, m.name); c.classList.toggle("on"); syncTodos(row, i); };
      chips.appendChild(c);
    });
    const todos = document.createElement("button");
    todos.className = "chip todos"; todos.textContent = "TODOS";
    if((l.members||[]).includes(song.group)) todos.classList.add("on");
    todos.onclick = () => { toggleTodos(i); renderRowChips(row, i); };
    chips.appendChild(todos);
    const ad = document.createElement("button");
    ad.className = "chip adlib"; ad.textContent = "AD";
    if(isAdlib(l)) ad.classList.add("on");
    ad.onclick = () => { l.adlib = isAdlib(l) ? false : true; ad.classList.toggle("on"); };
    chips.appendChild(ad);

    const times = document.createElement("div"); times.className = "times";
    if(mode.kind === "voice"){
      // VOZ: any number of [start,end] segments per line (voice can pause mid-line).
      times.classList.add("voice");
      const segs = document.createElement("span"); segs.className = "segs";
      segs.textContent = voiceLabel(l); segs.title = voiceTitle(l);
      const clr = document.createElement("button"); clr.textContent = "limpiar";
      clr.title = "borrar los trozos de voz de esta línea";
      clr.onclick = () => { l.voice = []; if(sel===i) awaitingEnd = false; updateVoiceCell(i); updateTapUI(); };
      times.append(segs, clr);
    } else {
      const f0 = mode.fields[0], f1 = mode.fields[1];
      const si = document.createElement("input"); si.className="start"; si.value = (+l[f0]||0).toFixed(2);
      si.onchange = () => l[f0] = parseFloat(si.value)||0;
      const sb = document.createElement("button"); sb.textContent="ini"; sb.title="inicio = tiempo actual";
      sb.onclick = () => { l[f0] = +video.currentTime.toFixed(2); si.value = (+l[f0]).toFixed(2); };
      const ei = document.createElement("input"); ei.className="end"; ei.value = (+l[f1]||0).toFixed(2);
      ei.onchange = () => l[f1] = parseFloat(ei.value)||0;
      const eb = document.createElement("button"); eb.textContent="fin"; eb.title="fin = tiempo actual";
      eb.onclick = () => { l[f1] = +video.currentTime.toFixed(2); ei.value = (+l[f1]).toFixed(2); };
      times.append(si, sb, ei, eb);
    }

    const rb = document.createElement("div"); rb.className="rowbtns";
    const ins = document.createElement("button"); ins.textContent="＋"; ins.title="insertar línea vacía debajo";
    ins.onclick = () => { song.lyrics.splice(i+1, 0, { start:0, end:0, members:[], original:"", romanization:"", english:"", adlib: mode.adlib }); sel = i+1; renderLines(); };
    const mg = document.createElement("button"); mg.textContent="unir ↓"; mg.title="juntar con la siguiente línea";
    mg.onclick = () => mergeDown(i);
    const del = document.createElement("button"); del.textContent="✕"; del.title="borrar línea";
    del.onclick = () => {
      if(!confirm("¿Borrar esta línea?\n\n" + (l.romanization || l.original || "(vacía)"))) return;
      song.lyrics.splice(i,1); if(sel>=song.lyrics.length) sel=song.lyrics.length-1; renderLines();
    };
    rb.append(ins, mg, del);

    row.append(num, txt, chips, times, rb);
    if(isAdlib(l) !== mode.adlib) row.classList.add("hide");   // hidden: not this pass (central vs ad-lib)
    return row;
  }

  function renderRowChips(row, i){
    // rebuild just this row (after todos toggle changes member set)
    const fresh = makeRow(song.lyrics[i], i);
    row.replaceWith(fresh);
    highlightSel();
  }
  function syncTodos(row, i){
    const l = song.lyrics[i];
    const todos = row.querySelector(".chip.todos");
    if(todos) todos.classList.toggle("on", (l.members||[]).includes(song.group));
  }

  function toggleMember(i, name){
    const l = song.lyrics[i]; l.members = l.members || [];
    const k = l.members.indexOf(name);
    if(k>=0) l.members.splice(k,1); else l.members.push(name);
  }
  function toggleTodos(i){
    const l = song.lyrics[i]; l.members = l.members || [];
    if(l.members.includes(song.group)) l.members = [];
    else l.members = [song.group];
  }
  function joinTxt(a,b){ a=(a||"").trim(); b=(b||"").trim(); if(!a) return b; if(!b) return a; return a.replace(/[,;·]\s*$/,"") + ", " + b; }
  function mergeDown(i){
    if(i+1 >= song.lyrics.length) return;
    const a = song.lyrics[i], b = song.lyrics[i+1];
    a.original = joinTxt(a.original,b.original);
    a.romanization = joinTxt(a.romanization,b.romanization);
    a.english = joinTxt(a.english,b.english);
    a.members = Array.from(new Set([...(a.members||[]), ...(b.members||[])]));
    if(+b.end) a.end = +b.end;
    song.lyrics.splice(i+1,1);
    renderLines();
  }

  function highlightSel(){
    [...listEl.children].forEach((r,idx)=> r.classList.toggle("sel", idx===sel));
    const r = listEl.children[sel];
    if(r) r.scrollIntoView({ block:"nearest" });
  }

  let lastActive = -1;
  function tick(){
    $("#clock").textContent = fmt(video.currentTime) + " / " + fmt(video.duration);
    let act = -1;
    for(let i=0;i<song.lyrics.length;i++){ const l=song.lyrics[i]; if(+l.end>+l.start && video.currentTime>=+l.start && video.currentTime<+l.end){ act=i; break; } }
    if(act!==lastActive){
      if(lastActive>=0 && listEl.children[lastActive]) listEl.children[lastActive].classList.remove("active");
      if(act>=0 && listEl.children[act]) listEl.children[act].classList.add("active");
      lastActive = act;
    }
    requestAnimationFrame(tick);
  }

  const isAdlibLine = l => isAdlib(l);
  function nextMatch(from){
    for(let i=from;i<song.lyrics.length;i++){ if(isAdlibLine(song.lyrics[i])===mode.adlib) return i; }
    return -1;
  }
  // Voice segments: label + tooltip + cell refresh.
  function voiceSegs(l){ return Array.isArray(l.voice) ? l.voice : []; }
  function voiceLabel(l){
    const v = voiceSegs(l);
    const done = v.filter(s => s.length===2 && isFinite(s[1]) && s[1] > s[0]);
    const total = done.reduce((a,s)=> a + (s[1]-s[0]), 0);
    const open = v.some(s => s.length===1);
    let txt = done.length ? (done.length + " seg · " + total.toFixed(2) + "s") : "sin voz";
    if(open) txt += " · ●REC";
    return txt;
  }
  function voiceTitle(l){
    const v = voiceSegs(l);
    if(!v.length) return "aún sin trozos de voz";
    return v.map(s => s.length===2 ? s[0].toFixed(2)+"–"+s[1].toFixed(2) : s[0].toFixed(2)+"–…").join("  ");
  }
  function updateVoiceCell(i){
    const r = listEl.children[i]; if(!r) return;
    const s = r.querySelector(".segs");
    if(s){ s.textContent = voiceLabel(song.lyrics[i]); s.title = voiceTitle(song.lyrics[i]); }
  }

  // S — LETRA: 1st=inicio, 2nd=fin (+avanza solo).
  //     VOZ: 1st=empieza trozo, 2nd=cierra trozo (repetible); avanzas con Enter.
  function tapS(){
    if(!song.lyrics.length) return;
    const l = song.lyrics[sel];
    if(!l || isAdlib(l) !== mode.adlib) return;   // selection must belong to the current pass
    const t = +video.currentTime.toFixed(2);
    if(mode.kind === "voice"){
      l.voice = voiceSegs(l);
      if(!awaitingEnd){
        l.voice.push([t]);            // open a new segment
        awaitingEnd = true;
      } else {
        const seg = l.voice[l.voice.length-1];
        if(seg && seg.length===1) seg[1] = Math.max(t, seg[0]);   // close it
        awaitingEnd = false;
      }
      updateVoiceCell(sel);
      updateTapUI();
      return;
    }
    if(!awaitingEnd){
      l[mode.fields[0]] = t;
      awaitingEnd = true;
      updateRowTimes(sel);
    } else {
      l[mode.fields[1]] = t;
      awaitingEnd = false;
      updateRowTimes(sel);
      const nx = nextMatch(sel+1);
      if(nx>=0){ sel=nx; highlightSel(); }
    }
    updateTapUI();
  }
  // Enter — VOZ only: close any open segment, then move to the next line.
  function tapEnter(){
    if(mode.kind !== "voice") return;
    const l = song.lyrics[sel];
    if(!l || isAdlib(l) !== mode.adlib) return;
    if(awaitingEnd){
      const seg = voiceSegs(l)[voiceSegs(l).length-1];
      if(seg && seg.length===1) seg[1] = Math.max(+video.currentTime.toFixed(2), seg[0]);
      awaitingEnd = false;
      updateVoiceCell(sel);
    }
    const nx = nextMatch(sel+1);
    if(nx>=0){ sel=nx; highlightSel(); }
    updateTapUI();
  }
  function updateTapUI(){
    const btn = document.querySelector("#markstart");
    if(btn){
      if(mode.kind === "voice")
        btn.textContent = awaitingEnd ? "⏹ Cerrar trozo (S) · Enter→siguiente" : "⏱ Empezar trozo de voz (S)";
      else
        btn.textContent = awaitingEnd ? "⏹ Marcar FIN de la línea (S)" : "⏱ Marcar INICIO de la línea (S)";
      btn.classList.toggle("rec", awaitingEnd);
    }
    [...listEl.children].forEach((r,idx)=> r.classList.toggle("rec", awaitingEnd && idx===sel));
  }
  function updateRowTimes(i){
    const r = listEl.children[i]; if(!r) return;
    const si = r.querySelector(".start"), ei = r.querySelector(".end");
    if(si) si.value = (+song.lyrics[i][mode.fields[0]]||0).toFixed(2);
    if(ei) ei.value = (+song.lyrics[i][mode.fields[1]]||0).toFixed(2);
  }

  async function save(){
    const res = await window.desktop.saveSong(songPath, song);
    const btn = $("#save");
    btn.textContent = res.ok ? "✓ Guardado" : "Error";
    setTimeout(()=>btn.textContent="Guardar", 1500);
  }

  // controls
  $("#back").onclick = ()=>{ location.href = "library.html"; };
  $("#save").onclick = save;
  $("#playpause").onclick = ()=>{ video.paused ? video.play() : video.pause(); };
  $("#back2").onclick = ()=> video.currentTime = Math.max(0, video.currentTime-2);
  $("#fwd2").onclick = ()=> video.currentTime += 2;
  $("#markstart").onclick = tapS;
  $("#addadlib").onclick = addAdlib;
  $("#mode").onchange = (e) => {
    mode = MODES[e.target.value] || MODES["lyric-central"];
    awaitingEnd = false;
    const nx = nextMatch(0); sel = nx >= 0 ? nx : -1;
    renderLines(); updateTapUI(); syncModeUI();
  };

  document.addEventListener("keydown", e => {
    if(e.target.tagName === "INPUT") return;  // don't hijack typing in time fields
    if(e.key==="s"||e.key==="S"){ e.preventDefault(); tapS(); }
    else if(e.key==="Enter"){ e.preventDefault(); tapEnter(); }
    else if(e.key==="k"||e.key==="K"){ e.preventDefault(); video.paused?video.play():video.pause(); }
    else if(e.key==="j"||e.key==="J"){ e.preventDefault(); video.currentTime=Math.max(0,video.currentTime-2); }
    else if(e.key==="l"||e.key==="L"){ e.preventDefault(); video.currentTime+=2; }
    else if(e.key==="ArrowDown"){ e.preventDefault(); if(sel<song.lyrics.length-1){sel++; awaitingEnd=false; highlightSel(); updateTapUI();} }
    else if(e.key==="ArrowUp"){ e.preventDefault(); if(sel>0){sel--; awaitingEnd=false; highlightSel(); updateTapUI();} }
    else if((e.ctrlKey||e.metaKey) && (e.key==="s")){ e.preventDefault(); save(); }
  });

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
