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
    // Keep the saved duration in step with the actual video (avoids a stale
    // JSON duration making the timeline/results length wrong).
    video.addEventListener("loadedmetadata", () => {
        if(isFinite(video.duration) && video.duration > 0) song.duration = video.duration;
    });
    $("#title").textContent = song.song || "";
    $("#grp").textContent = song.group || "";
    renderLines();
    updateTapUI();
    syncModeUI();
    buildWordPal();
    buildColors();
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
    const mkf = (cls, val, ph) => {
      const inp = document.createElement("input");
      inp.className = "f " + cls; inp.value = val || ""; inp.placeholder = ph;
      // Stop Chromium's autofill/suggestions dropdown from popping up and eating
      // keystrokes when a box is emptied and retyped.
      inp.autocomplete = "off"; inp.spellcheck = false;
      inp.setAttribute("autocorrect", "off"); inp.setAttribute("autocapitalize", "off");
      return inp;
    };
    const fo = mkf("orig", l.original, "original (coreano)");
    const fr = mkf("rom", l.romanization, "romanización");
    const fe = mkf("eng", l.english, "inglés");
    fo.oninput = () => l.original = fo.value;
    fr.oninput = () => l.romanization = fr.value;
    fe.oninput = () => l.english = fe.value;
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
    const btn = $("#save");
    btn.disabled = true; btn.textContent = "⏳ Guardando y subiendo…";
    const res = await window.desktop.saveSong(songPath, song);
    if(!res.ok){
      btn.textContent = "✕ Error al guardar";
    } else if(res.pushed){
      btn.textContent = res.committed ? "✓ Guardado y subido a GitHub" : "✓ Guardado (ya estaba al día)";
    } else {
      btn.textContent = "✓ Guardado en el PC (no se pudo subir)";
      btn.title = res.gitError ? ("git: " + res.gitError) : "";
      if(res.gitError) console.warn("git:", res.gitError);
    }
    btn.disabled = false;
    setTimeout(()=>btn.textContent="Guardar y subir", 2600);
  }

  // controls
  $("#back").onclick = ()=>{ location.href = "library.html"; };
  $("#save").onclick = save;
  $("#playpause").onclick = ()=>{ video.paused ? video.play() : video.pause(); };
  $("#back2").onclick = ()=> video.currentTime = Math.max(0, video.currentTime-2);
  $("#fwd2").onclick = ()=> video.currentTime += 2;
  $("#markstart").onclick = tapS;
  $("#addadlib").onclick = addAdlib;

  // --- Pegar letra en lote: original/roman/inglés -> una línea por renglón ---
  function openPaste(){
    $("#paOrig").value = ""; $("#paRom").value = ""; $("#paEng").value = "";
    $("#pastemodal").classList.add("show"); $("#paOrig").focus();
  }
  $("#pasteLyrics").onclick = openPaste;
  $("#paCancel").onclick = () => $("#pastemodal").classList.remove("show");
  $("#pastemodal").addEventListener("click", e => { if(e.target.id === "pastemodal") $("#pastemodal").classList.remove("show"); });
  $("#paGen").onclick = () => {
    // Quita los renglones vacíos de CADA columna por separado (así un salto de línea
    // de más en una no descuadra las demás), y luego empareja por posición.
    // Líneas "en bruto" (respetando blancos), quitando solo los blancos del final.
    const rawOf = id => { const a = $(id).value.replace(/\r/g, "").split("\n").map(s => s.trim());
      while(a.length && !a[a.length - 1]) a.pop(); return a; };
    const rawO = rawOf("#paOrig"), rawR = rawOf("#paRom"), rawE = rawOf("#paEng");
    const provO = rawO.some(Boolean), provR = rawR.some(Boolean), provE = rawE.some(Boolean);
    if(!provO && !provR && !provE){ alert("Pega al menos una línea de letra."); return; }
    // ¿Las columnas usadas tienen el MISMO nº de líneas (CONTANDO los blancos)?
    const rawCounts = [provO ? rawO.length : null, provR ? rawR.length : null, provE ? rawE.length : null].filter(x => x != null);
    const sameRaw = new Set(rawCounts).size === 1;
    let so, sr, se;
    if(sameRaw){
      // Emparejar por posición REAL: los renglones EN BLANCO sirven de alineación
      // (deja una línea vacía en una versión donde la otra tenga un "(ad-lib)").
      so = rawO; sr = rawR; se = rawE;
    } else {
      // Si no cuadran, quita blancos por columna y empareja por orden (+ aviso).
      so = rawO.filter(Boolean); sr = rawR.filter(Boolean); se = rawE.filter(Boolean);
      const counts = [so.length, sr.length, se.length].filter(x => x > 0);
      if(new Set(counts).size > 1){
        if(!confirm("⚠ Las columnas usadas tienen DISTINTO número de líneas:\n\n" +
          "· Original: " + so.length + "\n· Romanización: " + sr.length + "\n· Inglés: " + se.length + "\n\n" +
          "Para cuadrar: pon el MISMO número de líneas en cada columna, dejando una línea EN BLANCO " +
          "donde una versión no tenga texto (p. ej. un (ad-lib) en inglés que no está en coreano).\n\n¿Generar igualmente?")) return;
      }
    }
    const old = song.lyrics || [];
    const n = Math.max(so.length, sr.length, se.length, (provO && provR && provE) ? 0 : old.length);
    const rows = [];
    for(let i = 0; i < n; i++){
      // Partimos de la línea que ya existe (mantiene miembros, tiempos, voz, adlib…)
      const base = old[i] || { start:0, end:0, members:[], voice:undefined,
                               original:"", romanization:"", english:"", adlib:false };
      rows.push(Object.assign({}, base, {
        original:     provO ? (so[i] || "") : (base.original || ""),
        romanization: provR ? (sr[i] || "") : (base.romanization || ""),
        english:      provE ? (se[i] || "") : (base.english || "")
      }));
    }
    const cols = [provO ? "original" : null, provR ? "romanización" : null, provE ? "inglés" : null].filter(Boolean);
    const allThree = provO && provR && provE;
    const hasData = old.some(l => ("" + (l.original||"") + (l.romanization||"") + (l.english||"")).trim() || (l.members||[]).length);
    const msg = allThree
      ? ("Esto REEMPLAZA las " + old.length + " líneas actuales por " + rows.length + " líneas nuevas.\n\n¿Continuar?")
      : ("Se rellenará SOLO: " + cols.join(", ") + ".\nLas demás columnas y los miembros/tiempos por línea se MANTIENEN.\n\n¿Continuar?");
    if(hasData && !confirm(msg)) return;
    song.lyrics = rows; sel = 0; awaitingEnd = false;
    $("#pastemodal").classList.remove("show");
    renderLines(); updateTapUI();
  };

  // --- Elegir el vídeo (MV) desde el PC: se copia, se pone en el reproductor y se guarda ---
  $("#pickvideo").onclick = async () => {
    const btn = $("#pickvideo"); const t = btn.textContent;
    btn.disabled = true; btn.textContent = "⏳ Copiando y subiendo vídeo…";
    const res = await window.desktop.pickVideo({ group: song.group, song: song.song });
    btn.disabled = false;
    if(res && res.canceled){ btn.textContent = t; return; }
    if(res && res.ok){
      song.video = res.video;
      video.src = song.video; video.load();            // se ve al instante en el editor
      btn.textContent = res.pushed ? "✓ Vídeo puesto" : "✓ Vídeo (local, no subido)";
      save();                                           // guarda el JSON con el nuevo vídeo
    } else {
      btn.textContent = "✕ Error";
      if(res && res.error) console.warn(res.error);
    }
    setTimeout(() => btn.textContent = t, 2800);
  };

  // Per-word colour marking. Select a word in a lyric box, then:
  //   🌈  -> the whole group sings it (**word**)
  //   a member palette button -> that member sings it (**word@Name**); click more
  //   members to stack them (**word@A,B**); click the same one again to remove it.
  const flashMark = (btn, msg) => { const t = btn.textContent; btn.textContent = msg; setTimeout(()=>btn.textContent = t, 1400); };
  function markSel(kind, btn){                                  // kind: "group" or a member name
    const el = document.activeElement;
    if(!el || !(el.classList && el.classList.contains("f"))){ flashMark(btn, "Selecciona texto"); return; }
    let s = el.selectionStart, e = el.selectionEnd, v = el.value;
    if(s == null || s === e){ flashMark(btn, "Marca la palabra"); return; }
    let before = v.slice(0, s), chunk = v.slice(s, e), after = v.slice(e);
    if(before.endsWith("**") && after.startsWith("**")){ before = before.slice(0, -2); after = after.slice(2); chunk = "**" + chunk + "**"; }
    let inner = chunk, members = [], wasWrapped = false, wasGroup = false;
    const m = chunk.match(/^\*\*([\s\S]*)\*\*$/);
    if(m){
      wasWrapped = true; inner = m[1];
      const at = inner.lastIndexOf("@");
      if(at > 0){
        const names = inner.slice(at + 1).split(",").map(x => x.trim()).filter(Boolean);
        const resolved = names.map(n => (song.members || []).find(mm => mm.name.toLowerCase() === n.toLowerCase()));
        if(names.length && resolved.every(Boolean)){ members = resolved.map(mm => mm.name); inner = inner.slice(0, at); }
        else wasGroup = true;
      } else wasGroup = true;
    }
    let newChunk;
    if(kind === "group"){
      newChunk = (wasWrapped && wasGroup) ? inner : ("**" + inner + "**");   // toggle group
    } else {
      const i = members.findIndex(n => n.toLowerCase() === kind.toLowerCase());
      if(i >= 0) members.splice(i, 1); else members.push(kind);
      newChunk = members.length ? ("**" + inner + "@" + members.join(",") + "**") : inner;
    }
    el.value = before + newChunk + after;
    el.dispatchEvent(new Event("input", { bubbles: true }));    // -> oninput saves to the model
    el.focus(); try{ el.setSelectionRange(before.length, before.length + newChunk.length); }catch(err){}
  }
  const markGroupBtn = $("#markgroup");
  if(markGroupBtn){
    markGroupBtn.addEventListener("mousedown", e => e.preventDefault());   // keep the field's selection alive
    markGroupBtn.addEventListener("click", () => markSel("group", markGroupBtn));
  }
  function buildWordPal(){
    const pal = $("#wordpal"); if(!pal) return;
    pal.innerHTML = "";
    (song.members || []).forEach(mm => {
      const b = document.createElement("button");
      b.textContent = abbr(mm.name); b.title = "Marcar la palabra seleccionada como " + mm.name;
      b.style.setProperty("--c", mm.color);
      b.addEventListener("mousedown", e => e.preventDefault());
      b.addEventListener("click", () => markSel(mm.name, b));
      pal.appendChild(b);
    });
  }

  // Cambiar el color de cada miembro (útil sobre todo para grupos nuevos).
  function toHex(c){ return /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#7c5cff"; }
  function slugParts(){ const p = String(songPath).replace(/\\/g,"/").split("/");
    return { g: p[p.length-2] || "grupo", s: (p[p.length-1] || "cancion").replace(/\.json$/i,"") }; }

  function removeMember(name){
    if(!confirm("¿Quitar a " + name + " de esta canción?\n(no afecta a otras canciones)")) return;
    song.members = (song.members || []).filter(m => m.name !== name);
    (song.lyrics || []).forEach(l => {
      if(Array.isArray(l.members)) l.members = l.members.filter(n => n !== name);
      if(Array.isArray(l.voice)) l.voice.forEach(seg => { if(seg && seg[2] != null){
        if(Array.isArray(seg[2])) seg[2] = seg[2].filter(n => n !== name);
        else if(seg[2] === name) seg[2] = undefined; } });
    });
    renderLines(); buildWordPal(); buildColors();
  }

  function addMember(preset){
    const name = (preset.name || "").trim(); if(!name) return;
    if((song.members || []).some(m => m.name.toLowerCase() === name.toLowerCase())){ alert("Ese miembro ya está en la canción."); return; }
    const { g, s } = slugParts();
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    song.members = song.members || [];
    song.members.push({ name, image: "images/" + g + "/" + s + "/" + base + ".png",
      color: preset.color || "#7c5cff", focus: preset.focus != null ? preset.focus : 50, lift: preset.lift != null ? preset.lift : 3 });
    renderLines(); buildWordPal(); buildColors();
  }

  async function openAddMenu(anchor){
    document.querySelectorAll(".addmenu").forEach(e => e.remove());
    let presets = [];
    try{ const r = await window.desktop.groupMembers(songPath); if(r && r.members) presets = r.members; }catch(e){}
    const have = new Set((song.members || []).map(m => m.name.toLowerCase()));
    presets = presets.filter(p => !have.has(p.name.toLowerCase()));
    const menu = document.createElement("div"); menu.className = "addmenu";
    presets.forEach(p => {
      const b = document.createElement("button"); b.type = "button"; b.className = "ami";
      b.innerHTML = '<span class="cdot" style="background:' + toHex(p.color) + '"></span>' + p.name;
      b.title = "añadir " + p.name + " (con su color guardado)";
      b.onclick = () => { addMember(p); menu.remove(); };
      menu.appendChild(b);
    });
    if(!presets.length){ const e = document.createElement("div"); e.className = "amempty"; e.textContent = "(sin presets del grupo)"; menu.appendChild(e); }
    const nu = document.createElement("button"); nu.type = "button"; nu.className = "ami new"; nu.textContent = "➕ Nuevo miembro…";
    nu.onclick = () => { const n = prompt("Nombre del nuevo miembro:"); if(n && n.trim()) addMember({ name: n.trim().toUpperCase() }); menu.remove(); };
    menu.appendChild(nu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = r.left + "px"; menu.style.bottom = (window.innerHeight - r.top + 6) + "px";
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener("click", function h(ev){
      if(!menu.contains(ev.target) && ev.target !== anchor){ menu.remove(); document.removeEventListener("click", h); } }), 0);
  }

  function buildColors(){
    const row = $("#colorsRow"); if(!row) return;
    row.querySelectorAll(".mcol, .addmem").forEach(e => e.remove());
    (song.members || []).forEach(m => {
      const w = document.createElement("span"); w.className = "mcol";
      const inp = document.createElement("input"); inp.type = "color"; inp.value = toHex(m.color);
      inp.oninput = () => { m.color = inp.value; renderLines(); buildWordPal(); };
      const nm = document.createElement("span"); nm.textContent = abbr(m.name); nm.title = m.name;
      const x = document.createElement("button"); x.type = "button"; x.className = "mx"; x.textContent = "✕"; x.title = "quitar " + m.name;
      x.onclick = () => removeMember(m.name);
      w.append(inp, nm, x); row.appendChild(w);
    });
    const add = document.createElement("button"); add.type = "button"; add.className = "addmem"; add.textContent = "➕ miembro";
    add.title = "añadir miembro (recupera el preajuste si ya existió)";
    add.onclick = () => openAddMenu(add);
    row.appendChild(add);
  }
  $("#mode").onchange = (e) => {
    mode = MODES[e.target.value] || MODES["lyric-central"];
    awaitingEnd = false;
    const nx = nextMatch(0); sel = nx >= 0 ? nx : -1;
    renderLines(); updateTapUI(); syncModeUI();
  };

  // Never hijack keys while typing in ANY editable field, nor mid-IME-composition.
  // (Checks both the event target AND the real focused element, and covers
  // input/textarea/select/contenteditable — not just <input> — so emptying a
  // lyric box and continuing to type is never blocked by the S/K/J/L shortcuts.)
  const isEditable = el => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
  document.addEventListener("keydown", e => {
    if(isEditable(e.target) || isEditable(document.activeElement) || e.isComposing || e.keyCode === 229) return;
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
