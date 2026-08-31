/*
=========================================
Lyrics  v4
Two independent tracks: the CENTRAL panel and the AD-LIB panel are shown
separately, so a central line and an ad-lib can be on screen at the same time.
=========================================
*/

// All the elements that live inside the ad-lib panel (used for fading).
const ADLIB_PARTS =
    ".adlib-member, .adlib-original, .adlib-roman, .adlib-english, .adlib-text";

function isAdlibLine(l){
    return (l.adlib === true) || (typeof l.adlib === "string" && l.adlib.trim() !== "");
}

/* `**...**` marks a substring sung by the shared members (gradient paint).
   Only treat it as a marker when the `**` come in PAIRS (odd number of chunks
   after splitting). This keeps censored profanity like "f***ing" — which has a
   lone, unpaired `**` — as literal text instead of breaking the line. */
function hasPairedMarker(t){
    return typeof t === "string" && t.includes("**") && (t.split("**").length % 2 === 1);
}

/* Join singer names: "A" · "A & B" · "A, B & C" · "A, B, C & D" ... */
function joinNames(names){
    names = (names || []).filter(Boolean);
    if(names.length <= 1) return names[0] || "";
    if(names.length === 2) return names[0] + "  &  " + names[1];
    return names.slice(0, -1).join(", ") + "  &  " + names[names.length - 1];
}

/* Shrink a lyric line's font until it fits on ONE row (detected by height). */
function fitField(el){
    if(!el || !(el.textContent || "").trim()) return;
    el.style.fontSize = "";                 // back to the CSS base
    let s = parseFloat(getComputedStyle(el)?.fontSize) || 30;
    let guard = 0;
    // one line ≈ 42px (min-height); a wrapped line is ~84px -> shrink past 52px.
    // Floor at 22px so it never gets tiny/illegible — if it still doesn't fit it
    // just wraps to two lines (readable) instead of shrinking into nothing.
    while(el.offsetHeight > 52 && s > 22 && guard++ < 40){ s -= 1; el.style.fontSize = s + "px"; }
}

/* Shrink an ad-lib line's font until it fits within maxW on a single row.
   (Ad-lib lines are centred/hug-content, so we fit by WIDTH, not height.)
   Skipped for empty text or text with explicit "\n" line breaks. */
function fitOneLine(el, maxW){
    if(!el) return;
    const txt = (el.textContent || "").trim();
    if(!txt || txt.includes("\n") || !maxW) return;
    el.style.whiteSpace = "nowrap";
    el.style.fontSize = "";                 // back to the CSS base
    let s = parseFloat(getComputedStyle(el)?.fontSize) || 30;
    let guard = 0;
    // Floor at 22px so it stays legible. If it still overflows at the floor,
    // let it wrap (readable two lines) instead of clipping a tiny single line.
    while(el.scrollWidth > maxW && s > 22 && guard++ < 100){ s -= 1; el.style.fontSize = s + "px"; }
    if(el.scrollWidth > maxW) el.style.whiteSpace = "";   // give up on one line -> wrap
}

/* Ajusta original/roman/inglés al MISMO tamaño (y en UNA línea): baja el tamaño
   de las TRES a la vez hasta que la más larga quepa. Así el roman NUNCA queda
   más pequeño/fino que las demás. */
function fitFieldsEqual(els, maxW){
    els = (els || []).filter(el => el && (el.textContent || "").trim());
    if(!els.length || !maxW) return;
    els.forEach(el => { el.style.whiteSpace = "nowrap"; el.style.fontSize = ""; });
    let s = 30, guard = 0;
    const fits = () => els.every(el => el.scrollWidth <= maxW);
    while(!fits() && s > 16 && guard++ < 80){ s -= 1; els.forEach(el => el.style.fontSize = s + "px"); }
    if(!fits()) els.forEach(el => el.style.whiteSpace = "");   // aún no cabe -> deja que envuelva
}

/* Luminancia de un color hex (0..1) para decidir si es "oscuro". */
function _hexLum(h){
    try{
        h = String(h).trim().replace("#", "");
        if(h.length === 3) h = h.split("").map(c => c + c).join("");
        const n = parseInt(h, 16);
        return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    }catch(e){ return 1; }
}
/* Deja el color REAL; solo aclara (mezcla con blanco) los MUY oscuros para que
   lean sobre el panel negro. Los vivos no se tocan. */
function brightIfDark(c){
    if(typeof c !== "string" || c[0] !== "#") return c;
    const L = _hexLum(c);
    if(L >= 0.5) return c;
    const mix = Math.round((0.5 - L) / 0.5 * 55);   // 0..55%
    return mix > 4 ? `color-mix(in srgb, ${c} ${100 - mix}%, #fff)` : c;
}

const Lyrics = {

    centralIndex: -1,
    adlibIndex: -1,
    _adlibKey: "",              // which ad-lib line(s) are currently shown
    lastCentralMembers: null,   // for name persistence across same-singer lines

    els(){
        return {
            section:  document.getElementById("lyrics-section"),
            member:   document.getElementById("current-member"),
            original: document.getElementById("original"),
            roman:    document.getElementById("romanized"),
            english:  document.getElementById("english"),
            adlibs:   document.getElementById("adlibs-section")
        };
    },

    /* Colours/gradients derived from a line's members. */
    colorsFor(line){
        const isGroupLine = line.members.includes(SONG.group);
        const singers = line.members
            .map(name => SONG.members.find(m => m.name === name))
            .filter(Boolean);

        // Brighten each stop (mix with white) so the whole-group rainbow stays
        // legible on the black panel — the raw colours include dark ones that
        // vanish. Kept vivid enough to still read as each member's colour.
        // Group/multi gradient stops: on the dark theme brighten (mix white) so the
        // rainbow reads on black; on the light theme darken (mix black) so it reads on white.
        const lightTheme = typeof document !== "undefined" && document.body.classList.contains("theme-light");
        const lift = c => lightTheme
            ? `color-mix(in srgb, ${c} 82%, #000)`   // tema claro: oscurecer un poco para que lea sobre blanco
            : c;                                       // tema oscuro: color CRUDO/real de cada miembro (líneas de grupo)
        const groupGradient = isGroupLine
            ? `linear-gradient(90deg, ${SONG.members.map(m => lift(m.color)).join(", ")})`
            : "";
        const groupGlow = isGroupLine
            ? SONG.members.map((m, i, arr) => {
                  const pos = arr.length > 1 ? 8 + (i / (arr.length - 1)) * 84 : 50;
                  return `radial-gradient(42% 60% at ${pos}% 45%, ` +
                         `color-mix(in srgb, ${m.color} 13%, transparent), transparent 70%)`;
              }).join(", ")
            : "";

        const hasPartial = !isGroupLine &&
            [line.original, line.romanization, line.english]
                .some(hasPairedMarker);
        // A CSS linear-gradient needs >=2 colour stops; with a single singer we
        // duplicate the colour so the gradient stays valid (otherwise the whole
        // background is dropped and the name, painted with color:transparent,
        // becomes INVISIBLE on solo lines that have a **...** highlight).
        const singerCols = singers.map(s => s.color);
        const sharedGradient =
            `linear-gradient(90deg, ${(singerCols.length === 1 ? [singerCols[0], singerCols[0]] : singerCols).join(", ")})`;
        // The `**...**` highlight: for a solo line it means "everyone joins in on
        // this word" -> paint it with the whole-group rainbow; for a line already
        // shared by several members, keep it as those members' gradient.
        const groupAllGradient =
            `linear-gradient(90deg, ${SONG.members.map(m => lift(m.color)).join(", ")})`;
        const markGradient = singers.length <= 1 ? groupAllGradient : sharedGradient;

        // Glow made from EVERY singer's colour (so 3+ members all show, not just 2).
        const membersGlow = singers.length
            ? singers.map((s, i, arr) => {
                  const pos = arr.length > 1 ? 8 + (i / (arr.length - 1)) * 84 : 50;
                  return `radial-gradient(42% 60% at ${pos}% 45%, ` +
                         `color-mix(in srgb, ${s.color} 14%, transparent), transparent 70%)`;
              }).join(", ")
            : "";

        // Colores CRUDOS/reales de cada miembro en todo (grupo y solitario).
        let accent, secondaryAccent, isSharedLine;
        if(isGroupLine){
            const colors = SONG.members.map(m => m.color);
            accent = colors[0];
            secondaryAccent = colors[colors.length - 1];
            isSharedLine = false;
        } else {
            accent = singers[0] ? singers[0].color : "var(--accent)";
            secondaryAccent = singers[1] ? singers[1].color : accent;
            isSharedLine = !hasPartial && singers.length > 1;
        }
        return { isGroupLine, groupGradient, groupGlow, hasPartial,
                 sharedGradient, markGradient, membersGlow, accent, secondaryAccent, isSharedLine };
    },

    /* Each frame: pick the active CENTRAL line and the active AD-LIB line
       independently, so both panels can be filled at the same time. */
    // When a line ends the TEXT disappears right away, but the member NAME is
    // kept through short gaps and only clears after HOLD seconds of silence —
    // so on runs with small gaps (e.g. NCT DREAM) the name stays until they stop.
    HOLD: 1.0,
    centralTextCleared: false,

    update(currentTime){
        if(!SONG || !SONG.lyrics) return;
        const lyrics = SONG.lyrics;

        // Frame-by-frame export: the CSS fade transition doesn't render under the
        // virtual clock (text pops). Disable it and drive opacity/slide in JS.
        if(this.det == null){
            this.det = !!(typeof window !== "undefined" && window.__DET_ANIM);
            if(this.det){
                const st = document.createElement("style");
                st.textContent = "#lyrics-section .fade-in,#lyrics-section .fade-out," +
                    "#adlibs-section .fade-in,#adlibs-section .fade-out{transition:none !important}";
                document.head.appendChild(st);
            }
        }

        let ci = -1; const ais = [];
        for(let i = 0; i < lyrics.length; i++){
            const l = lyrics[i];
            if(currentTime >= l.start && currentTime < l.end){
                if(isAdlibLine(l)) ais.push(i);       // ALL active ad-libs (can be 2+)
                else if(ci === -1) ci = i;
            }
        }

        // CENTRAL — active line shows name+text. When it ends, look AHEAD to the
        // next central line: if that gap is < HOLD, the text goes but the name is
        // kept to bridge it; if the gap is >= HOLD, name+text disappear together
        // right away (no lone name lingering for a second).
        if(ci !== -1){
            if(ci !== this.centralIndex){ this.centralIndex = ci; this.showCentral(lyrics[ci]); }
        } else if(this.centralIndex !== -1){
            const shown = lyrics[this.centralIndex];
            let next = null;
            for(let k = 0; k < lyrics.length; k++){
                const l = lyrics[k];
                if(!isAdlibLine(l) && l.start >= shown.end - 1e-3 && (!next || l.start < next.start)) next = l;
            }
            const gap = next ? next.start - shown.end : Infinity;
            const sameSinger = next && next.members.join("|") === shown.members.join("|");
            // Bridge with the name ONLY if the SAME singer continues within <HOLD;
            // otherwise (different singer, long gap, or seek back) clear name+text together.
            if(currentTime < shown.start || gap >= this.HOLD || !sameSinger){
                this.clearCentral();
            } else if(!this.centralTextCleared){
                this.clearCentralText();
                this.centralTextCleared = true;
            }
        }

        // AD-LIB — mensaje flotante que sube y se mete en el panel central
        this.updateAdlib(currentTime, ais, lyrics);

        if(this.det) this.tweenFades(currentTime);
    },

    /* Export-only: ease each lyric element's opacity+slide toward the target its
       fade-in/fade-out class implies, every frame, so the crossfade is smooth
       under the virtual clock (CSS transitions don't render there). */
    tweenFades(t){
        const DUR = 0.1;
        const ease = x => 1 - Math.pow(1 - x, 3);          // easeOutCubic
        const els = document.querySelectorAll(
            "#lyrics-section .fade-in,#lyrics-section .fade-out," +
            "#adlibs-section .fade-in,#adlibs-section .fade-out");
        els.forEach(el => {
            const target = el.classList.contains("fade-out") ? 0 : 1;
            if(el._opTo !== target){
                el._opFrom  = (el._op != null) ? el._op : target;
                el._opTo    = target;
                el._opStart = t;
            }
            let o = target;
            if(el._opStart != null){
                let p = (t - el._opStart) / DUR;
                if(p < 0) p = 0; else if(p > 1) p = 1;
                o = el._opFrom + (el._opTo - el._opFrom) * ease(p);
            }
            el._op = o;
            el.style.opacity = o.toFixed(3);
            el.style.transform = "translateY(" + ((1 - o) * 10).toFixed(2) + "px)";
        });
    },

    /* ---------------- CENTRAL panel ---------------- */
    showCentral(line){
        const e = this.els();
        const c = this.colorsFor(line);
        this.centralTextCleared = false;

        const membersKey = line.members.join("|");
        const sameName = this.lastCentralMembers === membersKey;
        this.lastCentralMembers = membersKey;

        const fadeEls = sameName
            ? [e.original, e.roman, e.english]
            : [e.member, e.original, e.roman, e.english];

        fadeEls.forEach(el => { el.classList.add("fade-out"); el.classList.remove("fade-in"); });

        setTimeout(() => {
            const escapeHtml = s => (s || "")
                .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            const clearPaint = el => {
                el.style.background = ""; el.style.webkitBackgroundClip = ""; el.style.backgroundClip = "";
            };
            // A **...** chunk may name who sings it: "word@Nicholas" (one member),
            // "word@Nicholas,Taki" (a couple → their gradient), "word@todos" or plain
            // "word" (no @) → the whole group / the line's shared colour.
            const memberColor = name => {
                const m = SONG.members.find(mm => mm.name.toLowerCase() === name.toLowerCase());
                return m ? m.color : null;
            };
            const markedSpan = chunk => {
                let display = chunk, colors = null;
                const at = chunk.lastIndexOf("@");
                if(at > 0){
                    const names = chunk.slice(at + 1).split(",").map(s => s.trim()).filter(Boolean);
                    if(names.length && names.every(n => /^(all|todos|grupo)$/i.test(n))){
                        colors = SONG.members.map(m => m.color); display = chunk.slice(0, at);
                    } else if(names.length){
                        const cs = names.map(memberColor);
                        if(cs.every(Boolean)){ colors = cs; display = chunk.slice(0, at); }
                    }
                }
                if(colors && colors.length === 1)
                    return `<span style="color:${colors[0]}">${escapeHtml(display)}</span>`;
                const bg = colors ? `linear-gradient(90deg, ${colors.join(", ")})` : c.markGradient;
                // sin sombra oscura en el texto con degradado (la apagaba y ocultaba el color real)
                return `<span style="background:${bg};-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none">${escapeHtml(display)}</span>`;
            };
            const paintText = (el, text) => {
                text = text || "";
                clearPaint(el);
                if(c.hasPartial && hasPairedMarker(text)){
                    el.innerHTML = text.split("**").map((chunk, i) => i % 2
                        ? markedSpan(chunk)
                        : `<span style="color:${c.accent}">${escapeHtml(chunk)}</span>`
                    ).join("");
                } else {
                    el.textContent = text;
                    el.style.color = c.accent;
                }
            };

            if(!sameName){
                clearPaint(e.member);
                if(c.hasPartial){
                    e.member.textContent = joinNames(line.members);
                    e.member.style.background = c.sharedGradient;
                    e.member.style.webkitBackgroundClip = "text";
                    e.member.style.backgroundClip = "text";
                    e.member.style.color = "transparent";
                    e.member.style.textShadow = "none";   // degradado -> sin sombra oscura
                } else {
                    e.member.textContent = joinNames(line.members);
                    e.member.style.color = c.accent;
                    e.member.style.textShadow = "";        // sólido -> sombra normal
                }
            }
            // Don't repeat identical text 3× (e.g. pure-English lines): show it
            // once, centred. Korean lines (3 distinct) still show all three.
            const raw = [line.original, line.romanization, line.english].map(t => (t||"").trim());
            const uniq = raw.filter((t,i) => t && raw.indexOf(t) === i);
            let so="", sr="", se="";
            if(uniq.length <= 1){ sr = uniq[0] || ""; }
            else if(uniq.length === 2){ so = uniq[0]; sr = uniq[1]; }
            else { so = raw[0]; sr = raw[1]; se = raw[2]; }
            paintText(e.original, so);
            paintText(e.roman,    sr);
            paintText(e.english,  se);
            requestAnimationFrame(() => { fitFieldsEqual([e.original, e.roman, e.english], e.section.clientWidth - 72); });

            e.section.style.setProperty("--accent", c.accent);
            e.section.style.setProperty("--accent-secondary", c.secondaryAccent);
            e.section.style.setProperty("--group-glow", c.groupGlow);
            e.section.style.setProperty("--group-gradient", c.groupGradient);
            e.section.style.setProperty("--members-gradient", c.sharedGradient);
            e.section.style.setProperty("--members-glow", c.membersGlow);
            e.section.classList.add("singing");
            e.section.classList.toggle("multi-member", c.isSharedLine);
            e.section.classList.toggle("group", c.isGroupLine);

            fadeEls.forEach(el => { el.classList.remove("fade-out"); el.classList.add("fade-in"); });
        }, 100);
    },

    /* Clear ONLY the lyric text (keep the member name showing during the gap). */
    clearCentralText(){
        const e = this.els();
        const fadeEls = [e.original, e.roman, e.english];
        fadeEls.forEach(el => { el.classList.add("fade-out"); el.classList.remove("fade-in"); });
        setTimeout(() => {
            fadeEls.forEach(el => {
                el.textContent = "";
                el.style.color = ""; el.style.background = "";
                el.style.webkitBackgroundClip = ""; el.style.backgroundClip = "";
                el.classList.remove("fade-out");
            });
        }, 100);
    },

    clearCentral(){
        if(this.centralIndex === -1) return;
        this.centralIndex = -1;
        this.lastCentralMembers = null;
        this.centralTextCleared = false;

        const e = this.els();
        const fadeEls = [e.member, e.original, e.roman, e.english];
        fadeEls.forEach(el => { el.classList.add("fade-out"); el.classList.remove("fade-in"); });

        setTimeout(() => {
            fadeEls.forEach(el => {
                el.textContent = "";
                el.style.color = ""; el.style.background = "";
                el.style.webkitBackgroundClip = ""; el.style.backgroundClip = "";
            });
            // Keep the colour vars so the halo fades out in the member's colour
            // (they get overwritten by the next line).
            e.section.classList.remove("singing");
            e.section.classList.remove("multi-member");
            e.section.classList.remove("group");
            fadeEls.forEach(el => el.classList.remove("fade-out"));
        }, 100);
    },

    /* ---------------- AD-LIB (mensaje flotante) ---------------- */
    _alKey: "",

    // Cada tarjeta se anima por su cuenta (entra desde abajo, sale hacia arriba).
    // El contenedor NO se mueve -> quitar una no descuadra a la otra.
    updateAdlib(t, ais, lyrics){
        const msg = document.getElementById("adlib-msg");
        if(!msg) return;
        const key = ais.join(",");
        if(key === this._alKey) return;
        this._alKey = key;
        this.syncAdlibBoxes(msg, ais, lyrics);
    },

    /* Construye la tarjeta de UN ad-lib (con su color propio). */
    buildAdlibBox(line){
        const c = this.colorsFor(line);
        const box = document.createElement("div"); box.className = "al-box";
        box.style.setProperty("--al-accent", c.accent);
        // borde: degradado real -> grupo = arcoíris de todos; dúo/coro = colores de los que cantan; solista = su color
        const borderPaint = c.isGroupLine ? c.groupGradient
                          : (c.isSharedLine ? c.sharedGradient
                          : `linear-gradient(90deg, ${c.accent}, ${c.accent})`);
        box.style.setProperty("--al-border", borderPaint);
        const paint = el => {
            if(c.isGroupLine){ el.style.background = c.groupGradient; el.style.webkitBackgroundClip = "text"; el.style.backgroundClip = "text"; el.style.color = "transparent"; }
            else if(c.isSharedLine){ el.style.background = c.sharedGradient; el.style.webkitBackgroundClip = "text"; el.style.backgroundClip = "text"; el.style.color = "transparent"; }
            else el.style.color = c.accent;
        };
        const inner = document.createElement("div"); inner.className = "al-inner";   // lo que colapsa el grid-rows
        const nm = document.createElement("div"); nm.className = "al-name"; nm.textContent = joinNames(line.members);
        paint(nm); inner.appendChild(nm);
        const raw = [line.original, line.romanization, line.english].map(x => (x || "").trim());
        const uniq = raw.filter((x, i) => x && raw.indexOf(x) === i);
        const shown = uniq.length ? uniq : (typeof line.adlib === "string" && line.adlib.trim() ? [line.adlib.trim()] : []);
        shown.forEach(txt => { const d = document.createElement("div"); d.className = "al-text"; d.textContent = txt; paint(d); inner.appendChild(d); });
        box.appendChild(inner);
        return box;
    },

    /* Diff de tarjetas: mantiene las activas, quita las que acaban (colapsan) y
       añade las nuevas colapsadas -> al expandirse EMPUJAN a las demás (sin salto). */
    syncAdlibBoxes(msg, ais, lyrics){
        const want = ais.map(String);
        const GAP = 16;
        // SALEN: los que ya no tocan -> se van (fade + un pelín hacia arriba). NO se
        // tocan los demás -> los que quedan NO se mueven.
        Array.from(msg.children).forEach(box => {
            if(want.indexOf(box.dataset.i) === -1 && !box._leaving){
                box._leaving = true;
                box.style.opacity = "0";
                box.style.transform = "translateY(-22px)";
                setTimeout(() => box.remove(), 420);
            }
        });
        // ENTRAN: crea los nuevos (invisibles); todavía sin colocar.
        ais.forEach(i => {
            const existing = Array.from(msg.querySelectorAll('.al-box[data-i="' + i + '"]'));
            if(existing.some(b => !b._leaving)) return;     // ya hay una activa para este ad-lib
            existing.forEach(b => b.remove());              // reaparece justo al salir -> recrear
            const box = this.buildAdlibBox(lyrics[i]); box.dataset.i = String(i);
            box.style.opacity = "0"; box.style.transform = "translateY(0)"; box._fresh = true;
            msg.appendChild(box);
        });
        // RECOLOCA TODA la pila de abajo hacia arriba. Así NUNCA se solapan, aunque
        // entren VARIOS ad-libs a la vez (Renjun+Jaemin+Chenle) — cada uno tiene su hueco.
        let acc = 0;
        Array.from(msg.children).forEach(b => {
            if(b._leaving) return;
            const h = b.offsetHeight || 90;   // fuente fija; la tarjeta se ensancha sola (CSS width:max-content)
            const target = acc;
            if(b._fresh){
                b._fresh = false;
                b.style.bottom = (-h - 10) + "px";          // empieza debajo (recortado) y sube a su sitio
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    b.style.bottom = target + "px"; b.style.opacity = "1";
                }));
            } else {
                b.style.bottom = target + "px";             // se desplaza suave si su hueco cambió
            }
            b.dataset.bottom = String(target);
            acc += h + GAP;
        });
    },

    /* Encoge la fuente de cada ad-lib para que SIEMPRE quepa en 1 renglón. */
    fitAdlibText(box){
        const avail = box.clientWidth - 48;   // ancho útil (menos padding/borde)
        if(avail <= 20) return;
        box.querySelectorAll(".al-text").forEach(el => {
            el.style.fontSize = "";
            let s = parseFloat(getComputedStyle(el).fontSize) || 24, guard = 0;
            while(el.scrollWidth > avail && s > 12 && guard++ < 60){ s -= 1; el.style.fontSize = s + "px"; }
        });
    },

    clearAdlib(){
        const msg = document.getElementById("adlib-msg");
        this._alKey = "";
        if(msg) msg.replaceChildren();
    },

    /* Clear both panels (used at startup). */
    clear(){
        this.clearCentral();
        this.clearAdlib();
    }
};
