/*
=========================================
Diseño "CODED" (color-coded lyrics clásico)
=========================================
Segundo diseño seleccionable por canción (SONG.layout === "coded"). En vez del
lienzo con vídeo + ranking a los lados, muestra:
  · una TIRA de fotos de los miembros arriba (las del editor 🖼 Fotos),
  · la LETRA centrada debajo (coloreada por quien canta),
  · los AD-LIBS saliendo bajo las fotos,
  · y el RANKING (resultados + donut) como cierre al terminar (reutiliza la
    overlay de resultados, que ya se dispara con el 'ended' del audio).

Reutiliza el motor de letras (Lyrics), los flags por miembro del ranking
(active / done, que calcula Ranking cada frame) y la overlay de resultados.
El #video reproduce el mp3 (audio) y sirve de reloj (ver ui.js / player.js).
*/
const Coded = {
  built: false,
  strips: [],

  active(){ return !!(typeof SONG !== "undefined" && SONG && SONG.layout === "coded"); },

  build(){
    if(this.built || !this.active()) return;
    const app = document.getElementById("app");
    if(!app) return;
    const PV = window.PHOTO_VER || 1;

    const root = document.createElement("div");
    root.id = "coded";

    // --- TIRA de fotos de miembros ---
    const top = document.createElement("div"); top.id = "coded-top";
    (SONG.members || []).forEach(m => {
      const s = document.createElement("div");
      s.className = "cstrip";
      s.style.setProperty("--c", m.color || "#888");

      const img = document.createElement("img");
      img.className = "cstrip-photo";
      const img_src = m.image || "";
      img.src = img_src ? (img_src + (img_src.indexOf("?") < 0 ? "?" : "&") + "v=" + PV) : "";
      img.alt = m.name;
      img.style.objectPosition = "center " + (m.focus != null ? m.focus : 45) + "%";

      const grad = document.createElement("div"); grad.className = "cstrip-grad";
      const nm = document.createElement("div"); nm.className = "cstrip-name"; nm.textContent = m.name;

      s.appendChild(img); s.appendChild(grad); s.appendChild(nm);
      top.appendChild(s);
      this.strips.push({ name: m.name, el: s });
    });
    root.appendChild(top);

    // --- Zona de AD-LIBS (bajo las fotos): reutiliza #adlib-msg ---
    const adzone = document.createElement("div"); adzone.id = "coded-adzone";
    root.appendChild(adzone);

    // --- LETRA central: reutiliza #lyrics-section ---
    const lyrZone = document.createElement("div"); lyrZone.id = "coded-lyrics";
    root.appendChild(lyrZone);

    app.appendChild(root);

    // Mover al diseño coded los elementos que ya usa el motor de letras (mismos
    // nodos -> el motor sigue escribiendo en ellos sin cambios).
    const lyrSec = document.getElementById("lyrics-section");
    if(lyrSec) lyrZone.appendChild(lyrSec);
    const admsg = document.getElementById("adlib-msg");
    if(admsg) adzone.appendChild(admsg);

    // No hay controles de vídeo visibles: click en cualquier parte = play / pausa.
    const v = document.getElementById("video");
    root.addEventListener("click", (e) => {
      // no robes el click a botones/enlaces que pudieran aparecer encima
      if(e.target.closest("button, a, input, select")) return;
      if(v){ v.paused ? v.play().catch(()=>{}) : v.pause(); }
    });

    this.built = true;
    requestAnimationFrame(() => this.fitNames());
    setTimeout(() => this.fitNames(), 250);          // reintento: cuando el layout ya asentó
    window.addEventListener("resize", () => this.fitNames());
    this.loop();
  },

  // Encoge el nombre de cada tira hasta que quepa (con muchos miembros las tiras
  // son estrechas y el nombre se cortaba con "...").
  fitNames(){
    for(const st of this.strips){
      const nm = st.el.querySelector(".cstrip-name");
      if(!nm) continue;
      let s = 38; nm.style.fontSize = s + "px";
      const avail = nm.clientWidth;              // ancho de la caja (no depende de la fuente)
      if(avail <= 4) continue;                   // layout aún no listo -> lo pillará el reintento
      let guard = 0;
      while(nm.scrollWidth > avail * 0.94 && s > 9 && guard++ < 60){ s -= 1; nm.style.fontSize = s + "px"; }
    }
  },

  // Enciende la tira del que canta, apaga a los demás, gris al que ya terminó.
  loop(){
    const tick = () => {
      const R = (typeof Ranking !== "undefined") ? Ranking : null;
      const members = (R && R.members) ? R.members : [];
      for(const st of this.strips){
        const m = members.find(x => x.name === st.name);
        const active = !!(m && m.active);
        const done   = !!(m && m.done && !m.active);
        st.el.classList.toggle("singing", active);
        st.el.classList.toggle("done", done);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
};
