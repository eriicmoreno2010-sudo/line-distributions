/*
=========================================
Lyrics  v3
=========================================
*/

const Lyrics = {

    currentIndex: -1,
    lastLineTime: undefined,

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

    group(){
        // Ad-libs panel is intentionally NOT included so it doesn't blink
        const e = this.els();
        return [e.member, e.original, e.roman, e.english];
    },

    update(currentTime){

        if(!SONG || !SONG.lyrics) return;

        const lyrics = SONG.lyrics;

        for(let i = 0; i < lyrics.length; i++){
            const line = lyrics[i];

            if(currentTime >= line.start && currentTime < line.end){

                if(this.currentIndex !== i){
                    this.currentIndex = i;
                    this.show(line);
                }

                this.lastLineTime = undefined;   // active line -> reset gap timer
                return;
            }
        }

        // No active line: only clear after a >1s silence
        if(this.lastLineTime === undefined){
            this.lastLineTime = currentTime;
        }
        if(currentTime - this.lastLineTime > 1){
            this.clear();
        }
    },

    show(line){

        const e = this.els();
        const singer = line.members[0];

        // resolve accent color from the member singing
        const member = SONG.members.find(m => m.name === singer);
        const accent = member ? member.color : "var(--accent)";

        // fade out
        this.group().forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });

        setTimeout(() => {

            e.member.textContent   = line.members.join("  &  ");
            e.original.textContent = line.original || "";
            e.roman.textContent    = line.romanization || "";
            e.english.textContent  = line.english || "";
            e.adlibs.textContent   = line.adlib || "";

            // paint everything with the singing member's color
            e.section.style.setProperty("--accent", accent);
            e.section.classList.add("singing");
            e.member.style.color   = accent;
            e.original.style.color = accent;
            e.roman.style.color    = `color-mix(in srgb, ${accent} 78%, white)`;
            e.english.style.color  = `color-mix(in srgb, ${accent} 55%, white)`;

            Ranking.setActive(singer);
            Ranking.updateVisuals();

            // fade in
            this.group().forEach(el => {
                el.classList.remove("fade-out");
                el.classList.add("fade-in");
            });

        }, 180);
    },

    clear(){

        if(this.currentIndex === -1) return;

        this.currentIndex = -1;
        this.lastLineTime = undefined;

        const e = this.els();

        this.group().forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });

        setTimeout(() => {

            e.member.textContent   = "";
            e.original.textContent = "";
            e.roman.textContent    = "";
            e.english.textContent  = "";
            e.adlibs.textContent   = "";

            // reset accent colors
            e.member.style.color   = "";
            e.original.style.color = "";
            e.roman.style.color    = "";
            e.english.style.color  = "";

            e.section.classList.remove("singing");

            this.group().forEach(el => el.classList.remove("fade-out"));

        }, 180);

        Ranking.setActive("");
        Ranking.updateVisuals();   // update in place — no full rebuild (no flicker)
    }
};
