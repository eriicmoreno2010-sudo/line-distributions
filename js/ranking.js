/* ========================================= */
/*             RANKING.JS  v5                 */
/*   Time-exact leaderboard (no drift/lag)    */
/* ========================================= */

/* Bump when the avatar images change, to bust the browser/Pages cache. */
const PHOTO_VER = 42;
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
        const ref = this.maxTotal || 1;
        this.members.forEach(m => {
            let sec = 0, active = false;
            for(const iv of m.intervals){
                if(t >= iv[1]) sec += iv[1] - iv[0];          // whole interval already sung
                else if(t > iv[0]){ sec += t - iv[0]; active = true; }  // currently in it
            }
            m.seconds    = Math.round(sec * 100) / 100;
            m.percentage = Math.min(100, (sec / ref) * 100);
            m.active     = active;
            m.hasSung    = sec > 0;
            m.done       = m.hasSung && !active && isFinite(m.lastSing) && t >= m.lastSing;
        });
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
                "background-color .18s var(--ease),border-color .18s var(--ease) !important}";
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
                <span class="member-photo-wrap">
                    <img class="member-photo" src="${member.image}?v=${PHOTO_VER}" alt="${member.name}"
                         style="object-position:center ${member.focus ?? 50}%">
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
        // fills the row. Two-side keeps its compact 72px look (unchanged).
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

        sorted.forEach((m, gi) => {
            this.rankMap[m.name] = gi + 1;

            let colIdx, row;
            if(this.twoSide && gi >= this.half){ colIdx = 1; row = gi - this.half; }
            else { colIdx = 0; row = gi; }
            const col = this.columns[colIdx];
            const changingCol = (m.element.parentNode !== col.el);

            // Animated column change → soft two-phase dissolve (leave it where it is).
            if(animate && changingCol && m._col !== undefined){
                this.switchCard(m, colIdx, row, gi);
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

    /* Column change as a GLIDE (not a teleport): the card slides off its
       current column edge (up when climbing to the left column, down when
       dropping to the right one) and slides into the other column from the
       opposite edge — so it reads as continuous motion. */
    switchCard(m, colIdx, row, gi){
        // Tight race guard: at 60fps a card that's climbing/dropping past many
        // near-tied members fires a reorder EVERY frame. If it's already gliding
        // toward THIS same column, don't restart the fade (that would keep it
        // parked off-edge at opacity 0 forever = invisible). Just remember the
        // latest slot it should land in and let the in-flight animation finish.
        if(m._switching && m._switchCol === colIdx){
            m._switchRow = row; m._switchGi = gi;
            if(m.rankElement) m.rankElement.textContent = gi + 1;
            return;
        }

        const dest = this.columns[colIdx];
        const src  = this.columns[m._col];
        const improving = colIdx < m._col;              // moving to the left (better) column
        m._switching = true;
        m._switchCol = colIdx;
        m._switchRow = row; m._switchGi = gi;
        m.element.classList.remove("rising", "no-anim");
        m.element.classList.add("switching");           // transition: transform + opacity
        m.element.style.zIndex = "60";                  // float above while travelling
        if(m.rankElement) m.rankElement.textContent = gi + 1;

        // Phase 1: glide off the current column's edge (up if climbing, down if
        // dropping) and fade out.
        const exitY = improving ? -src.rowH : src.cap * src.rowH;
        m.element.style.setProperty("--rank-y", `${exitY}px`);
        m.element.style.opacity = "0";

        clearTimeout(m._switchT); clearTimeout(m._cleanT);
        m._switchT = setTimeout(() => {
            // Phase 2: drop into the other column just past the opposite edge
            // (no animation), then glide into its slot and fade back in. Use the
            // LATEST target slot — it may have moved while we were fading out.
            const r = m._switchRow, g = m._switchGi;
            m.element.classList.add("no-anim");
            dest.el.appendChild(m.element);
            m.element.style.height = dest.cardH ? dest.cardH + "px" : "";
            const enterY = improving ? (r + 1) * dest.rowH : (r - 1) * dest.rowH;
            m.element.style.setProperty("--rank-y", `${enterY}px`);
            m.element.style.zIndex = String(dest.cap - r);
            m._pos = r;
            m._col = colIdx;
            if(m.rankElement) m.rankElement.textContent = g + 1;
            void m.element.offsetWidth;                  // reflow so the start pos is instant
            m.element.classList.remove("no-anim");       // re-enable transitions
            m.element.style.setProperty("--rank-y", `${r * dest.rowH}px`);   // glide into slot
            m.element.style.opacity = "1";
            m._cleanT = setTimeout(() => {
                m.element.classList.remove("switching");
                m.element.style.opacity = "";
                m._switching = false;
                m._switchCol = undefined;
            }, 170);
        }, 120);
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
