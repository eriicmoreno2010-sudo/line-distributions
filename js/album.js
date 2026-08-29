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

  // ===================== agregación del álbum =====================
  function aggregate(album, songDatas){
    const roster = {};       // name -> {name,color,image,total,per[i],ranks[i],rankCount{}}
    const songs = [];        // por canción: {i,title,color,secs{},ranked[]}
    const order = [];        // orden de aparición de miembros

    songDatas.forEach((sd, i) => {
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
        secs[m.name] = sec; R.per[i] = sec; R.total += sec;
      });
      const ranked = (sd.members||[]).map(m => m.name)
        .sort((a,b) => (secs[b]||0) - (secs[a]||0));
      ranked.forEach((nm, idx) => {
        const rank = idx + 1;
        roster[nm].ranks[i] = rank;
        roster[nm].rankCount[rank] = (roster[nm].rankCount[rank]||0) + 1;
      });
      songs.push({ i, title: sd.song || ("Canción " + (i+1)),
                   color: SONG_COLORS[i % SONG_COLORS.length], secs, ranked,
                   dur: sd.duration || 0,
                   audio: sd.audio || "", instrumental: sd.instrumental || "",
                   clipStart: +sd.instrumentalStart || 0, clipEnd: +sd.instrumentalEnd || 0 });
    });

    const members = order.map(n => roster[n]);
    // por miembro: canción donde más y donde menos cantó (entre las que aparece)
    members.forEach(m => {
      const entries = Object.keys(m.per).map(k => [+k, m.per[k]]);
      if(entries.length){
        entries.sort((a,b) => b[1]-a[1]);
        m.topSong = songs[entries[0][0]]; m.topSec = entries[0][1];
        m.lowSong = songs[entries[entries.length-1][0]]; m.lowSec = entries[entries.length-1][1];
      }
      m.pct = 0;
    });
    const grand = members.reduce((a,m)=>a+m.total, 0) || 1;
    members.forEach(m => m.pct = m.total/grand*100);

    // evenness = entropía normalizada de los totales (0..1)
    let H = 0; members.forEach(m => { const p = m.total/grand; if(p>0) H -= p*Math.log(p); });
    const Hmax = Math.log(members.length || 1);
    const evenness = Hmax > 0 ? H/Hmax : 1;

    const maxRank = songs.reduce((mx,s)=> Math.max(mx, s.ranked.length), 0);
    return { album, members, songs, grand, evenness, maxRank };
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

  function buildSlides(A){
    const slides = [];
    const membersByTotal = [...A.members].sort((a,b)=> b.total - a.total);

    // ---------- 1) PORTADA ----------
    {
      const el = makeSlide("cover", "cover-slide");
      const art = A.album.cover
        ? `<img class="cover-art" src="${esc(A.album.cover)}" alt="">`
        : `<div class="cover-art cover-noart">💿</div>`;
      const songs = A.songs.map((s,i) =>
        `<div class="sg"><span class="n" style="background:${s.color}">${i+1}</span>${esc(s.title)}</div>`).join("");
      el.innerHTML = `
        ${art}
        <div class="cover-info">
          <div class="grp">${esc(A.album.group)}</div>
          <div class="alb">${esc(A.album.album)}</div>
          <div class="tag">Album Distribution</div>
          <div class="songlist">${songs}</div>
        </div>`;
      slides.push({ el, dur:7 });
    }

    // ---------- 2) TOTAL SECONDS — bar chart race (una sola diapositiva animada) ----------
    // Izquierda: ranking de la canción actual. Derecha: total del álbum acumulado, que se
    // reordena (los miembros se adelantan) canción a canción. Las barras del total se
    // llenan al 100% cuando se alcanza el máximo final del álbum.
    const albumHead = (A.album.group ? esc(A.album.group) + " — " : "") + esc(A.album.album);
    {
      const el = makeSlide("total", "race-slide");
      const nSongs = A.songs.length;
      const albumMax = (membersByTotal[0] && membersByTotal[0].total) || 1;   // 100% = máximo total del álbum
      const cumAt = (m, si) => { let x=0; for(let j=0;j<=si;j++) x += m.per[j]||0; return x; };
      const easeOut = p => 1 - Math.pow(1-p, 3);
      // Colores del race: cada canción su color (elegido); nombres/aros de la derecha, color por miembro (elegido).
      const songColor = j => (A.album.songColors && A.album.songColors[j]) || SONG_COLORS[j % SONG_COLORS.length];
      const memColor = {}; A.members.forEach(m => memColor[m.name] = m.color);
      const raceColor = name => (A.album.raceColors && A.album.raceColors[name]) || memColor[name] || "#888";

      el.innerHTML = `
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
      const tagEl = el.querySelector(".song-tag");

      // izquierda: barra simple (color de la canción). derecha: barra apilada por color de
      // canción + líneas negras; nombres/aros con el color elegido por miembro.
      const songMap = {}, totMap = {};
      A.members.forEach(m => {
        const s = document.createElement("div");
        s.className = "ts-row"; s.style.setProperty("--accent", memColor[m.name]);
        s.innerHTML = `<img class="ph" src="${esc(m.image)}" alt=""><div class="mid"><div class="nm">${esc(m.name)}</div>
          <div class="bar"><div class="fill"></div></div></div><div class="sec">0.00s</div>`;
        songRowsEl.appendChild(s);
        songMap[m.name] = { row:s, fill:s.querySelector(".fill"), nm:s.querySelector(".nm"), sec:s.querySelector(".sec") };

        const t = document.createElement("div");
        t.className = "ts-row"; t.style.setProperty("--accent", raceColor(m.name));   // nombre + aro (color elegido)
        const segs = A.songs.map((s2,j)=>`<div class="seg" style="width:0;background:${songColor(j)}"></div>`).join("");
        t.innerHTML = `<img class="ph" src="${esc(m.image)}" alt=""><div class="mid"><div class="nm">${esc(m.name)}</div>
          <div class="bar stack">${segs}<div class="divlines"></div></div></div><div class="sec">0.00s</div>`;
        totRowsEl.appendChild(t);
        totMap[m.name] = { row:t, segs:[...t.querySelectorAll(".seg")], lines:t.querySelector(".divlines"), sec:t.querySelector(".sec") };
      });

      const positions = (container, map, sorted) => {
        const N = sorted.length, H = container.clientHeight || 1, rowH = H / N;
        sorted.forEach((it, idx) => { const r = map[it.name];
          r.row.style.height = rowH + "px";
          r.row.style.transform = `translateY(${(idx*rowH).toFixed(1)}px)`; });
      };
      const songSorted = si => A.members.map(m=>({name:m.name, sec:m.per[si]||0})).sort((a,b)=>b.sec-a.sec);
      const totSorted  = si => A.members.map(m=>({name:m.name, sec:cumAt(m,si)})).sort((a,b)=>b.sec-a.sec);
      const tweenNum = (elm, from, to, dur, gen) => {
        const t0 = performance.now();
        const loop = now => { if(el._gen !== gen) return; let p=(now-t0)/dur; if(p>1)p=1;
          elm.textContent = (from + (to-from)*easeOut(p)).toFixed(2) + "s";
          if(p<1) requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      };
      // líneas negras que separan las canciones dentro de la barra del total
      const drawLines = (m, si) => {
        let h = "";
        for(let j=0; j<si; j++){ const x = cumAt(m,j)/albumMax*100; h += `<div class="divline" style="left:${x}%"></div>`; }
        totMap[m.name].lines.innerHTML = h;
      };

      // ---- audio por canción (trozo elegido, con fundido de entrada y salida) ----
      const FADE = 1.6, DEF_CLIP = 9, GAP = 0.8;
      const clip = si => {
        const s = A.songs[si];
        const ac = (A.album.clips && A.album.clips[si]) || {};
        // audio: el propio del álbum (album-edit) tiene prioridad; si no, el de la canción
        const src = ac.audio || s.audio || s.instrumental || "";
        let a = (ac.start != null ? ac.start : s.clipStart) || 0;
        let b = (ac.end != null ? ac.end : s.clipEnd) || 0;
        if(!(b > a)) b = a + DEF_CLIP;
        b = Math.min(b, a + 20);                 // tope de seguridad
        return { src, a, b, len: b - a };
      };
      const playClip = (si, gen) => {
        const c = clip(si); if(!c.src) return;
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

      const enter = () => {
        el._gen++; const gen = el._gen; clearTimers(); stopAudios();
        if(typeof instAudio !== "undefined" && instAudio){ try{ instAudio.pause(); }catch(e){} }  // pausa el fondo del álbum
        // estado inicial (sin animación): todo a 0, orden de la 1ª canción
        el.querySelectorAll(".ts-row").forEach(r => r.classList.add("no-anim"));
        positions(songRowsEl, songMap, songSorted(0));
        positions(totRowsEl,  totMap,  songSorted(0));
        A.members.forEach(m => { songMap[m.name].fill.style.width = "0"; songMap[m.name].sec.textContent = "0.00s";
          totMap[m.name].segs.forEach(sg => sg.style.width = "0"); totMap[m.name].lines.innerHTML = ""; totMap[m.name].sec.textContent = "0.00s"; });
        void el.offsetWidth;
        el.querySelectorAll(".ts-row").forEach(r => r.classList.remove("no-anim"));

        const STAGGER = 1600;
        let prevSong = {}; A.members.forEach(m => prevSong[m.name] = 0);
        let t = 0;                                       // tiempo acumulado (ms)
        for(let si = 0; si < nSongs; si++){
          const dwell = Math.max(6, (clip(si).len || DEF_CLIP) + GAP) * 1000;
          const start = t;
          // audio del trozo de esta canción (con fundido)
          el._timers.push(setTimeout(() => { if(el._gen === gen) playClip(si, gen); }, start));
          // (1) izquierda: ranking de la canción (el 1º siempre lleno)
          el._timers.push(setTimeout(() => {
            if(el._gen !== gen) return;
            tagEl.textContent = (si+1) + ". " + A.songs[si].title;
            tagEl.style.color = songColor(si);
            positions(songRowsEl, songMap, songSorted(si));
            const top = Math.max(1, ...A.members.map(m => m.per[si]||0));   // el mayor de ESTA canción = barra llena
            const col = songColor(si);
            A.members.forEach(m => {
              const v = m.per[si] || 0;
              songMap[m.name].row.style.setProperty("--accent", col);   // izquierda: todo del color de la canción
              songMap[m.name].fill.style.width = (v/top*100) + "%";
              tweenNum(songMap[m.name].sec, prevSong[m.name], v, 1400, gen);
              prevSong[m.name] = v;
            });
          }, start));
          // (2) derecha: total acumulado (se reordena) + líneas de canciones
          el._timers.push(setTimeout(() => {
            if(el._gen !== gen) return;
            positions(totRowsEl, totMap, totSorted(si));
            A.members.forEach(m => {
              totMap[m.name].segs[si].style.width = ((m.per[si]||0)/albumMax*100) + "%";  // crece el segmento de esta canción
              drawLines(m, si);
              const from = si>0 ? cumAt(m,si-1) : 0, to = cumAt(m,si);
              tweenNum(totMap[m.name].sec, from, to, 1600, gen);
            });
          }, start + STAGGER));
          t += dwell;
        }
        el._raceTotal = t;
      };
      const reset = () => { el._gen++; clearTimers(); stopAudios();
        if(typeof instAudio !== "undefined" && instAudio){ try{ instAudio.play().catch(()=>{}); }catch(e){} }  // reanuda el fondo del álbum
        A.members.forEach(m => { songMap[m.name].fill.style.width = "0";
          totMap[m.name].segs.forEach(sg => sg.style.width = "0"); totMap[m.name].lines.innerHTML = ""; }); };
      // duración estimada: suma de todos los dwells + margen
      let est = 0; for(let si=0; si<nSongs; si++) est += Math.max(6, (clip(si).len||DEF_CLIP)+GAP);
      slides.push({ el, dur: est + 3, enter, reset });
    }

    // ---------- 3) DONUT + evenness ----------
    {
      const el = makeSlide("donut", "donut-slide");
      const CX=250, CY=250, R=246, ri=120;   // radio grande (llena el SVG) y agujero central más pequeño
      const P = (rad,a)=>[(CX+rad*Math.sin(a)).toFixed(2),(CY-rad*Math.cos(a)).toFixed(2)];
      const ring = (a0,a1)=>{ const large=(a1-a0)>Math.PI?1:0;
        const[x0o,y0o]=P(R,a0),[x1o,y1o]=P(R,a1),[x1i,y1i]=P(ri,a1),[x0i,y0i]=P(ri,a0);
        return `M ${x0o} ${y0o} A ${R} ${R} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${ri} ${ri} 0 ${large} 0 ${x0i} ${y0i} Z`; };
      let cum = 0; const paths = membersByTotal.map(m => {
        const frac = A.grand ? m.total/A.grand : 0;
        const a0 = cum*TAU, a1 = (cum + Math.min(frac,0.99999))*TAU; cum += frac;
        return frac>0 ? `<path d="${ring(a0,a1)}" fill="${m.color}"></path>` : "";
      }).join("");
      const legend = membersByTotal.map(m =>
        `<div class="li"><span class="dot" style="background:${m.color}"></span>${esc(m.name)}
          <span class="v">${m.pct.toFixed(2)}% · ${fmtS(m.total)}</span></div>`).join("");
      el.innerHTML = `
        <div class="slide-title">Album distribution</div>
        <div class="slide-sub">Total seconds per member · evenness</div>
        <div class="donut-wrap">
          <div class="donut-holder" style="position:relative">
            <svg viewBox="0 0 500 500">${paths}</svg>
            <div class="even-badge"><div class="num">${Math.round(A.evenness*100)}%</div><div class="lbl">${evenLabel(A.evenness)}</div></div>
          </div>
          <div class="donut-legend">${legend}</div>
        </div>`;
      slides.push({ el, dur:8 });
    }

    // ---------- 4) BUMP CHART (rankings por canción) ----------
    {
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
          A.songs.forEach((s,i)=>{ const r=m.ranks[i]; if(r) pts.push([xAt(i), yAt(r), i]); });
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

    // ---------- 5) Nº DE VECES 1º, 2º, ... (una por puesto, tipo gráfica) ----------
    for(let place=1; place<=Math.max(A.maxRank,1); place++){
      const el = makeSlide("places", "places-slide");
      const data = A.members.map(m => ({ m, c: m.rankCount[place]||0 }))
                            .sort((a,b)=> b.c - a.c);
      const maxC = Math.max(1, ...data.map(d=>d.c));
      const glines = []; for(let i=1;i<=maxC;i++) glines.push(`<div class="gl" style="bottom:${i/maxC*100}%"></div>`);
      const ylabs  = []; for(let i=0;i<=maxC;i++) ylabs.push(`<span style="bottom:${i/maxC*100}%">${i}</span>`);
      el.innerHTML = `
        <div class="slide-title">Number of times</div>
        <div class="place-big">${ord(place)} place</div>
        <div class="pchart">
          <div class="yax">${ylabs.join("")}</div>
          <div class="plot">
            ${glines.join("")}
            <div class="cols">${data.map(d => `
              <div class="bar-col${d.c ? "" : " zero"}">
                <div class="cnt" style="color:${d.c ? d.m.color : "var(--text3)"}">${d.c}</div>
                <div class="bar" data-h="${d.c ? d.c/maxC*100 : 0}" style="height:0;background:${d.m.color}">
                  ${d.c ? `<img class="ph" src="${esc(d.m.image)}" alt="">` : ""}
                </div>
                <div class="nm">${esc(d.m.name)}</div>
              </div>`).join("")}
            </div>
          </div>
        </div>`;
      const enter = () => el.querySelectorAll(".bar").forEach(b => { const h=+b.dataset.h; b.style.height = (h>0?Math.max(h,8):0) + "%"; });
      const reset = () => el.querySelectorAll(".bar").forEach(b => b.style.height = "0");
      slides.push({ el, dur:4.5, enter, reset });
    }

    // ---------- 6) AVERAGE por canción (sin redondear) ----------
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

    // ---------- 7) MOST LINES / LESS LINES (una sola diapositiva, todos) ----------
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
          <div class="ml-col most">
            <div class="ml-head">MOST LINES</div>
            ${most.map(m => rowH(m, m.topSong, m.topSec)).join("")}
          </div>
          <div class="ml-col less">
            <div class="ml-head">LESS LINES</div>
            ${less.map(m => rowH(m, m.lowSong, m.lowSec)).join("")}
          </div>
        </div>`;
      slides.push({ el, dur:8 });
    }

    return slides;
  }

  // ===================== reproductor de diapositivas =====================
  let slides = [], idx = 0, playing = true, elapsed = 0, last = 0, instAudio = null;

  function showSlide(i){
    if(!slides.length) return;
    idx = (i + slides.length) % slides.length;
    slides.forEach((s,k) => {
      const on = k === idx;
      if(s.reset && !on) s.reset();
      s.el.classList.toggle("active", on);
    });
    const cur = slides[idx];
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
    slides = buildSlides(A);
    showSlide(0);
    requestAnimationFrame(tick);

    // audio de FONDO opcional (suena en todas las diapositivas menos el race), recortado + fundido de entrada
    const bg = albumData.bgAudio;
    const bgSrc = (bg && bg.src) || albumData.instrumental || "";
    if(bgSrc){
      instAudio = new Audio(bgSrc);
      const ba = (bg && +bg.start) || 0, bb = (bg && +bg.end) || 0;
      try{ instAudio.currentTime = ba; }catch(e){}
      if(bb > ba) instAudio.addEventListener("timeupdate", () => { if(instAudio.currentTime >= bb) instAudio.currentTime = ba; });
      else instAudio.loop = true;
      instAudio.volume = 0; instAudio.play().catch(()=>{});
      const t0 = performance.now();
      const fin = () => { if(!instAudio) return; let p=(performance.now()-t0)/1500; if(p>1)p=1; instAudio.volume=p; if(p<1) requestAnimationFrame(fin); };
      requestAnimationFrame(fin);
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
