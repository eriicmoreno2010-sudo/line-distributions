/*
=========================================
Diseño "CODED" (color-coded lyrics clásico)
=========================================
Segundo diseño (SONG.layout === "coded"). Tira de fotos de miembros arriba, letra
centrada debajo (fondo claro con borde de "papel roto"), ad-libs como TEXTO sobre
el miembro que los canta, y el ranking (resultados + donut) al terminar.

Se ILUMINA CON LA LÍNEA: el miembro se enciende cuando su línea de letra está en
pantalla (Lyrics.centralIndex), no por cada trocito de voz -> ni tarde ni a saltos.
*/
const Coded = {
  built: false,
  strips: [],
  LEAD: 0.30,          // mismo adelanto que el motor (Engine.update(t+0.30))

  active(){ return !!(typeof SONG !== "undefined" && SONG && SONG.layout === "coded"); },

  build(){
    if(this.built || !this.active()) return;
    const app = document.getElementById("app");
    if(!app) return;
    const PV = window.PHOTO_VER || 1;

    const root = document.createElement("div"); root.id = "coded";
    this.root = root;

    // --- TIRA de fotos ---
    const top = document.createElement("div"); top.id = "coded-top";
    (SONG.members || []).forEach(m => {
      const s = document.createElement("div"); s.className = "cstrip";
      s.style.setProperty("--c", m.color || "#888");

      const img = document.createElement("img"); img.className = "cstrip-photo";
      const src = m.image || "";
      img.src = src ? (src + (src.indexOf("?") < 0 ? "?" : "&") + "v=" + PV) : "";
      img.alt = m.name;
      img.style.objectPosition = "center " + (m.focus != null ? m.focus : 45) + "%";

      const grad = document.createElement("div"); grad.className = "cstrip-grad";
      const nm   = document.createElement("div"); nm.className = "cstrip-name"; nm.textContent = m.name;

      s.appendChild(img); s.appendChild(grad); s.appendChild(nm);
      top.appendChild(s);
      this.strips.push({ name: m.name, el: s, adEl: null });
    });
    root.appendChild(top);

    // --- BARRA de color justo DEBAJO de las fotos (toma el color del que canta) ---
    const bar = document.createElement("div"); bar.id = "coded-bar";
    root.appendChild(bar); this.bar = bar;

    // --- AD-LIBS: fila de celdas alineadas con las tiras, DEBAJO de la barra ---
    const adzone = document.createElement("div"); adzone.id = "coded-adzone";
    (SONG.members || []).forEach((m, i) => {
      const cell = document.createElement("div"); cell.className = "cad-cell";
      cell.style.setProperty("--c", m.color || "#888");
      const tx = document.createElement("div"); tx.className = "cad-text";
      cell.appendChild(tx); adzone.appendChild(cell);
      this.strips[i].adEl = tx;
    });
    root.appendChild(adzone);

    // --- LETRA central (reutiliza #lyrics-section) ---
    const lyrZone = document.createElement("div"); lyrZone.id = "coded-lyrics";
    root.appendChild(lyrZone);

    app.appendChild(root);

    const lyrSec = document.getElementById("lyrics-section"); if(lyrSec) lyrZone.appendChild(lyrSec);
    const admsg = document.getElementById("adlib-msg"); if(admsg) admsg.style.display = "none";  // ad-libs van sobre el miembro

    const v = document.getElementById("video");
    root.addEventListener("click", (e) => {
      if(e.target.closest("button, a, input, select")) return;
      if(v){ v.paused ? v.play().catch(()=>{}) : v.pause(); }
    });

    this.built = true;
    requestAnimationFrame(() => this.fitNames());
    setTimeout(() => this.fitNames(), 250);
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.fitNames());   // re-encaja al cargar la fuente bubbly
    window.addEventListener("resize", () => this.fitNames());
    this.loop();
  },

  // color(es) de un conjunto de miembros -> sólido (1) o degradado (varios)
  colorForNames(names){
    const cols = names.map(n => { const m = (SONG.members||[]).find(x=>x.name===n); return m && m.color; }).filter(Boolean);
    if(!cols.length) return "";
    if(cols.length === 1) return cols[0];
    return "linear-gradient(90deg, " + cols.join(", ") + ")";
  },

  // Encoge el nombre de cada tira hasta que quepa. Mido el ancho REAL del texto con
  // canvas (el <div> del nombre tiene ancho fijo, así que scrollWidth no sirve).
  fitNames(){
    const ctx = (this._cv || (this._cv = document.createElement("canvas"))).getContext("2d");
    for(const st of this.strips){
      const nm = st.el.querySelector(".cstrip-name");
      if(!nm) continue;
      const box = nm.clientWidth;
      if(box <= 4) continue;                     // layout aún no listo -> lo pillará el reintento
      const cs = getComputedStyle(nm);
      const fam = cs.fontFamily, wght = cs.fontWeight;
      const fits = px => { ctx.font = wght + " " + px + "px " + fam; return ctx.measureText(nm.textContent).width <= box * 0.86; };
      let s = 44;
      while(s > 12 && !fits(s)) s--;
      nm.style.fontSize = s + "px";
    }
  },

  // Miembros que deben ENCENDERSE con la línea actual (misma lógica que colorea el
  // texto): línea de grupo -> todos; si no, los cantantes de la línea + los marcados
  // con **...@Miembro**.
  lineLit(line){
    if(!line) return null;
    const all = (SONG.members || []).map(m => m.name);
    const isGroup = all.length > 1 && (line.members || []).includes(SONG.group);
    if(isGroup) return new Set(all);
    const set = new Set((line.members || []).filter(n => all.includes(n)));
    const txt = (line.original || "") + "\n" + (line.romanization || "") + "\n" + (line.english || "");
    const re = /@([^*\n]+?)\*\*/g; let m;
    while((m = re.exec(txt))){ m[1].split(",").forEach(n => { n = n.trim(); if(all.includes(n)) set.add(n); }); }
    return set;
  },

  cleanAdlib(raw){
    return String(raw || "").replace(/@[^*\s,]+/g, "").replace(/\*\*/g, "").trim();
  },

  loop(){
    const v = document.getElementById("video");
    const tick = () => {
      const L = (typeof Lyrics !== "undefined") ? Lyrics : null;
      const R = (typeof Ranking !== "undefined") ? Ranking : null;

      // Línea actual = la que muestra el texto (Lyrics.centralIndex). Encendemos sus miembros.
      const ci = (L && L.centralIndex != null) ? L.centralIndex : -1;
      const line = (ci >= 0 && SONG.lyrics) ? SONG.lyrics[ci] : null;
      const litLine = this.lineLit(line) || new Set();

      // Ad-libs activos -> su TEXTO sobre el miembro Y el miembro TAMBIÉN se ilumina.
      const t = (v ? v.currentTime : 0) + this.LEAD;
      const adMap = {};
      for(const l of (SONG.lyrics || [])){
        const isAd = (l.adlib === true) || (typeof l.adlib === "string" && l.adlib.trim() !== "");
        if(isAd && t >= l.start && t < l.end){
          const txt = this.cleanAdlib((l.original && l.original.trim()) ||
                        (typeof l.adlib === "string" ? l.adlib : "") ||
                        l.romanization || l.english);
          for(const n of (l.members || [])){ if(!adMap[n]) adMap[n] = txt; }
        }
      }
      const lit = new Set(litLine);
      Object.keys(adMap).forEach(n => lit.add(n));   // el que hace el ad-lib también se enciende

      // barrita inferior con el color del que canta (línea + ad-libs)
      if(this.bar){ const bg = this.colorForNames([...lit]); this.bar.style.background = bg || ""; }   // sin cantante -> "" -> gris (CSS)

      if(this.root) this.root.classList.toggle("has-singer", lit.size > 0);
      for(const st of this.strips){
        const singing = lit.has(st.name);
        const mem = (R && R.members) ? R.members.find(x => x.name === st.name) : null;
        const done = !!(mem && mem.done);          // "done" se mantiene aunque cante con el grupo
        st.el.classList.toggle("singing", singing);
        st.el.classList.toggle("done", done);      // done + singing -> gris ILUMINADO (ver CSS)
        const ad = adMap[st.name] || "";
        if(st.adEl){
          if(st.adEl.textContent !== ad) st.adEl.textContent = ad;
          st.adEl.classList.toggle("on", !!ad);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
};
