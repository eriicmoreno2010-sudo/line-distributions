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
        <button class="exp">⬇  Exportar 4K</button>
      </div>`;
    el.querySelector(".open").onclick = () => {
      location.href = "index.html?song=" + encodeURIComponent(song.path);
    };
    el.querySelector(".exp").onclick = () => doExport(song);
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

  (async () => {
    const songs = await window.desktop.listSongs();
    if(!songs || !songs.length){
      grid.innerHTML = '<div class="empty">No hay canciones en <b>data/</b> todavía.</div>';
      return;
    }
    songs.sort((a, b) => (a.group + a.song).localeCompare(b.group + b.song));
    songs.forEach(s => grid.appendChild(card(s)));
  })();
})();
