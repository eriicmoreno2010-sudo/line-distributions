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
      const ad   = document.createElement("div"); ad.className = "cstrip-adlib";   // ad-lib COMO TEXTO sobre el miembro
      const nm   = document.createElement("div"); nm.className = "cstrip-name"; nm.textContent = m.name;

      s.appendChild(img); s.appendChild(grad); s.appendChild(ad); s.appendChild(nm);
      top.appendChild(s);
      this.strips.push({ name: m.name, el: s, adEl: ad });
    });
    root.appendChild(top);

    // --- borde "papel roto" entre las fotos y la letra ---
    root.appendChild(this.buildTorn());

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
    window.addEventListener("resize", () => this.fitNames());
    this.loop();
  },

  // SVG de borde "papel roto" (jagged), relleno del color del panel de letra.
  buildTorn(){
    const NS = "http://www.w3.org/2000/svg", W = 1920, H = 44;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "coded-torn");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    let d = "M 0 " + H + " L 0 " + (H * 0.55).toFixed(1);
    let x = 0;
    while(x < W){
      x = Math.min(W, x + 20 + Math.random() * 26);
      const y = (5 + Math.random() * (H * 0.6)).toFixed(1);
      d += " L " + x.toFixed(1) + " " + y;
    }
    d += " L " + W + " " + H + " Z";
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
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
      let s = 52;
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
      const lit = this.lineLit(line) || new Set();

      // Ad-libs activos -> su TEXTO se pinta sobre el miembro que los canta.
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

      if(this.root) this.root.classList.toggle("has-singer", lit.size > 0);
      for(const st of this.strips){
        const singing = lit.has(st.name);
        const mem = (R && R.members) ? R.members.find(x => x.name === st.name) : null;
        const done = !!(mem && mem.done) && !singing;
        st.el.classList.toggle("singing", singing);
        st.el.classList.toggle("done", done);
        const ad = adMap[st.name] || "";
        if(st.adEl.textContent !== ad) st.adEl.textContent = ad;
        st.el.classList.toggle("has-adlib", !!ad);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
};
