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

    load(song){

        this.pendingTicks = [];
        this.members = song.members.map(member => ({
            ...member,
            seconds:0,
            percentage:0,
            active:false,
            hasSung:false
        }));

        this.render();
        this.startTicking();
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
                <img class="member-photo" src="${member.image}" alt="${member.name}">
                <div class="member-info">
                    <div class="member-head">
                        <span class="member-name">${member.name}</span>
                        <span class="member-time">0s</span>
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
                member.timeElement.textContent = Math.floor(member.seconds) + "s";
            if(member.progressElement)
                member.progressElement.style.width = member.percentage + "%";
            if(member.element)
                member.element.classList.toggle("active", member.active);
            if(member.element)
                member.element.classList.toggle("has-sung", member.hasSung);
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
            this.refresh(SONG.duration);
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

    refresh(totalDuration){
        this.members.forEach(m => m.percentage = (m.seconds / totalDuration) * 100);
        this.updateVisuals();
        this.reorder();
    }
};

window.addEventListener("resize", () => {
    if(Ranking.members.length) Ranking.layout();
});
