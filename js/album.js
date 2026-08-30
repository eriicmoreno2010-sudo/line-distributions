/* =========================================================
   ALBUM DISTRIBUTION — suma los segundos de todas las canciones
   de un álbum y lo presenta en varias diapositivas (grabable).
   ========================================================= */
(function(){
  const $ = s => document.querySelector(s);
  const desktop = (window.desktop && window.desktop.isDesktop) ? window.desktop : null;

  const stage = $("#stage"), pfill = $("#pfill"), slidelbl = $("#slidelbl");
  const TAU = Math.PI * 2;

  // paleta para las canciones (barra apilada + leyenda)
  const SONG_COLORS = ["#ff4d6d","#4dabf7","#ffa94d","#cc5de8","#20c997","#ffd43b",
                       "#748ffc","#f783ac","#69db7c","#e8590c","#22b8cf","#9775fa"];

  const fmt = t => { t = Math.max(0, t||0); const m=Math.floor(t/60), s=Math.floor(t%60); return m+":"+String(s).padStart(2,"0"); };
  const fmtS = t => (Math.round((t||0)*100)/100).toFixed(2) + "s";
  const ord = n => { const s=["th","st","nd","rd"], v=n%100; return n + (s[(v-20)%10] || s[v] || s[0]); };
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  // ---- quién canta cuánto (mismo cálculo que el ranking/donut) ----
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
  const totalSec = iv => iv.reduce((x,g)=> x + (g[1]-g[0]), 0);

  async function loadJSON(path){
    try{
      if(desktop){ const r = await desktop.loadSong(path); return r && r.ok ? r.data : null; }
      return await fetch(path).then(r => r.json());
    }catch(e){ return null; }
  }

  // ===================== agregación del álbum (COMPLETA) =====================
  // Suma TODAS las canciones y TODOS los miembros. per/ranks van indexados por el
  // índice ORIGINAL de la canción (orig) para poder derivar versiones fácilmente.
  function aggregate(album, songDatas){
    const roster = {};       // name -> {name,color,image,total,per{orig},ranks{orig},rankCount{}}
    const songs = [];        // {orig,title,color,secs{},ranked[],dur,audio,...}
    const byOrig = {};       // orig -> song
    const order = [];        // orden de aparición de miembros

    songDatas.forEach((sd, orig) => {
      if(!sd) return;
      const map = buildIntervals(sd);
      const secs = {};
      (sd.members||[]).forEach(m => {
        if(!roster[m.name]){
          roster[m.name] = { name:m.name, color:m.color||"#888", image:m.image||"",
                             total:0, per:{}, ranks:{}, rankCount:{} };
          order.push(m.name);
        }
        const R = roster[m.name];
        if((!R.color || R.color==="#888") && m.color) R.color = m.color;
        if(!R.image && m.image) R.image = m.image;
        const sec = totalSec(map[m.name] || []);
        secs[m.name] = sec; R.per[orig] = sec; R.total += sec;
      });
      const ranked = (sd.members||[]).map(m => m.name)
        .sort((a,b) => (secs[b]||0) - (secs[a]||0));
      ranked.forEach((nm, r) => {
        roster[nm].ranks[orig] = r + 1;
        roster[nm].rankCount[r+1] = (roster[nm].rankCount[r+1]||0) + 1;
      });
      const s = { orig, title: sd.song || ("Canción " + (orig+1)),
                  color: (album.songColors && album.songColors[orig]) || SONG_COLORS[orig % SONG_COLORS.length],
                  secs, ranked, dur: sd.duration || 0,
                  audio: sd.audio || "", instrumental: sd.instrumental || "",
                  clipStart: +sd.instrumentalStart || 0, clipEnd: +sd.instrumentalEnd || 0 };
      songs.push(s); byOrig[orig] = s;
    });

    const members = order.map(n => roster[n]);
    // por miembro: canción donde más y donde menos cantó (entre las que aparece)
    members.forEach(m => {
      const entries = Object.keys(m.per).map(k => [+k, m.per[k]]);
      if(entries.length){
        entries.sort((a,b) => b[1]-a[1]);
        m.topSong = byOrig[entries[0][0]]; m.topSec = entries[0][1];
        m.lowSong = byOrig[entries[entries.length-1][0]]; m.lowSec = entries[entries.length-1][1];
      }
      m.pct = 0;
    });
    const grand = members.reduce((a,m)=>a+m.total, 0) || 1;
    members.forEach(m => m.pct = m.total/grand*100);

    let H = 0; members.forEach(m => { const p = m.total/grand; if(p>0) H -= p*Math.log(p); });
    const Hmax = Math.log(members.length || 1);
    const evenness = Hmax > 0 ? H/Hmax : 1;

    const maxRank = songs.reduce((mx,s)=> Math.max(mx, s.ranked.length), 0);
    return { album, members, songs, grand, evenness, maxRank, byOrig };
  }

  // ===================== vista de una versión =====================
  // Deriva de la agregación completa una versión filtrada por canciones/miembros
  // SIN cambiar los segundos absolutos: solo cambia qué se muestra y las escalas
  // (evenness, %, albumMax). v.memberSet / v.songSet = Set (o null = todos).
  function versionView(A, v){
    const memOK  = n => !v.memberSet || v.memberSet.has(n);
    const songOK = o => !v.songSet   || v.songSet.has(o);
    const songs = A.songs.filter(s => songOK(s.orig));
    const members = A.members.filter(m => memOK(m.name)).map(m => {
      let total = 0; const per = {};
      songs.forEach(s => { const x = m.per[s.orig] || 0; per[s.orig] = x; total += x; });
      return { name:m.name, color:m.color, image:m.image, per, total, base:m };
    });
    const grand = members.reduce((a,m)=>a+m.total, 0) || 1;
    members.forEach(m => m.pct = m.total/grand*100);
    let H = 0; members.forEach(m => { const p = m.total/grand; if(p>0) H -= p*Math.log(p); });
    const Hmax = Math.log(members.length || 1);
    const evenness = Hmax > 0 ? H/Hmax : 1;
    const albumMax = Math.max(1, ...members.map(m => m.total));
    return { name:v.name, members, songs, grand, evenness, albumMax };
  }

  function evenLabel(e){
    if(e >= 0.93) return "Very even";
    if(e >= 0.85) return "Balanced";
    if(e >= 0.72) return "Slightly uneven";
    return "Uneven";
  }

  // ===================== construir diapositivas =====================
  function makeSlide(kind, extraClass){
    const el = document.createElement("section");
    el.className = "slide " + (extraClass || "");
    el.dataset.kind = kind;
    stage.appendChild(el);
    return el;
  }

  function buildSlides(albumData, songDatas){
    const slides = [];
    const albumHead = (albumData.group ? esc(albumData.group) + " — " : "") + esc(albumData.album);
    const A = aggregate(albumData, songDatas);       // COMPLETA: bump, nº de veces, average, most/less, portada
    const easeOut = p => 1 - Math.pow(1-p, 3);

    // Versiones (p.ej. OT7 / OT5, con/sin una canción) — SOLO afectan al race y al donut,
    // que se muestran de una versión y transicionan fluidamente a la siguiente.
    // La versión COMPLETA (todos) es automática y sale SIEMPRE la primera; en el editor
    // solo se definen las versiones REDUCIDAS (p. ej. OT5, o sin una canción). Sin
    // versiones reducidas -> una sola diapositiva completa sin badge.
    const rawV = (albumData.versions && albumData.versions.length) ? albumData.versions : null;
    let versions;
    if(rawV){
      const baseV = versionView(A, { name: albumData.baseName || "", memberSet:null, songSet:null });
      const variants = rawV.map(v => versionView(A, {
        name: v.name || "",
        memberSet: (v.members && v.members.length) ? new Set(v.members) : null,
        songSet:   (v.songs   && v.songs.length)   ? new Set(v.songs)   : null
      }));
      versions = [ baseV, ...variants ];
      // Con varias versiones, TODAS deben verse (badge). Si alguna no tiene nombre, se le
      // pone uno por defecto para que la reducida no pase desapercibida.
      versions.forEach((v, i) => { if(!v.name) v.name = (i === 0) ? "Completa" : (versions.length === 2 ? "Reducida" : ("Versión " + (i+1))); });
    } else {
      versions = [ versionView(A, { name:"", memberSet:null, songSet:null }) ];
    }
    const multi = versions.length > 1;
    const verBadgeHTML = name => `<div class="ver-badge"${name ? "" : ' style="display:none"'}>${esc(name||"")}</div>`;

    // ---------- 1) PORTADA (versión completa) ----------
    {
      const el = makeSlide("cover", "cover-slide");
      const art = A.album.cover
        ? `<img class="cover-art" src="${esc(A.album.cover)}" alt="">`
        : `<div class="cover-art cover-noart">💿</div>`;
      const songs = A.songs.map((s,i) =>
        `<div class="sg"><span class="n" style="background:${s.color}">${i+1}</span><span class="sgt">${esc(s.title)}</span></div>`).join("");
      el.innerHTML = `
        <div class="cover-glow"></div>
        <div class="cover-art-wrap">${art}</div>
        <div class="cover-info">
          <div class="tag">ALBUM DISTRIBUTION</div>
          <div class="grp">${esc(A.album.group)}</div>
          <div class="alb">${esc(A.album.album)}</div>
          <div class="songlist">${songs}</div>
        </div>`;
      slides.push({ el, dur:7 });
    }

    // ---------- Race y Donut: UNA diapositiva que recorre las versiones con transición ----------
    raceSlide(versions);
    donutSlide(versions);
    // ---------- Bump y Nº de veces: UNA sola (versión completa) ----------
    bumpSlide(A);
    placesSlides(A);

    // ---------- AVERAGE (versión completa) ----------
    {
      const el = makeSlide("avg", "avg-slide");
      const nS = A.songs.length || 1;
      const avg = [...A.members].map(m => ({ m, a: m.total / nS })).sort((x,y) => y.a - x.a);
      el.innerHTML = `
        <div class="slide-title">Average lines per song</div>
        <div class="slide-sub song-sub">${albumHead}</div>
        <div class="avg-rows">${avg.map((r,i) => `
          <div class="avg-row" style="--accent:${r.m.color}">
            <div class="rk">${i+1}</div>
            <img class="ph" src="${esc(r.m.image)}" alt="">
            <div class="nm">${esc(r.m.name)}</div>
            <div class="sec">${fmtS(r.a)}</div>
          </div>`).join("")}
        </div>`;
      slides.push({ el, dur:7 });
    }

    // ---------- MOST LINES / LESS LINES (versión completa) ----------
    {
      const el = makeSlide("mostless", "mostless-slide");
      const most = [...A.members].filter(m=>m.topSong).sort((a,b)=> b.topSec - a.topSec);
      const less = [...A.members].filter(m=>m.lowSong).sort((a,b)=> a.lowSec - b.lowSec);
      const rowH = (m, song, sec) => `
        <div class="ml-row" style="--accent:${m.color}">
          <img class="ph" src="${esc(m.image)}" alt="">
          <div class="who"><div class="nm">${esc(m.name)}</div><div class="sg">${esc(song ? song.title : "—")}</div></div>
          <div class="sec">${fmtS(sec)}</div>
        </div>`;
      el.innerHTML = `
        <div class="ml-cols">
          <div class="ml-col most"><div class="ml-head">MOST LINES</div>${most.map(m => rowH(m, m.topSong, m.topSec)).join("")}</div>
          <div class="ml-col less"><div class="ml-head">LESS LINES</div>${less.map(m => rowH(m, m.lowSong, m.lowSec)).join("")}</div>
        </div>`;
      slides.push({ el, dur:8 });
    }

    return slides;

    // ============ funciones de diapositivas ============
    // RACE (una sola diapositiva): reproduce la 1ª versión canción a canción y,
    // al acabar, transiciona fluidamente a cada versión siguiente (los miembros/canciones
    // que salen se van con la misma animación del race; el resto se reordena y reescala).
    function raceSlide(vers){
      const el = makeSlide("total", "race-slide");
      const master = A.members;                        // unión: TODAS las filas posibles
      const songColorOf = orig => (A.byOrig[orig] && A.byOrig[orig].color) || SONG_COLORS[orig % SONG_COLORS.length];
      const memColor = {}; master.forEach(m => memColor[m.name] = m.color);
      const raceCol = A.album.raceColor || "#ffffff";  // color único de nombres+aros de la derecha
      const MORPH_DWELL = 5200;                         // ms que se mantiene cada versión tras la transición

      el.innerHTML = `
        ${verBadgeHTML(vers[0].name)}
        <div class="ts-cols">
          <div class="ts-card">
            <div class="ts-tag song-tag"></div>
            <div class="ts-rows" data-side="song"></div>
          </div>
          <div class="ts-card">
            <div class="ts-tag">${albumHead}</div>
            <div class="ts-tag2">ALBUM DISTRIBUTION</div>
            <div class="ts-rows" data-side="total"></div>
          </div>
        </div>`;
      const songRowsEl = el.querySelector('[data-side="song"]');
      const totRowsEl  = el.querySelector('[data-side="total"]');
      const tagEl  = el.querySelector(".song-tag");
      const badgeEl = el.querySelector(".ver-badge");

      // filas para TODOS los miembros; el total lleva un segmento por CADA canción (por orig).
      const songMap = {}, totMap = {};
      master.forEach(m => {
        const s = document.createElement("div");
        s.className = "ts-row"; s.style.setProperty("--accent", memColor[m.name]);
        s.innerHTML = `<img class="ph" src="${esc(m.image)}" alt=""><div class="mid"><div class="nm">${esc(m.name)}</div>
          <div class="bar"><div class="fill"></div></div></div><div class="sec">0.00s</div>`;
        songRowsEl.appendChild(s);
        songMap[m.name] = { row:s, fill:s.querySelector(".fill"), sec:s.querySelector(".sec") };

        const t = document.createElement("div");
        t.className = "ts-row"; t.style.setProperty("--accent", raceCol);
        const segs = A.songs.map(s2 => `<div class="seg" data-orig="${s2.orig}" style="width:0;background:${songColorOf(s2.orig)}"></div>`).join("");
        t.innerHTML = `<img class="ph" src="${esc(m.image)}" alt=""><div class="mid"><div class="nm">${esc(m.name)}</div>
          <div class="bar stack">${segs}<div class="divlines"></div></div></div><div class="sec">0.00s</div>`;
        totRowsEl.appendChild(t);
        const segByOrig = {}; [...t.querySelectorAll(".seg")].forEach(sg => segByOrig[+sg.dataset.orig] = sg);
        totMap[m.name] = { row:t, seg:segByOrig, lines:t.querySelector(".divlines"), sec:t.querySelector(".sec") };
      });

      const positions = (container, map, names) => {
        const N = names.length || 1, H = container.clientHeight || 1, rowH = H / N;
        names.forEach((name, idx) => { const r = map[name]; if(!r) return;
          r.row.style.height = rowH + "px";
          r.row.style.transform = `translateY(${(idx*rowH).toFixed(1)}px)`; });
      };
      const tweenNum = (elm, from, to, dur, gen) => {
        const t0 = performance.now();
        const loop = now => { if(el._gen !== gen) return; let p=(now-t0)/dur; if(p>1)p=1;
          elm.textContent = (from + (to-from)*easeOut(p)).toFixed(2) + "s";
          if(p<1) requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      };
      const setBadge = name => { if(!badgeEl) return;
        if(name){ badgeEl.textContent = name; badgeEl.style.display = ""; } else badgeEl.style.display = "none"; };

      // ---- audio por canción (trozo elegido, con fundido) ----
      const FADE = 1.6, DEF_CLIP = 9, GAP = 0.8;
      const clipOf = song => {
        const ac = (A.album.clips && A.album.clips[song.orig]) || {};
        const src = ac.audio || song.audio || song.instrumental || "";
        let a = (ac.start != null ? ac.start : song.clipStart) || 0;
        let b = (ac.end != null ? ac.end : song.clipEnd) || 0;
        if(!(b > a)) b = a + DEF_CLIP;
        b = Math.min(b, a + 20);
        return { src, a, b, len: b - a };
      };
      const playClip = (song, gen) => {
        const c = clipOf(song); if(!c.src) return;
        const au = new Audio(c.src); au.preload = "auto"; au.volume = 0;
        try{ au.currentTime = c.a; }catch(e){}
        el._audios.push(au);
        au.play().catch(()=>{});
        const loop = () => {
          if(el._gen !== gen){ try{ au.pause(); }catch(e){} return; }
          const ct = au.currentTime;
          if(ct >= c.b){ try{ au.pause(); }catch(e){} return; }
          const inn = ct - c.a, out = c.b - ct;
          au.volume = Math.max(0, Math.min(1, inn < FADE ? inn/FADE : (out < FADE ? out/FADE : 1)));
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      };

      el._gen = 0; el._timers = []; el._audios = [];
      const clearTimers = () => { el._timers.forEach(clearTimeout); el._timers = []; };
      const stopAudios = () => { el._audios.forEach(a => { try{ a.pause(); }catch(e){} }); el._audios = []; };

      const V0 = vers[0];
      const prevTot = {}; master.forEach(m => prevTot[m.name] = 0);

      // Transición fluida a la versión V: oculta ausentes, reordena, reescala y tuenea números.
      const morph = (V, gen) => {
        if(el._gen !== gen) return;
        const activeNames = new Set(V.members.map(m => m.name));
        master.forEach(m => { if(!activeNames.has(m.name)){
          totMap[m.name].row.style.opacity = "0"; totMap[m.name].row.style.height = "0px"; } });
        const sorted = [...V.members].sort((a,b)=> b.total - a.total);
        const N = sorted.length, H = totRowsEl.clientHeight || 1, rowH = H / N;
        const songSet = new Set(V.songs.map(s => s.orig));
        sorted.forEach((m, idx) => {
          const t = totMap[m.name];
          t.row.style.opacity = "1"; t.row.style.height = rowH + "px";
          t.row.style.transform = `translateY(${(idx*rowH).toFixed(1)}px)`;
          A.songs.forEach(s => { const w = songSet.has(s.orig) ? ((m.per[s.orig]||0)/V.albumMax*100) : 0;
            t.seg[s.orig].style.width = w + "%"; });
          let cum = 0, h = "";
          for(let k=0; k<V.songs.length-1; k++){ cum += m.per[V.songs[k].orig]||0;
            h += `<div class="divline" style="left:${(cum/V.albumMax*100)}%"></div>`; }
          t.lines.innerHTML = h;
          tweenNum(t.sec, prevTot[m.name], m.total, 1400, gen); prevTot[m.name] = m.total;
        });
        setBadge(V.name);
      };

      const enter = () => {
        el._gen++; const gen = el._gen; clearTimers(); stopAudios();
        setBadge(V0.name);
        const v0names = new Set(V0.members.map(m => m.name));
        el.querySelectorAll(".ts-row").forEach(r => r.classList.add("no-anim"));
        master.forEach(m => { const vis = v0names.has(m.name);
          totMap[m.name].row.style.opacity  = vis ? "1" : "0";
          songMap[m.name].row.style.opacity = vis ? "1" : "0"; });
        const song0 = V0.songs[0];
        const names0 = V0.members.map(m => ({ name:m.name, sec: song0 ? (m.per[song0.orig]||0) : 0 }))
                          .sort((a,b)=> b.sec - a.sec).map(x => x.name);
        positions(songRowsEl, songMap, names0);
        positions(totRowsEl,  totMap,  names0);
        master.forEach(m => { songMap[m.name].fill.style.width = "0"; songMap[m.name].sec.textContent = "0.00s";
          A.songs.forEach(s => totMap[m.name].seg[s.orig].style.width = "0");
          totMap[m.name].lines.innerHTML = ""; totMap[m.name].sec.textContent = "0.00s"; });
        void el.offsetWidth;
        el.querySelectorAll(".ts-row").forEach(r => r.classList.remove("no-anim"));

        const STAGGER = 1600;
        const cumAtV0 = (m, k) => { let x=0; for(let j=0;j<=k;j++) x += m.per[V0.songs[j].orig]||0; return x; };
        let prevSong = {}; V0.members.forEach(m => prevSong[m.name] = 0);
        let t = 0;
        for(let si = 0; si < V0.songs.length; si++){
          const song = V0.songs[si];
          const dwell = Math.max(6, (clipOf(song).len || DEF_CLIP) + GAP) * 1000;
          const start = t;
          el._timers.push(setTimeout(() => { if(el._gen === gen) playClip(song, gen); }, start));
          // izquierda: ranking de la canción (el 1º siempre lleno)
          el._timers.push(setTimeout(() => {
            if(el._gen !== gen) return;
            tagEl.textContent = (si+1) + ". " + song.title;
            tagEl.style.color = songColorOf(song.orig);
            const names = V0.members.map(m => ({ name:m.name, sec:m.per[song.orig]||0 })).sort((a,b)=> b.sec-a.sec).map(x=>x.name);
            positions(songRowsEl, songMap, names);
            const top = Math.max(1, ...V0.members.map(m => m.per[song.orig]||0));
            const col = songColorOf(song.orig);
            V0.members.forEach(m => {
              const v = m.per[song.orig] || 0;
              songMap[m.name].row.style.setProperty("--accent", col);
              songMap[m.name].fill.style.width = (v/top*100) + "%";
              tweenNum(songMap[m.name].sec, prevSong[m.name], v, 1400, gen);
              prevSong[m.name] = v;
            });
          }, start));
          // derecha: total acumulado (se reordena) + líneas de canciones
          el._timers.push(setTimeout(() => {
            if(el._gen !== gen) return;
            const names = V0.members.map(m => ({ name:m.name, sec:cumAtV0(m,si) })).sort((a,b)=> b.sec-a.sec).map(x=>x.name);
            positions(totRowsEl, totMap, names);
            V0.members.forEach(m => {
              totMap[m.name].seg[song.orig].style.width = ((m.per[song.orig]||0)/V0.albumMax*100) + "%";
              let cum = 0, h = "";
              for(let k=0; k<si; k++){ cum += m.per[V0.songs[k].orig]||0; h += `<div class="divline" style="left:${(cum/V0.albumMax*100)}%"></div>`; }
              totMap[m.name].lines.innerHTML = h;
              const from = si>0 ? cumAtV0(m,si-1) : 0, to = cumAtV0(m,si);
              tweenNum(totMap[m.name].sec, from, to, 1600, gen); prevTot[m.name] = to;
            });
          }, start + STAGGER));
          t += dwell;
        }
        // transiciones a las versiones siguientes (fluidas)
        for(let k=1; k<vers.length; k++){
          const V = vers[k];
          const at = t + (k-1)*MORPH_DWELL + 500;
          el._timers.push(setTimeout(() => morph(V, gen), at));
        }
        el._raceTotal = t + Math.max(0, vers.length-1)*MORPH_DWELL;
      };
      const reset = () => { el._gen++; clearTimers(); stopAudios();
        master.forEach(m => { songMap[m.name].fill.style.width = "0";
          A.songs.forEach(s => totMap[m.name].seg[s.orig].style.width = "0"); totMap[m.name].lines.innerHTML = ""; }); };
      // duración estimada: dwells de la 1ª versión + una espera por cada versión extra
      let est = 0; for(let si=0; si<V0.songs.length; si++) est += Math.max(6, (clipOf(V0.songs[si]).len||DEF_CLIP)+GAP);
      est += Math.max(0, vers.length-1) * (MORPH_DWELL/1000);
      slides.push({ el, dur: est + 3, enter, reset });
    }

    // ---------- 3) DONUT + evenness (una sola diapositiva, transiciona entre versiones) ----------
    function donutSlide(vers){
      const el = makeSlide("donut", "donut-slide");
      const CX=250, CY=250, R=246, ri=120;
      const P = (rad,a)=>[(CX+rad*Math.sin(a)).toFixed(2),(CY-rad*Math.cos(a)).toFixed(2)];
      const ring = (a0,a1)=>{ const large=(a1-a0)>Math.PI?1:0;
        const[x0o,y0o]=P(R,a0),[x1o,y1o]=P(R,a1),[x1i,y1i]=P(ri,a1),[x0i,y0i]=P(ri,a0);
        return `M ${x0o} ${y0o} A ${R} ${R} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${ri} ${ri} 0 ${large} 0 ${x0i} ${y0i} Z`; };
      // orden fijo (unión, por total completo) para que los arcos no salten entre versiones
      const order = [...A.members].sort((a,b)=> b.total - a.total).map(m => m.name);
      const colorByName = {}; A.members.forEach(m => colorByName[m.name] = m.color);

      el.innerHTML = `
        ${verBadgeHTML(vers[0].name)}
        <div class="slide-title">Album distribution</div>
        <div class="slide-sub">Total seconds per member</div>
        <div class="donut-wrap">
          <div class="donut-holder" style="position:relative"><svg viewBox="0 0 500 500"></svg></div>
          <div class="donut-legend"></div>
        </div>
        <div class="even-corner">
          <div class="ec-lbl">Evenness</div>
          <div class="ec-box">0.00%</div>
        </div>`;
      const svg = el.querySelector("svg"), legendEl = el.querySelector(".donut-legend"),
            ecBox = el.querySelector(".ec-box"), badgeEl = el.querySelector(".ver-badge");
      const legRows = {};
      order.forEach(name => { const r = document.createElement("div"); r.className = "li";
        r.innerHTML = `<span class="dot" style="background:${colorByName[name]}"></span>${esc(name)} <span class="v"></span>`;
        legendEl.appendChild(r); legRows[name] = { row:r, v:r.querySelector(".v") }; });

      const stateOf = V => { const byName = {}; V.members.forEach(m => byName[m.name] = m);
        return { name:V.name, evenness:V.evenness,
          items: order.map(name => { const m = byName[name];
            return { name, color:colorByName[name], frac: m ? (m.total/V.grand) : 0,
                     pct: m ? m.pct : 0, total: m ? m.total : 0 }; }) }; };

      const draw = st => {
        let cum = 0, paths = "";
        st.items.forEach(it => { if(it.frac > 0){ const a0 = cum*TAU, a1 = (cum + Math.min(it.frac,0.99999))*TAU; cum += it.frac;
          paths += `<path d="${ring(a0,a1)}" fill="${it.color}" stroke="#0a0a0f" stroke-width="4"></path>`; } });
        svg.innerHTML = paths;
        st.items.forEach(it => { const lr = legRows[it.name]; if(!lr) return;
          if(it.total > 0 || it.frac > 0){ lr.row.style.display = ""; lr.v.textContent = `${it.pct.toFixed(2)}% · ${fmtS(it.total)}`; }
          else lr.row.style.display = "none"; });
        ecBox.textContent = (st.evenness*100).toFixed(2) + "%";
        if(badgeEl){ if(st.name){ badgeEl.textContent = st.name; badgeEl.style.display = ""; } else badgeEl.style.display = "none"; }
      };
      const lerp = (a,b,p) => a + (b-a)*p;
      const tween = (from, to, dur, gen) => { const t0 = performance.now();
        const loop = now => { if(el._gen !== gen) return; let p=(now-t0)/dur; if(p>1)p=1; const e = easeOut(p);
          draw({ name: p<0.5 ? from.name : to.name, evenness: lerp(from.evenness, to.evenness, e),
            items: order.map((name,i) => { const f = from.items[i], t = to.items[i];
              return { name, color:f.color, frac: lerp(f.frac,t.frac,e), pct: lerp(f.pct,t.pct,e), total: lerp(f.total,t.total,e) }; }) });
          if(p<1) requestAnimationFrame(loop); };
        requestAnimationFrame(loop); };

      el._gen = 0;
      const enter = () => { el._gen++; const gen = el._gen;
        const states = vers.map(stateOf); draw(states[0]);
        const DWELL = 3200, TW = 1100; let at = DWELL;
        for(let k=1; k<states.length; k++){ (function(kk){
          setTimeout(() => { if(el._gen === gen) tween(states[kk-1], states[kk], TW, gen); }, at); })(k);
          at += TW + DWELL; }
      };
      const reset = () => { el._gen++; };
      const dur = multi ? (3.2 + (vers.length-1)*(1.1+3.2) + 2) : 8;
      slides.push({ el, dur, enter, reset });
    }

    // ---------- 4) BUMP CHART (rankings por canción, versión completa) ----------
    function bumpSlide(A){
      const el = makeSlide("bump", "bump-slide");
      el.innerHTML = `
        <div class="slide-title">Ranking per song</div>
        <div class="slide-sub">How each member placed in every song</div>
        <div class="bump-wrap"></div>`;
      const draw = () => {
        const wrap = el.querySelector(".bump-wrap");
        // El bloque de fotos+nombres vive en su propia franja a la derecha del todo,
        // separada del área de líneas, para no tapar los nombres de las canciones.
        const H=560, mL=96, mT=26, mB=124;
        const xEnd = 770;                 // fin del área de líneas / etiquetas de canción
        const pcx = 915, pr = 26;         // centro y radio de la foto (franja derecha)
        const nameX = pcx + pr + 14;
        // el ancho se adapta al nombre más largo, para que los nombres lleguen a la derecha sin cortarse
        const maxNameLen = Math.max(4, ...A.members.map(m => m.name.length));
        const W = Math.ceil(nameX + maxNameLen * 12.5 + 24);
        const n = A.songs.length, maxR = Math.max(A.maxRank, 1);
        const xAt = i => n>1 ? mL + i*(xEnd-mL)/(n-1) : mL + (xEnd-mL)/2;
        const yAt = r => mT + (maxR>1 ? (r-1)*(H-mT-mB)/(maxR-1) : (H-mT-mB)/2);
        let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
        // guías de rango
        for(let r=1;r<=maxR;r++){ const y=yAt(r);
          svg += `<line class="axis" x1="${mL}" y1="${y}" x2="${xEnd}" y2="${y}"></line>`;
          svg += `<text class="rlab" x="${mL-12}" y="${y+5}" text-anchor="end">${r}</text>`; }
        // etiquetas de canción (x) — en DOS filas alternas para que no se solapen los títulos largos
        const yBase = H - mB + 30;
        A.songs.forEach((s,i)=>{ const x=xAt(i);
          const anch = "middle";          // todas centradas bajo su punto (incl. 1ª y última)
          const y = yBase + (i % 2) * 30;
          svg += `<line class="axis" x1="${x}" y1="${H-mB+6}" x2="${x}" y2="${y-14}" opacity="0.4"></line>`;
          svg += `<text class="xlab" x="${x}" y="${y}" text-anchor="${anch}">${esc(s.title)}</text>`; });
        // una línea por miembro
        [...A.members].sort((a,b)=>b.total-a.total).forEach(m => {
          const pts = [];
          A.songs.forEach((s,i)=>{ const r=m.ranks[s.orig]; if(r) pts.push([xAt(i), yAt(r), i]); });
          if(!pts.length) return;
          const ey = pts[pts.length-1][1];
          // la línea se prolonga en horizontal hasta la foto de la derecha
          const dPts = pts.concat([[pcx - pr - 6, ey]]);
          const d = dPts.map((p,k)=> (k?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
          let len=0; for(let k=1;k<dPts.length;k++){ len += Math.hypot(dPts[k][0]-dPts[k-1][0], dPts[k][1]-dPts[k-1][1]); }
          svg += `<path class="bump-line" style="--len:${Math.max(len,1)}" stroke="${m.color}" d="${d}"></path>`;
          pts.forEach(p => { svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="7" fill="${m.color}"></circle>`; });
          // foto + nombre en la franja derecha (mismo alto que su último puesto)
          const cid = "clipbump" + m.name.replace(/[^a-z0-9]/gi, "");
          svg += `<clipPath id="${cid}"><circle cx="${pcx}" cy="${ey}" r="${pr}"></circle></clipPath>`;
          svg += `<image href="${esc(m.image)}" x="${pcx-pr}" y="${ey-pr}" width="${pr*2}" height="${pr*2}" clip-path="url(#${cid})" preserveAspectRatio="xMidYMid slice"></image>`;
          svg += `<circle cx="${pcx}" cy="${ey}" r="${pr}" fill="none" stroke="${m.color}" stroke-width="3"></circle>`;
          svg += `<text x="${nameX}" y="${ey+6}" fill="${m.color}" font-weight="900" font-size="20">${esc(m.name)}</text>`;
        });
        svg += `</svg>`;
        wrap.innerHTML = svg;
      };
      const enter = () => { draw(); };            // redibuja para relanzar el trazado
      const reset = () => { el.querySelector(".bump-wrap").innerHTML = ""; };
      slides.push({ el, dur:10, enter, reset });
    }

    // ---------- 5) Nº DE VECES 1º, 2º, ... (una por puesto, versión completa) ----------
    // USE = % de la altura útil que ocupan las barras; el resto (arriba) deja hueco para
    // el número, de modo que una barra al máximo LLEGA a su línea (antes se quedaba corta
    // porque el número le robaba altura).
    function placesSlides(A){
    const USE = 88;
    for(let place=1; place<=Math.max(A.maxRank,1); place++){
      const el = makeSlide("places", "places-slide");
      const data = A.members.map(m => ({ m, c: m.rankCount[place]||0 }))
                            .sort((a,b)=> b.c - a.c);
      const maxC = Math.max(1, ...data.map(d=>d.c));
      const glines = []; for(let i=1;i<=maxC;i++) glines.push(`<div class="gl" style="bottom:${i/maxC*USE}%"></div>`);
      const ylabs  = []; for(let i=0;i<=maxC;i++) ylabs.push(`<span style="bottom:${i/maxC*USE}%">${i}</span>`);
      el.innerHTML = `
        <div class="place-head"><span class="slide-title">Number of times</span><span class="place-big">${ord(place)} place</span></div>
        <div class="pchart">
          <div class="yax">${ylabs.join("")}</div>
          <div class="plot">
            ${glines.join("")}
            <div class="cols">${data.map(d => { const h = d.c ? d.c/maxC*USE : 0; return `
              <div class="bar-col${d.c ? "" : " zero"}">
                <div class="cnt" style="color:${d.c ? d.m.color : "var(--text3)"};bottom:${h}%">${d.c}</div>
                <div class="bar" data-h="${h}" style="height:0;background:${d.m.color}">
                  ${d.c ? `<img class="ph" src="${esc(d.m.image)}" alt="">` : ""}
                </div>
                <div class="nm">${esc(d.m.name)}</div>
              </div>`; }).join("")}
            </div>
          </div>
        </div>`;
      const enter = () => el.querySelectorAll(".bar").forEach(b => { const h=+b.dataset.h; b.style.height = (h>0?Math.max(h,6):0) + "%"; });
      const reset = () => el.querySelectorAll(".bar").forEach(b => b.style.height = "0");
      slides.push({ el, dur:4.5, enter, reset });
    }
    }  // cierra placesSlides
  }  // cierra buildSlides

  // ===================== reproductor de diapositivas =====================
  let slides = [], idx = 0, playing = true, elapsed = 0, last = 0, instAudio = null;
  let bgA = 0, bgB = 0, bgRaf = 0, wasRace = false;   // audio de fondo
  const BGFADE = 1.6;      // fundido de entrada
  const BGFADEOUT = 0.35;  // fundido de salida (rápido, al entrar al race)
  const bgCancel = () => { cancelAnimationFrame(bgRaf); bgRaf = 0; };
  // arranca/reanuda el fondo: entra suave (siempre), sale suave al final, y NO se repite.
  // fromStart=false -> continúa donde estaba (no reinicia la canción).
  function bgStart(fromStart){
    if(!instAudio) return;
    bgCancel();
    if(fromStart){ try{ instAudio.currentTime = bgA; }catch(e){} }
    const t0 = performance.now();
    instAudio.volume = 0; instAudio.play().catch(()=>{});
    const loop = () => {
      if(!instAudio || instAudio.paused) return;
      const ct = instAudio.currentTime;
      const end = (bgB > bgA) ? bgB : (isFinite(instAudio.duration) ? instAudio.duration : ct + 1e9);
      if(ct >= end){ try{ instAudio.pause(); }catch(e){} return; }   // no se repite
      const sinceIn = (performance.now() - t0) / 1000, out = end - ct;
      let v = 1;
      if(sinceIn < BGFADE) v = sinceIn / BGFADE;         // entra suave (también al reanudar)
      if(out < BGFADE) v = Math.min(v, out / BGFADE);    // sale suave al final
      instAudio.volume = Math.max(0, Math.min(1, v));
      bgRaf = requestAnimationFrame(loop);
    };
    bgRaf = requestAnimationFrame(loop);
  }
  const bgSessionStart = () => bgStart(true);    // al inicio del álbum
  const bgResume = () => bgStart(false);         // al salir del race: continúa (no reinicia)
  // se apaga RÁPIDO al entrar al race, pero mantiene la posición (no reinicia)
  function bgFadeOutStop(){
    if(!instAudio) return;
    bgCancel();
    const v0 = instAudio.volume || 1, t0 = performance.now();
    const step = () => { if(!instAudio) return; let p=(performance.now()-t0)/(BGFADEOUT*1000); if(p>1)p=1;
      instAudio.volume = Math.max(0, v0*(1-p));
      if(p<1) bgRaf = requestAnimationFrame(step); else { try{ instAudio.pause(); }catch(e){} } };  // pausa, no reinicia
    bgRaf = requestAnimationFrame(step);
  }

  function showSlide(i){
    if(!slides.length) return;
    idx = (i + slides.length) % slides.length;
    slides.forEach((s,k) => {
      const on = k === idx;
      if(s.reset && !on) s.reset();
      s.el.classList.toggle("active", on);
    });
    const cur = slides[idx];
    // audio de fondo: se apaga al entrar al race; al salir del race vuelve suave (una vez)
    const isRace = cur.el.dataset.kind === "total";
    if(isRace && !wasRace) bgFadeOutStop();
    else if(!isRace && wasRace) bgResume();   // continúa donde iba (no reinicia la canción)
    wasRace = isRace;
    if(cur.enter) requestAnimationFrame(() => requestAnimationFrame(cur.enter));
    elapsed = 0; last = performance.now();
    slidelbl.textContent = (idx+1) + " / " + slides.length;
  }
  const next = () => showSlide(idx+1);
  const prev = () => showSlide(idx-1);

  function tick(now){
    const cur = slides[idx];
    if(cur){
      if(playing){ elapsed += (now - last)/1000; }
      last = now;
      const frac = Math.min(1, elapsed / (cur.dur || 6));
      pfill.style.width = (frac*100) + "%";
      if(playing && elapsed >= (cur.dur || 6) && idx < slides.length-1) next();
    }
    requestAnimationFrame(tick);
  }

  function setPlaying(p){ playing = p; last = performance.now(); $("#playpause").textContent = p ? "⏸" : "▶"; }

  // ===================== init =====================
  async function start(albumPath){
    const albumData = await loadJSON(albumPath);
    if(!albumData || albumData.type !== "album"){
      stage.innerHTML = '<div class="loading">No se pudo cargar el álbum.</div>'; return;
    }
    document.body.classList.toggle("light", albumData.theme === "light");
    const songDatas = await Promise.all((albumData.songs||[]).map(loadJSON));
    const A = aggregate(albumData, songDatas);
    if(!A.members.length){ stage.innerHTML = '<div class="loading">El álbum no tiene datos de miembros.</div>'; return; }

    const accent = A.members[0] ? A.members[0].color : "#7c5cff";
    document.documentElement.style.setProperty("--accent", accent);

    const loadingEl = $("#loading"); if(loadingEl) loadingEl.remove();
    slides = buildSlides(albumData, songDatas);
    showSlide(0);
    requestAnimationFrame(tick);

    // audio de FONDO opcional: suena en las diapositivas que NO son el race, con fundido
    // de entrada y de salida, una sola vez (no se repite); se apaga al entrar al race.
    const bg = albumData.bgAudio;
    const bgSrc = (bg && bg.src) || albumData.instrumental || "";
    if(bgSrc){
      instAudio = new Audio(bgSrc);
      bgA = (bg && +bg.start) || 0;
      bgB = (bg && +bg.end) || 0;
      if(!wasRace) bgSessionStart();     // empieza en la portada (no-race)
    }

    // controles
    $("#next").onclick = next;
    $("#prev").onclick = prev;
    $("#playpause").onclick = () => setPlaying(!playing);
    document.addEventListener("keydown", e => {
      if(/^(input|select|textarea)$/i.test((e.target && e.target.tagName)||"")) return;
      if(e.key === "ArrowRight"){ e.preventDefault(); next(); }
      else if(e.key === "ArrowLeft"){ e.preventDefault(); prev(); }
      else if(e.code === "Space"){ e.preventDefault(); setPlaying(!playing); }
    });
  }

  (async () => {
    const param = new URLSearchParams(location.search).get("album");
    const sel = $("#albumSel");
    if(desktop && desktop.listAlbums){
      const list = (await desktop.listAlbums()) || [];
      list.sort((a,b)=> (a.group+a.album).localeCompare(b.group+b.album));
      sel.innerHTML = list.map(a => `<option value="${esc(a.path)}">${esc(a.group)} — ${esc(a.album)}</option>`).join("");
      const path = param || (list[0] && list[0].path);
      if(!path){ stage.innerHTML = '<div class="loading">No hay álbumes. Crea uno en la biblioteca.</div>'; sel.style.display="none"; return; }
      sel.value = path;
      sel.onchange = () => { location.href = "album.html?album=" + encodeURIComponent(sel.value); };
      start(path);
    } else {
      sel.style.display = "none";
      if(!param){ stage.innerHTML = '<div class="loading">Abre con ?album=data/&lt;grupo&gt;/albums/&lt;album&gt;.json</div>'; return; }
      start(param);
    }
  })();
})();
