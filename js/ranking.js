/* ========================================= */
/*             RANKING.JS  v5                 */
/*   Time-exact leaderboard (no drift/lag)    */
/* ========================================= */

/* Bump when the avatar images change, to bust the browser/Pages cache. */
const PHOTO_VER = 4;
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
        if(this.members.length > 10 && leftEl){
            document.body.classList.add("two-side");
            const half = Math.ceil(this.members.length / 2);
            this.columns = [
                { el: leftEl,  members: this.members.slice(0, half) },
                { el: rightEl, members: this.members.slice(half) }
            ];
        } else {
            document.body.classList.remove("two-side");
            if(leftEl) leftEl.innerHTML = "";
            this.columns = [ { el: rightEl, members: this.members } ];
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

    /*
       Build every card ONCE. Cards are absolutely positioned and never
       re-inserted in the DOM again — only their translateY changes, which
       CSS transitions animate. That removes all reflow-related flicker.
    */
    render(){

        this.columns.forEach(col => col.el.innerHTML = "");

        this.columns.forEach(col => col.members.forEach(member => {

            const card = document.createElement("div");
            card.className = "member";
            card.style.setProperty("--accent", member.color);

            card.innerHTML = `
                <div class="member-rank">1</div>
                <img class="member-photo" src="${member.image}?v=${PHOTO_VER}" alt="${member.name}"
                     style="object-position:center ${member.focus ?? 50}%;
                            transform:translateY(-${member.lift ?? 3}px)">

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

            col.el.appendChild(card);
        }));

        this.computeRanks();
        this.layout();

        this.order = this.members.map(m => m.name);

        // Initial placement WITHOUT animation, then enable transitions.
        this.columns.forEach(col => this.place(col, col.members));
        requestAnimationFrame(() => {
            this.members.forEach(m => m.element.classList.add("ready"));
        });
    },

    /* Fill each column while keeping the compact mobile list natural. */
    layout(){
        const isDesktop = window.matchMedia("(min-width:1201px)").matches;
        this.computeRanks();

        this.columns.forEach(col => {
            const n = col.members.length;
            if(isDesktop){
                col.el.style.height = "";
                const style = getComputedStyle(col.el);
                const verticalPadding =
                    parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
                const availableHeight = col.el.clientHeight - verticalPadding;
                col.cardH = Math.max(72,
                    (availableHeight - this.gap * (n - 1)) / n);
                col.members.forEach(m => m.element.style.height = col.cardH + "px");
            } else {
                col.members.forEach(m => m.element.style.height = "");
                col.cardH = Math.max(...col.members.map(m => m.element.offsetHeight));
            }
            col.rowH = col.cardH + this.gap;
            if(!isDesktop) col.el.style.height = (n * col.rowH - this.gap) + "px";

            // keep the current sorted order on resize (don't reset to lineup)
            this.place(col, [...col.members].sort((a,b) => b.seconds - a.seconds));
        });
    },

    /* Position each card at its slot in its column + stacking so risers pass. */
    place(col, sorted){
        const n = col.members.length;
        sorted.forEach((m, i) => {
            m.element.style.setProperty("--rank-y", `${i * col.rowH}px`);
            m.element.style.zIndex = String(n - i);   // top of column sits on top
            m._pos = i;
            if(m.rankElement)
                m.rankElement.textContent = (this.rankMap && this.rankMap[m.name]) || (i + 1);
        });
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

    /* Reorder = re-place within each column; the CSS transform transition animates it. */
    reorder(){
        const globalSorted = [...this.members].sort((a,b) => b.seconds - a.seconds);
        const newOrder = globalSorted.map(m => m.name);
        if(newOrder.join() === this.order.join()) return;

        this.computeRanks();
        this.columns.forEach(col => {
            const colSorted = [...col.members].sort((a,b) => b.seconds - a.seconds);
            // Mark cards that climb so they glide over the ones they pass.
            colSorted.forEach((m, i) => {
                m.element.classList.toggle("rising", (m._pos ?? i) > i);
            });
            this.place(col, colSorted);
        });
        this.order = newOrder;

        // Drop the elevated shadow once the glide settles.
        clearTimeout(this._riseT);
        this._riseT = setTimeout(() => {
            this.members.forEach(m => m.element.classList.remove("rising"));
        }, 620);
    }
};

window.addEventListener("resize", () => {
    if(Ranking.members.length) Ranking.layout();
});
