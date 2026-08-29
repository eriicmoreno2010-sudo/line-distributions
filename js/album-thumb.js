/* Miniatura del álbum — foto grupal + color de fondo + título. Script externo
   (mismo patrón que album.js/donut.js, que funcionan en la app). */
(function(){
  const P = new URLSearchParams(location.search);
  const ALBUM_URL = P.get("album") || "";
  const EXPORT = P.get("export");
  const desktop = (window.desktop && window.desktop.isDesktop) ? window.desktop : null;
  const el = id => document.getElementById(id);
  let album = null;

  function fit(){
    const s = Math.min(window.innerWidth/1280, window.innerHeight/720);
    el("thumb").style.transform = "scale(" + s + ")";
    document.body.style.height = (720*s) + "px";
  }
  window.addEventListener("resize", fit); fit();

  function paint(){
    el("thumb").style.setProperty("--bg", album.thumbBg || "#e8546b");
    el("atitle").textContent = album.album || "";
    el("asub").textContent = ((album.group || "") + " " + (album.thumbTag || "1ST MINI ALBUM")).trim();
    const p = el("photo");
    const photo = album.thumbPhoto || album.cover;   // foto propia de la miniatura (independiente del disco)
    p.innerHTML = photo ? '<img src="' + photo + '?v=' + Date.now() + '" alt="">'
                        : '<div class="ph-empty">Elige la foto grupal →</div>';
    const len = (album.album || "").length;
    el("atitle").style.fontSize = (len > 9 ? Math.max(50, 90 - (len - 9) * 5) : 90) + "px";
  }

  async function load(){
    if(!ALBUM_URL){ document.body.innerHTML = "<p style='color:#fff;padding:40px'>Falta ?album=…</p>"; return; }
    if(desktop){ const r = await desktop.loadSong(ALBUM_URL); album = (r && r.ok) ? r.data : null; }
    else { try{ album = await fetch(ALBUM_URL).then(r => r.json()); }catch(e){} }
    if(!album){ document.body.innerHTML = "<p style='color:#fff;padding:40px'>No se pudo cargar el álbum.</p>"; return; }
    el("bg").value = album.thumbBg || "#e8546b";
    el("ti").value = album.album || "";
    el("tg").value = album.thumbTag || "1ST MINI ALBUM";
    paint();

    if(EXPORT || !desktop){ el("tools").style.display = "none"; return; }   // captura / navegador: sin barra

    const save = async () => { try{ await desktop.saveSong(ALBUM_URL, album); }catch(e){} };
    el("bg").oninput  = () => { album.thumbBg = el("bg").value; paint(); };
    el("bg").onchange = save;
    el("ti").oninput  = () => { album.album = el("ti").value; paint(); };
    el("ti").onchange = save;
    el("tg").oninput  = () => { album.thumbTag = el("tg").value; paint(); };
    el("tg").onchange = save;
    el("pickphoto").onclick = async () => {
      const b = el("pickphoto"); const t0 = b.textContent; b.disabled = true; b.textContent = "⏳…";
      let res = null;
      try{ res = await desktop.pickCover({ group: album.group, song: album.album + "_thumb" }); }catch(e){}
      b.disabled = false; b.textContent = t0;
      if(res && res.ok){ album.thumbPhoto = res.cover; paint(); save(); }
    };
    el("save").onclick = async (e) => {
      const b = e.target; const t0 = b.textContent; b.textContent = "⏳ Guardando…"; b.disabled = true;
      await save();
      let res = null;
      try{ res = await desktop.exportAlbumThumb({ album: ALBUM_URL, name: (album.album || "album").replace(/[^\w\-]+/g, "_") }); }catch(err){}
      b.textContent = (res && res.ok) ? "✓ Guardada" : (res && res.canceled ? t0 : "✕ Error");
      b.disabled = false; setTimeout(() => b.textContent = t0, 2200);
    };
  }
  load();
})();
