/* Library home screen (desktop app). Lists songs, opens the viewer, exports 4K. */
(function(){
  const grid = document.getElementById("grid");
  const overlay = document.getElementById("overlay");
  const fill = document.getElementById("fill");
  const ovtitle = document.getElementById("ovtitle");
  const ovsub = document.getElementById("ovsub");

  if(!window.desktop || !window.desktop.isDesktop){
    grid.innerHTML = '<div class="empty">Esta pantalla es de la app de escritorio. En el navegador, abre <b>index.html</b> directamente.</div>';
    return;
  }

  function fmtTime(s){
    s = Math.round(s || 0);
    const m = Math.floor(s / 60), ss = String(s % 60).padStart(2, "0");
    return m + ":" + ss;
  }

  function card(song){
    const el = document.createElement("div");
    el.className = "card";
    const avatars = (song.members || []).slice(0, 9)
      .map(m => `<img src="${m.image}" alt="${m.name}" title="${m.name}">`).join("");
    el.innerHTML = `
      <div class="grp">${song.group || "—"}</div>
      <div class="name">${song.song || "(sin título)"}</div>
      <div class="avatars">${avatars}</div>
      <div class="meta">${(song.members || []).length} miembros · ${fmtTime(song.duration)}</div>
      <div class="actions">
        <button class="open">▶  Abrir</button>
        <button class="edit">✎  Editar</button>
        <button class="fotos">🖼  Fotos</button>
        <button class="thumb">🎬  Miniatura</button>
      </div>`;
    el.querySelector(".open").onclick = () => {
      location.href = "index.html?song=" + encodeURIComponent(song.path);
    };
    el.querySelector(".edit").onclick = () => {
      location.href = "editor.html?song=" + encodeURIComponent(song.path);
    };
    el.querySelector(".fotos").onclick = () => {
      location.href = "photos.html?song=" + encodeURIComponent(song.path);
    };
    el.querySelector(".thumb").onclick = () => {
      location.href = "thumb.html?song=" + encodeURIComponent(song.path);
    };
    return el;
  }

  function albumCard(al){
    const el = document.createElement("div");
    el.className = "card album";
    const cover = al.cover ? `<img class="cover" src="${al.cover}" alt="">` : "";
    el.innerHTML = `
      ${cover}
      <div class="grp">${al.group || "—"}</div>
      <div class="name">${al.album || "(sin título)"}</div>
      <div class="meta">${(al.songs || []).length} canciones</div>
      <div class="actions">
        <button class="open">▶  Abrir</button>
        <button class="thumb">🎬  Miniatura</button>
      </div>`;
    el.querySelector(".open").onclick = () => {
      location.href = "album.html?album=" + encodeURIComponent(al.path);
    };
    el.querySelector(".thumb").onclick = () => {
      location.href = "album-thumb.html?album=" + encodeURIComponent(al.path);
    };
    return el;
  }

  async function doExport(song){
    overlay.classList.add("show");
    ovtitle.textContent = "Exportando: " + song.song;
    fill.style.width = "0%";
    const res = await window.desktop.exportVideo({ song: song.path, name: (song.song || "video").replace(/[^\w\-]+/g, "_") });
    overlay.classList.remove("show");
    if(res && res.ok) alert("¡Listo! Vídeo 4K guardado en:\n" + res.out);
    else if(res && res.canceled){ /* nada */ }
    else alert("Error al exportar: " + ((res && res.error) || "desconocido"));
  }

  window.desktop.onProgress(p => {
    const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    fill.style.width = pct + "%";
    ovsub.textContent = (p.phase === "results" ? "Pantalla de resultados" : "Canción") +
      " — " + pct + "%  ·  renderizando fotograma a fotograma, no cierres la app.";
  });

  // ---- Crear canción nueva (modal) ----
  function setupCreate(groups){
    const modal   = document.getElementById("newmodal");
    const mtitle  = document.getElementById("mtitle");
    const mError  = document.getElementById("merror");
    const sel     = document.getElementById("groupSelect");
    const btnNew  = document.getElementById("newSong");
    const btnGrp  = document.getElementById("newGroup");
    const mCreate = document.getElementById("mCreate");
    let mode = "existing";

    function open(m){
      mode = (m === "new" || !Object.keys(groups).length) ? "new" : "existing";
      mtitle.textContent = mode === "new" ? "Nueva canción + grupo nuevo" : "Nueva canción";
      document.getElementById("fGroupSelect").style.display = mode === "existing" ? "" : "none";
      document.getElementById("fGroupName").style.display   = mode === "new" ? "" : "none";
      document.getElementById("fMembers").style.display     = mode === "new" ? "" : "none";
      sel.innerHTML = "";
      Object.keys(groups).sort().forEach(g => {
        const o = document.createElement("option"); o.value = g; o.textContent = g; sel.appendChild(o);
      });
      mError.textContent = "";
      document.getElementById("songName").value = "";
      document.getElementById("groupName").value = "";
      document.getElementById("membersTa").value = "";
      modal.classList.add("show");
    }

    btnNew.onclick = () => open("existing");
    btnGrp.onclick = () => open("new");
    const donutBtn = document.getElementById("donutBtn");
    if(donutBtn) donutBtn.onclick = () => { location.href = "donut.html"; };
    const transcribeBtn = document.getElementById("transcribeBtn");
    if(transcribeBtn) transcribeBtn.onclick = () => { location.href = "transcribe.html"; };
    const nowplayingBtn = document.getElementById("nowplayingBtn");
    if(nowplayingBtn) nowplayingBtn.onclick = () => { location.href = "nowplaying.html"; };
    document.getElementById("mCancel").onclick = () => modal.classList.remove("show");
    modal.addEventListener("click", e => { if(e.target === modal) modal.classList.remove("show"); });

    mCreate.onclick = async () => {
      const song = document.getElementById("songName").value.trim();
      if(!song){ mError.textContent = "Pon el nombre de la canción."; return; }
      const args = { song, theme: document.getElementById("themeSelect").value };
      if(mode === "existing"){
        const g = sel.value;
        args.group = g; args.sourcePath = groups[g];
      } else {
        const gn = document.getElementById("groupName").value.trim();
        const mem = document.getElementById("membersTa").value.split("\n").map(x => x.trim()).filter(Boolean);
        if(!gn){ mError.textContent = "Pon el nombre del grupo."; return; }
        if(!mem.length){ mError.textContent = "Pon al menos un miembro."; return; }
        args.group = gn; args.members = mem;
      }
      mCreate.disabled = true; mCreate.textContent = "Creando…";
      const res = await window.desktop.createSong(args);
      mCreate.disabled = false; mCreate.textContent = "Crear";
      if(res && res.ok){
        modal.classList.remove("show");
        location.reload();                 // muestra la nueva tarjeta
      } else {
        mError.textContent = (res && res.error) || "Error al crear la canción.";
      }
    };
  }

  // ---- Crear álbum (modal): elige grupo, nombre y marca sus canciones ----
  function setupAlbumCreate(songs, groups){
    const modal = document.getElementById("albummodal");
    const gSel  = document.getElementById("alGroup");
    const list  = document.getElementById("alSongs");
    const err   = document.getElementById("alError");
    const btn   = document.getElementById("newAlbum");
    const create = document.getElementById("alCreate");

    let tickOrder = [];   // orden en que el usuario va marcando (= orden del álbum)
    function renderSongs(group){
      tickOrder = [];
      const mine = songs.filter(s => s.group === group)
                        .sort((a,b) => a.song.localeCompare(b.song));
      list.innerHTML = mine.length
        ? mine.map(s => `<label><input type="checkbox" value="${s.path}"> <span class="ord"></span>${s.song}</label>`).join("")
        : '<div class="none">Este grupo no tiene canciones.</div>';
    }
    // al marcar/desmarcar: mantener el orden de marcado y numerar
    list.addEventListener("change", e => {
      const cb = e.target; if(!cb || cb.type !== "checkbox") return;
      if(cb.checked) tickOrder.push(cb.value);
      else tickOrder = tickOrder.filter(v => v !== cb.value);
      list.querySelectorAll("label").forEach(l => {
        const v = l.querySelector("input").value;
        const i = tickOrder.indexOf(v);
        const o = l.querySelector(".ord");
        if(o) o.textContent = i >= 0 ? (i+1) + ". " : "";
      });
    });
    function open(){
      const gs = Object.keys(groups).sort();
      if(!gs.length){ err.textContent = "Primero crea alguna canción."; }
      gSel.innerHTML = gs.map(g => `<option value="${g}">${g}</option>`).join("");
      renderSongs(gSel.value);
      document.getElementById("alName").value = "";
      err.textContent = "";
      modal.classList.add("show");
    }
    if(btn) btn.onclick = open;
    gSel.onchange = () => renderSongs(gSel.value);
    document.getElementById("alCancel").onclick = () => modal.classList.remove("show");
    modal.addEventListener("click", e => { if(e.target === modal) modal.classList.remove("show"); });

    create.onclick = async () => {
      const album = document.getElementById("alName").value.trim();
      const group = gSel.value;
      const chosen = tickOrder.slice();   // en el orden en que las marcaste
      if(!album){ err.textContent = "Pon el nombre del álbum."; return; }
      if(!chosen.length){ err.textContent = "Marca al menos una canción."; return; }
      create.disabled = true; create.textContent = "Creando…";
      const res = await window.desktop.createAlbum({
        group, album, theme: document.getElementById("alTheme").value,
        songs: chosen, sourcePath: groups[group]
      });
      create.disabled = false; create.textContent = "Crear álbum";
      if(res && res.ok){ modal.classList.remove("show"); location.reload(); }
      else err.textContent = (res && res.error) || "Error al crear el álbum.";
    };
  }

  (async () => {
    const songs = await window.desktop.listSongs() || [];
    const albums = (window.desktop.listAlbums ? await window.desktop.listAlbums() : []) || [];
    const groups = {};
    songs.forEach(s => { if(s.group && !groups[s.group]) groups[s.group] = s.path; });
    setupCreate(groups);
    setupAlbumCreate(songs, groups);

    // Álbumes arriba
    if(albums.length){
      document.getElementById("albumsect").style.display = "";
      const ag = document.getElementById("albumgrid");
      albums.sort((a,b) => (a.group + a.album).localeCompare(b.group + b.album));
      albums.forEach(a => ag.appendChild(albumCard(a)));
    }

    if(!songs.length){
      grid.innerHTML = '<div class="empty">No hay canciones todavía. Crea una con <b>➕ Nueva canción + grupo</b>.</div>';
      return;
    }
    if(albums.length) document.getElementById("songsttl").style.display = "";
    songs.sort((a, b) => (a.group + a.song).localeCompare(b.group + b.song));
    songs.forEach(s => grid.appendChild(card(s)));
  })();
})();
