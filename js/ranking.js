/* ========================================= */
/*             RANKING.JS  v5                 */
/*   Time-exact leaderboard (no drift/lag)    */
/* ========================================= */

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
        this.render();
        this.startClock();
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

        const container = UI.elements.ranking;
        container.innerHTML = "";

        this.members.forEach(member => {

            const card = document.createElement("div");
            card.className = "member";
            card.style.setProperty("--accent", member.color);

            card.innerHTML = `
                <div class="member-rank">1</div>
                <img class="member-photo" src="${member.image}" alt="${member.name}"
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

            container.appendChild(card);
        });

        this.layout();

        this.order = this.members.map(m => m.name);

        // Initial placement WITHOUT animation, then enable transitions.
        this.place(this.members);
        requestAnimationFrame(() => {
            this.members.forEach(m => m.element.classList.add("ready"));
        });
    },

    /* Fill the desktop panel while keeping the compact mobile list natural. */
    layout(){
        const container = UI.elements.ranking;
        const isDesktop = window.matchMedia("(min-width:1201px)").matches;

        if(isDesktop){
            container.style.height = "";

            const style = getComputedStyle(container);
            const verticalPadding =
                parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
            const availableHeight = container.clientHeight - verticalPadding;

            this.cardH = Math.max(
                72,
                (availableHeight - this.gap * (this.members.length - 1)) /
                    this.members.length
            );

            this.members.forEach(m => {
                m.element.style.height = this.cardH + "px";
            });
        } else {
            this.members.forEach(m => {
                m.element.style.height = "";
            });
            this.cardH = Math.max(...this.members.map(m => m.element.offsetHeight));
        }

        this.rowH = this.cardH + this.gap;

        if(!isDesktop){
            container.style.height =
                (this.members.length * this.rowH - this.gap) + "px";
        }

        this.place(this.members);
    },

    /* Position each card at its slot + set stacking so risers pass over. */
    place(sorted){
        const n = this.members.length;
        sorted.forEach((m, i) => {
            m.element.style.setProperty("--rank-y", `${i * this.rowH}px`);
            m.element.style.zIndex = String(n - i);   // #1 sits on top
            if(m.rankElement) m.rankElement.textContent = i + 1;
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

    /* Reorder = just re-place; the CSS transform transition animates it. */
    reorder(){
        const sorted   = [...this.members].sort((a,b) => b.seconds - a.seconds);
        const newOrder = sorted.map(m => m.name);
        if(newOrder.join() === this.order.join()) return;

        // Mark cards that climb so they glide over the others.
        sorted.forEach((m, i) => {
            const prev = this.order.indexOf(m.name);
            m.element.classList.toggle("rising", prev > i);
        });

        this.place(sorted);
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
