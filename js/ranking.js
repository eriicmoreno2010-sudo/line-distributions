/* ========================================= */
/*             RANKING.JS  v5                 */
/*   Time-exact leaderboard (no drift/lag)    */
/* ========================================= */

/* Bump when the avatar images change, to bust the browser/Pages cache. */
const PHOTO_VER = 214;
window.PHOTO_VER = PHOTO_VER;

const Ranking = {

    members: [],
    order: [],
    gap: 12,
    cardH: 0,
    rowH: 0,
    maxTotal: 0,
    clockStarted: false,

    load(song){

        this.members = song.members.map(member => ({
            ...member,
            seconds:0,
            percentage:0,
            active:false,
            hasSung:false,
            done:false,
            intervals:[],
            total:0,
            lastSing:-Infinity
        }));

        this.buildIntervals(song);
        this.buildColumns();
        this.render();
        this.startClock();
    },

    /* One column normally; two side columns when the group is large (>10) so
       every member fits around the centered video. Splits members in half. */
    buildColumns(){
        const rightEl = UI.elements.ranking;
        const leftEl  = document.getElementById("ranking-left");
        const n = this.members.length;
        // Sub-unidad/solista: dimensionar como si fueran 8 (tarjetas normales) y colocar
        // arriba (no enormes ni centradas). effN se usa para el tamaño de tarjeta.
        this.subunit = !!(typeof SONG !== "undefined" && SONG && SONG.subunit);
        const effN = this.subunit ? Math.max(n, 8) : n;
        // Small groups (<=7) have taller cards -> bigger names look better (CSS uses this)
        document.body.classList.toggle("few-members", effN <= 7);
        // GRUPO de verdad (no sub-unidad ni solista) con 4/5/6 miembros: la tarjeta
        // es grande y el contador se ve pequeño -> agrándalo un poco (4 > 5 > 6).
        const bigCounter = !this.subunit && n >= 4 && n <= 10;
        for(let k = 4; k <= 10; k++) document.body.classList.toggle("gcount-" + k, bigCounter && n === k);
        // On phones there's no room for two side columns — always use a single
        // (scrollable) column, even for big groups.
        const mobile = window.matchMedia("(max-width:900px)").matches;
        if(n > 10 && leftEl && !mobile){
            document.body.classList.add("two-side");
            this.twoSide = true;
            this.half = Math.ceil(n / 2);
            // Left column = global ranks 1..half, right = the rest. Cards move
            // between columns as ranks change (a true global leaderboard).
            this.columns = [ { el: leftEl, cap: this.half }, { el: rightEl, cap: n - this.half } ];
        } else {
            document.body.classList.remove("two-side");
            if(leftEl) leftEl.innerHTML = "";
            this.twoSide = false;
            this.half = n;
            this.columns = [ { el: rightEl, cap: n } ];
        }
    },

    /* Global rank (1..n by seconds) so each card shows its true position even
       when the members are split across two columns. */
    computeRanks(){
        const sorted = [...this.members].sort((a,b) => b.seconds - a.seconds);
        this.rankMap = {};
        sorted.forEach((m,i) => this.rankMap[m.name] = i + 1);
    },

    /*
       Build, per member, the list of [start,end] intervals they actually sing
       (from voice segments — which may name their own member — or start/end).
       "NCT DREAM" isn't a real member, so group lines credit no one.
       Also derive each member's total (100% bar reference) and last sing time.
    */
    buildIntervals(song){
        const map = {};
        this.members.forEach(m => map[m.name] = []);
        const add = (name, s, e) => { if(map[name] && e > s) map[name].push([s, e]); };

        (song.lyrics || []).forEach(line => {
            if(Array.isArray(line.voice)){
                line.voice.forEach(seg => {
                    const who = seg[2] ? (Array.isArray(seg[2]) ? seg[2] : [seg[2]]) : line.members;
                    who.forEach(n => add(n, seg[0], seg[1]));
                });
            } else {
                const s = line.voiceStart ?? line.start;
                const e = line.voiceEnd   ?? line.end;
                (line.members || []).forEach(n => add(n, s, e));
            }
        });

        this.members.forEach(m => {
            m.intervals = (map[m.name] || []).filter(iv => isFinite(iv[0]) && isFinite(iv[1]));
            m.total     = m.intervals.reduce((a, iv) => a + (iv[1] - iv[0]), 0);
            m.lastSing  = m.intervals.reduce((mx, iv) => Math.max(mx, iv[1]), -Infinity);
        });
        this.maxTotal = Math.max(0, ...this.members.map(m => m.total));
    },

    /* Exact leaderboard state at time t — a pure function of the video clock,
       so it never lags and stays correct after any seek. */
    updateAt(t){
        const linesMode = (typeof SONG !== "undefined" && SONG && SONG.rankLines);
        this.members.forEach(m => {
            let sec = 0, active = false;
            for(const iv of m.intervals){
                if(t >= iv[1]) sec += iv[1] - iv[0];          // whole interval already sung
                else if(t > iv[0]){ sec += t - iv[0]; active = true; }  // currently in it
            }
            m._sec       = sec;
            m.seconds    = Math.round(sec * 100) / 100;
            m.active     = active;
            m.hasSung    = sec > 0;
            m.done       = m.hasSung && !active && isFinite(m.lastSing) && t >= m.lastSing;
        });
        // Ancho de barra: normal -> respecto al TOTAL FINAL máximo (crece hasta 100% al final).
        // lines (Moonlight): respecto al máximo ACTUAL -> el líder SIEMPRE llega al 100%.
        const ref = linesMode
            ? Math.max(1e-6, ...this.members.map(m => m._sec))
            : (this.maxTotal || 1);
        this.members.forEach(m => { m.percentage = Math.min(100, (m._sec / ref) * 100); });
        this.updateVisuals();
        this.reorder();
        if(this.det) this.tweenTick(t);
    },

    /* Export-only: ease every card's Y toward its current slot as a pure function
       of the video clock, so the glide is smooth at any frame rate (the CSS
       transform transition doesn't animate a var()-driven change under the
       virtual clock). Mirrors the live spring (slight overshoot). */
    tweenTick(t){
        const DUR = 0.55;
        const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1;
            return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
        this.members.forEach(m => {
            if(m._slotY == null) return;
            if(m._tweenTo !== m._slotY){                 // slot changed → start a new tween
                m._tweenFrom  = (m._curY != null) ? m._curY : m._slotY;
                m._tweenTo    = m._slotY;
                m._tweenStart = t;
            }
            let cur;
            if(m._tweenStart == null){                   // at rest (never tweened yet)
                cur = m._slotY;
            } else {
                let p = (t - m._tweenStart) / DUR;
                if(p < 0) p = 0; else if(p > 1) p = 1;
                cur = m._tweenFrom + (m._tweenTo - m._tweenFrom) * easeOutBack(p);
            }
            m._curY = cur;
            if(m.element) m.element.style.setProperty("--rank-y", cur.toFixed(2) + "px");

            // Active pulse (scale) — also JS-driven here: with the transform
            // transition off in det mode the CSS --card-scale change would snap.
            const st = m.active ? 1.04 : 1.0;
            if(m._scaleTo !== st){
                m._scaleFrom  = (m._curScale != null) ? m._curScale : st;
                m._scaleTo    = st;
                m._scaleStart = t;
            }
            let cs = st;
            if(m._scaleStart != null){
                let q = (t - m._scaleStart) / DUR;
                if(q < 0) q = 0; else if(q > 1) q = 1;
                cs = m._scaleFrom + (m._scaleTo - m._scaleFrom) * easeOutBack(q);
            }
            m._curScale = cs;
            if(m.element) m.element.style.setProperty("--card-scale", cs.toFixed(4));

            // Énfasis (tamaño de nombre+tiempo) — también JS aquí: con la transición
            // de transform desactivada en det, el paso 1.14→1.0 al DEJAR de cantar
            // se teletransportaba (tirón). Ahora se anima suave, frame a frame.
            const em = m.active ? 1.06 : 1.0;
            if(m._emphTo !== em){
                m._emphFrom  = (m._curEmph != null) ? m._curEmph : em;
                m._emphTo    = em;
                m._emphStart = t;
            }
            let ce = em;
            if(m._emphStart != null){
                let w = (t - m._emphStart) / DUR;
                if(w < 0) w = 0; else if(w > 1) w = 1;
                ce = m._emphFrom + (m._emphTo - m._emphFrom) * easeOutBack(w);
            }
            m._curEmph = ce;
            if(m.element) m.element.style.setProperty("--emph", ce.toFixed(4));
        });
    },

    /* Drive the leaderboard from the video clock every frame (smooth 60fps). */
    startClock(){
        if(this.clockStarted) return;
        this.clockStarted = true;
        const video = document.getElementById("video");
        const loop = () => {
            if(video && typeof SONG !== "undefined" && SONG && SONG.duration)
                this.updateAt(video.currentTime);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    },

    /* Build every card once; placeAll() then distributes them across columns
       by GLOBAL rank and moves them between columns as ranks change. */
    render(){

        // Deterministic-animation mode (frame-by-frame export): the CSS transition
        // on transform does NOT tick when the value comes from a var(--rank-y) under
        // the virtual clock (it teleports). So in export we drive the card Y in JS
        // (time-based easing, every frame) and disable the CSS transform transition.
        this.det = !!(typeof window !== "undefined" && window.__DET_ANIM);
        if(this.det && !this._detStyle){
            const st = document.createElement("style");
            st.textContent = "#ranking .member.ready{transition:box-shadow .18s var(--ease)," +
                "background-color .18s var(--ease),border-color .18s var(--ease) !important}" +
                // El énfasis (scale) de nombre/tiempo lo drivea JS (tweenTick) en export;
                // la transición CSS de transform se teletransporta bajo el reloj virtual.
                "#ranking .member-name,#ranking .member-time{transition:color .15s var(--ease) !important}";
            document.head.appendChild(st);
            this._detStyle = true;
        }

        this.columns.forEach(col => col.el.innerHTML = "");

        this.members.forEach(member => {

            const card = document.createElement("div");
            card.className = "member";
            card.style.setProperty("--accent", member.color);

            card.innerHTML = `
                <div class="member-rank">1</div>
                <span class="member-photo-box">
                    <span class="beat-halo"></span>
                    <span class="member-photo-wrap">
                        <img class="member-photo" src="${member.image}?v=${PHOTO_VER}" alt="${member.name}"
                             style="object-position:center ${member.focus ?? 50}%">
                    </span>
                </span>

                <div class="member-info">
                    <div class="member-head">
                        <span class="member-name">${member.name}</span>
                        <span class="member-time">0.00s</span>
                    </div>
                    <div class="member-bar">
                        <div class="member-progress"></div>
                    </div>
                </div>
            `;

            member.element         = card;
            member.rankElement     = card.querySelector(".member-rank");
            member.timeElement     = card.querySelector(".member-time");
            member.progressElement = card.querySelector(".member-progress");
            member.photoEl         = card.querySelector(".member-photo");
            member.photoWrap       = card.querySelector(".member-photo-wrap");
            member._col = undefined;

            this.columns[0].el.appendChild(card);   // scratch parent; placeAll re-homes it
        });

        this.layout();                              // computes cardH/rowH + initial placeAll
        this.order = this.members.map(m => m.name);
        requestAnimationFrame(() => {
            this.members.forEach(m => m.element.classList.add("ready"));
        });
    },

    /* Compute each column's card height from its fixed capacity, then place. */
    layout(){
        const isDesktop = window.matchMedia("(min-width:1201px)").matches;

        this.columns.forEach(col => {
            const n = col.cap;
            // en subunidad/solista: repartir como si hubiera 8 (tarjetas normales, arriba)
            const div = this.subunit ? Math.max(n, 8) : n;
            if(isDesktop){
                col.el.style.height = "";
                const style = getComputedStyle(col.el);
                const verticalPadding =
                    parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
                const availableHeight = col.el.clientHeight - verticalPadding;
                col.cardH = Math.max(72,
                    (availableHeight - this.gap * (div - 1)) / div);
            } else {
                col.cardH = Math.max(72, ...this.members.map(m => m.element.offsetHeight || 92));
            }
            col.rowH = col.cardH + this.gap;
            if(!isDesktop) col.el.style.height = (n * col.rowH - this.gap) + "px";
        });

        // Make photos as large as the card allows (fill it) without overflowing.
        // Single column: trim the card's vertical padding so the circle nearly
        // fills the row. Two-side keeps its compact 100px look.
        const minCardH = Math.min(...this.columns.map(c => c.cardH || 92));
        const isTwo = this.twoSide;
        // Two columns (>10, e.g. SEVENTEEN): 100. Single column: 88 for 7–10
        // members, a bit larger (100) for small groups of 5–6 so they don't look tiny.
        const cap = isTwo ? 100 : (this.members.length <= 6 ? 100 : 88);
        this.photoSize = Math.max(44, Math.min(cap, Math.round(minCardH - 12)));
        this.members.forEach(m => {
            if(m.photoWrap){
                m.photoWrap.style.width = this.photoSize + "px";
                m.photoWrap.style.height = this.photoSize + "px";
            }
            if(m.photoEl) m.photoEl.style.transform = "none";   // no lift so it centres & fills
            m.element.style.gridTemplateColumns = "32px " + this.photoSize + "px 1fr";
            m.element.style.paddingTop = "5px";
            m.element.style.paddingBottom = "5px";
        });

        this.placeAll(false);
        this.fitNames();
    },

    /* Shrink any name that would overflow its cell so it's as big as possible
       (up to the CSS size) but never truncated with an ellipsis. */
    fitNames(){
        requestAnimationFrame(() => {
            this.members.forEach(m => {
                const el = m.element && m.element.querySelector(".member-name");
                if(!el) return;
                el.style.fontSize = "";                 // back to the CSS base
                let s = parseFloat(getComputedStyle(el).fontSize) || 44;
                let guard = 0;
                while(el.scrollWidth > el.clientWidth + 1 && s > 26 && guard++ < 60){
                    s -= 1; el.style.fontSize = s + "px";
                }
            });
        });
    },

    /* Place every card by GLOBAL rank: ranks 1..half in the left column,
       the rest in the right. Same-column moves glide; column changes dissolve. */
    placeAll(animate){
        const sorted = [...this.members].sort((a,b) => b.seconds - a.seconds);
        this.rankMap = {};
        // Arranque = casi todos todavía en ~0.00 (la mayoría por debajo de 0.5s). En ese
        // caso el cruce hace la COLUMNA ENTERA (se ve bien); ya cantando y muy juntos,
        // el cruce es corto y más rápido.
        const churn = sorted.length > 0 &&
            sorted.filter(x => x.seconds < 0.5).length > sorted.length * 0.5;

        sorted.forEach((m, gi) => {
            this.rankMap[m.name] = gi + 1;

            let colIdx, row;
            if(this.twoSide && gi >= this.half){ colIdx = 1; row = gi - this.half; }
            else { colIdx = 0; row = gi; }
            const col = this.columns[colIdx];

            // Ya está CRUZANDO de columna: no arranques otro cruce. En su lugar
            // REDIRIGE el glide al hueco correcto sobre la marcha (transición .switching),
            // así la tarjeta llega directa a su sitio y NO pega un salto al terminar.
            if(m._switching){
                if(m.rankElement) m.rankElement.textContent = gi + 1;
                m._switchGi = gi;   // mantener el nº final al día: si el rango sigue
                                    // mejorando durante el cruce, el "clean" no debe
                                    // dejar un número viejo (p. ej. VERNON 7 en vez de 4).
                if(colIdx === m._switchCol && row !== m._switchRow){
                    m._switchRow = row;
                    if(!this.det) m.element.style.setProperty("--rank-y", `${row * col.rowH}px`);
                    // el destino cambió: que el clon siga hasta que la real llegue de verdad
                    if(m._doClean){ clearTimeout(m._cleanT); m._cleanT = setTimeout(m._doClean, m._switchDur || 320); }
                }
                return;
            }

            const changingCol = (m.element.parentNode !== col.el);

            // Animated column change → glide off/enter. Con COOLDOWN anti-parpadeo:
            // si acaba de cambiar de columna hace muy poco (segundos casi empatados,
            // o el arranque con todos a 0.00), NO vuelve a cruzar todavía -> se queda
            // donde está y no "desaparece" una y otra vez.
            if(animate && changingCol && m._col !== undefined){
                if(performance.now() - (m._switchDoneAt || 0) < 450){
                    if(m.rankElement) m.rankElement.textContent = gi + 1;   // solo actualiza el nº
                    return;                                                  // se queda en su columna
                }
                this.switchCard(m, colIdx, row, gi, churn);
                return;
            }

            if(changingCol){                         // initial / non-animated placement
                m.element.classList.add("no-anim");
                col.el.appendChild(m.element);
            } else if(animate){
                m.element.classList.toggle("rising", (m._pos ?? row) > row);
            }
            m.element.style.height = col.cardH ? col.cardH + "px" : "";
            const slotY = row * col.rowH;
            if(this.det){
                m._slotY = slotY;                       // tweenTick eases --rank-y toward this
                if(!animate){                           // initial/instant placement: snap
                    m._curY = slotY; m._tweenTo = slotY;
                    m.element.style.setProperty("--rank-y", `${slotY}px`);
                }
            } else {
                m.element.style.setProperty("--rank-y", `${slotY}px`);
            }
            m.element.style.zIndex = String(col.cap - row);
            if(m.rankElement) m.rankElement.textContent = gi + 1;
            m._pos = row;
            m._col = colIdx;
        });

        // Re-enable animation next frame for any instant (no-anim) placements.
        requestAnimationFrame(() => {
            this.members.forEach(m => { if(!m._switching) m.element.classList.remove("no-anim"); });
        });

        if(animate){
            clearTimeout(this._riseT);
            this._riseT = setTimeout(() => {
                this.members.forEach(m => m.element.classList.remove("rising"));
            }, 620);
        }
    },

    /* Column change SIMULTÁNEO: la tarjeta REAL entra por el borde OPUESTO de la
       nueva columna a la vez que un CLON fantasma sale por el borde de la vieja.
       Ambas arrancan en el MISMO frame y con la MISMA duración, así que en cuanto
       una empieza a irse la otra YA está entrando por el otro lado -> nunca hay
       hueco invisible (esto es "que si un pixel se mete por arriba, ya aparezca
       esa fila en el otro lado"). El clon se recorta con overflow:hidden del panel. */
    switchCard(m, colIdx, row, gi, churn){
        // Si ya está cambiando, solo actualiza el destino (no arranca otro cambio).
        if(m._switching){
            m._switchRow = row; m._switchGi = gi;
            if(m.rankElement) m.rankElement.textContent = gi + 1;
            return;
        }

        const src  = this.columns[m._col];
        const dest = this.columns[colIdx];
        const el   = m.element;
        const improving = colIdx < m._col;                // sube (izq. es mejor) vs. baja

        if(m.rankElement) m.rankElement.textContent = gi + 1;

        // Export determinista (sin transiciones CSS): colócala directa, sin clon.
        if(this.det || !src){
            dest.el.appendChild(el);
            el.style.height = dest.cardH ? dest.cardH + "px" : "";
            const y = row * dest.rowH;
            el.style.setProperty("--rank-y", `${y}px`);
            m._slotY = y; m._curY = y; m._tweenTo = y;
            el.style.zIndex = String(dest.cap - row);
            m._pos = row; m._col = colIdx; m._switchDoneAt = performance.now();
            return;
        }

        m._switching = true; m._switchCol = colIdx; m._switchRow = row; m._switchGi = gi;
        // ARRANQUE (casi todos en 0.00): cruce COMPLETO, recorre la columna entera y se
        // ve bien. YA CANTANDO y muy juntos: cruce CORTO (2 filas) y más rápido.
        const dur = churn ? 460 : 220;
        m._switchDur = dur;
        const speedClass = churn ? "switch-full" : "switch-fast";

        // ---- CLON: imagen de la tarjeta que se va; SALE RÁPIDO (más que la real) para
        //      que se vea como UNA sola tarjeta, no dos. No hereda la duración del cruce. ----
        const ghost = el.cloneNode(true);
        ghost.classList.add("switch-ghost");
        ghost.classList.remove("no-anim", "rising");
        // Solo la que ADELANTA (mejora) va por ENCIMA de todo; la que baja mantiene su
        // z normal ("como cuando no cantan").
        if(improving) ghost.classList.add("switch-top");
        else ghost.style.zIndex = String(src.cap - (m._pos ?? 0));
        ghost.style.setProperty("--rank-y", `${(m._pos ?? 0) * src.rowH}px`);   // arranca en su hueco actual
        src.el.appendChild(ghost);
        void ghost.offsetWidth;                                                 // fija el punto de partida
        const exitY = improving ? -src.rowH : src.cap * src.rowH;               // arriba si sube, abajo si baja
        ghost.style.setProperty("--rank-y", `${exitY}px`);
        m._ghost = ghost;      // updateVisuals lo mantiene IGUAL que el real (iluminado, mismos s)

        // ---- TARJETA REAL ----
        el.classList.remove("rising");
        el.classList.add("no-anim", "switching", speedClass);
        if(improving) el.classList.add("switch-top");         // la que adelanta, por encima
        else el.style.zIndex = String(dest.cap - row);        // la que baja, z normal
        dest.el.appendChild(el);
        el.style.height = dest.cardH ? dest.cardH + "px" : "";
        // Arranque -> entra desde el BORDE lejano (columna entera). Ya cantando -> 2 filas.
        const enterY = churn
            ? (improving ? dest.cap * dest.rowH : -dest.rowH)
            : (improving ? (row + 2) * dest.rowH : (row - 2) * dest.rowH);
        el.style.setProperty("--rank-y", `${enterY}px`);
        m._pos = row; m._col = colIdx;
        void el.offsetWidth;                                                    // fija el punto de entrada
        el.classList.remove("no-anim");
        el.style.setProperty("--rank-y", `${row * dest.rowH}px`);               // desliza hasta su hueco

        // El clon se va SOLO cuando la real ha llegado del TODO a su hueco. Y NO de golpe:
        // se funde y se borra ~1s después (durante ese segundo la copia ya no se ve). Si
        // por el camino cambia de fila (empates), placeAll reprograma esta limpieza.
        m._doClean = () => {
            const r = m._switchRow;
            const g = m._ghost; m._ghost = null;
            if(g){ g.classList.add("ghost-out"); setTimeout(() => g.remove(), 1000); }
            el.classList.remove("switching", "switch-fast", "switch-full", "switch-top");
            el.style.zIndex = String(dest.cap - r);
            if(m.rankElement) m.rankElement.textContent = m._switchGi + 1;
            m._switching = false;
            m._switchCol = undefined;
            m._switchDoneAt = performance.now();          // cooldown anti-rebote
        };
        clearTimeout(m._cleanT);
        m._cleanT = setTimeout(m._doClean, dur + 10);
    },

    /* Update text, bars and active glow in place (no layout change). */
    updateVisuals(){
        this.members.forEach(member => {
            if(member.timeElement)
                member.timeElement.textContent = member.seconds.toFixed(2) + "s";
            if(member.progressElement)
                member.progressElement.style.width = member.percentage + "%";
            if(member.element){
                member.element.classList.toggle("active", member.active);
                member.element.classList.toggle("has-sung", member.hasSung);
                member.element.classList.toggle("done", member.done && !member.active);
            }
            // El CLON del cambio de columna va SIEMPRE IGUAL que el real: mismos
            // segundos, misma barra y misma iluminación (si canta, brilla).
            const g = member._ghost;
            if(g){
                const gt = g.querySelector(".member-time");
                if(gt) gt.textContent = member.seconds.toFixed(2) + "s";
                const gp = g.querySelector(".member-progress");
                if(gp) gp.style.width = member.percentage + "%";
                g.classList.toggle("active", member.active);
                g.classList.toggle("has-sung", member.hasSung);
                g.classList.toggle("done", member.done && !member.active);
            }
        });
    },

    /* Reorder = re-place everyone by global rank; transitions animate it. */
    reorder(){
        const sorted = [...this.members].sort((a,b) => b.seconds - a.seconds);
        const newOrder = sorted.map(m => m.name);
        if(newOrder.join() === this.order.join()) return;
        this.placeAll(true);
        this.order = newOrder;
    }
};

window.addEventListener("resize", () => {
    if(Ranking.members.length) Ranking.layout();
});
