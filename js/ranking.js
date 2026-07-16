/* ========================================= */
/*             RANKING.JS  v4                 */
/*   Transform-based leaderboard (no reflow)  */
/* ========================================= */

const Ranking = {

    members: [],
    order: [],
    gap: 12,
    cardH: 0,
    rowH: 0,
    pendingTicks: [],
    tickTimer: null,
    maxTotal: 0,

    load(song){

        this.pendingTicks = [];
        this.members = song.members.map(member => ({
            ...member,
            seconds:0,
            percentage:0,
            active:false,
            hasSung:false,
            done:false,
            lastSing:-Infinity
        }));

        this.precompute(song);
        this.render();
        this.startTicking();
    },

    /*
       All timings are known up front, so we can pre-compute two things:
        - maxTotal: the biggest per-member singing total, used as the 100%
          reference for the bars (final leader ends full, rest proportional).
        - lastSing: the last moment each member sings, so once playback passes
          it we can mark that member as "done for the rest of the song".
    */
    precompute(song){
        const totals   = {};
        const lastSing = {};
        song.members.forEach(m => { totals[m.name] = 0; lastSing[m.name] = -Infinity; });

        (song.lyrics || []).forEach(line => {
            let duration, endTime;
            if(Array.isArray(line.voice)){
                duration = line.voice.reduce((sum, [s, e]) => sum + Math.max(0, e - s), 0);
                endTime  = line.voice.reduce((mx, [s, e]) => Math.max(mx, e), -Infinity);
            } else {
                const voiceStart = line.voiceStart ?? line.start;
                const voiceEnd   = line.voiceEnd   ?? line.end;
                duration = Math.max(0, voiceEnd - voiceStart);
                endTime  = voiceEnd;
            }
            if(!isFinite(duration)) duration = 0;

            // Shared lines add to every listed member; "NCT DREAM" isn't a
            // real member, so group lines add to no one (they don't count).
            (line.members || []).forEach(name => {
                if(totals[name] === undefined) return;
                totals[name] += duration;
                if(isFinite(endTime)) lastSing[name] = Math.max(lastSing[name], endTime);
            });
        });

        this.maxTotal = Math.max(0, ...Object.values(totals));
        this.members.forEach(m => m.lastSing = lastSing[m.name]);
    },

    /* A member is "done" once playback has passed the last time they sing. */
    markDone(time){
        this.members.forEach(m =>
            m.done = m.hasSung && isFinite(m.lastSing) && time >= m.lastSing);
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
            if(member.element)
                member.element.classList.toggle("active", member.active);
            if(member.element)
                member.element.classList.toggle("has-sung", member.hasSung);
            if(member.element)
                member.element.classList.toggle("done", member.done && !member.active);
        });
    },

    setActive(names){
        const activeNames = new Set(Array.isArray(names) ? names : [names]);
        this.members.forEach(m => m.active = activeNames.has(m.name));
    },

    addTime(name, delta){
        const member = this.members.find(m => m.name === name);
        if(member){
            member.seconds = Math.round((member.seconds + delta) * 100) / 100;
            member.hasSung = true;
        }
    },

    queueTime(names){
        this.pendingTicks.push(Array.isArray(names) ? names : [names]);
    },

    startTicking(){
        if(this.tickTimer) clearInterval(this.tickTimer);

        this.tickTimer = setInterval(() => {
            if(!this.pendingTicks.length) return;

            const names = this.pendingTicks.shift();
            names.forEach(name => this.addTime(name, .01));
            this.refresh();
        }, 10);
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
    },

    refresh(){
        // Bars scale to the final leader's total (precomputed), so #1 ends at
        // 100% and everyone else stays proportional to them. The seconds shown
        // stay real. Fall back to the current leader if totals aren't known.
        const reference =
            this.maxTotal || Math.max(0, ...this.members.map(m => m.seconds));
        this.members.forEach(m =>
            m.percentage = reference > 0
                ? Math.min(100, (m.seconds / reference) * 100)
                : 0);
        this.updateVisuals();
        this.reorder();
    }
};

window.addEventListener("resize", () => {
    if(Ranking.members.length) Ranking.layout();
});
