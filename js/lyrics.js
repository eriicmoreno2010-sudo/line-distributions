/*
=========================================
Lyrics  v3
=========================================
*/

const Lyrics = {

    currentIndex: -1,

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

                return;
            }
        }

        // No active line -> the member stopped singing: clear right away
        this.clear();
    },

    show(line){

        const e = this.els();
        const isAdlib = Boolean(line.adlib);

        // A "group" line (e.g. members: ["NCT DREAM"]) is sung by everyone:
        // it gets a blended gradient of all member colors and never counts.
        const isGroupLine = line.members.includes(SONG.group);

        const singers = line.members
            .map(name => SONG.members.find(member => member.name === name))
            .filter(Boolean);

        const groupGradient = isGroupLine
            ? `linear-gradient(90deg, ${SONG.members.map(m => m.color).join(", ")})`
            : "";

        let accent, secondaryAccent, isSharedLine;
        if(isGroupLine){
            const colors = SONG.members.map(m => m.color);
            accent = colors[0];
            secondaryAccent = colors[colors.length - 1];
            isSharedLine = false;
        } else {
            accent = singers[0] ? singers[0].color : "var(--accent)";
            secondaryAccent = singers[1] ? singers[1].color : accent;
            isSharedLine = singers.length > 1;
        }

        // fade out
        this.group().forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });
        e.adlibs.querySelectorAll(".adlib-member, .adlib-text").forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });

        setTimeout(() => {

            e.member.textContent   = isAdlib ? "" : line.members.join("  &  ");
            e.original.textContent = isAdlib ? "" : line.original || "";
            e.roman.textContent    = isAdlib ? "" : line.romanization || "";
            e.english.textContent  = isAdlib ? "" : line.english || "";

            e.adlibs.replaceChildren();
            if(line.adlib){
                const adlibMember = document.createElement("div");
                adlibMember.className = "adlib-member fade-out";
                adlibMember.textContent = line.members.join("  &  ");

                const adlibText = document.createElement("div");
                adlibText.className = "adlib-text fade-out";
                adlibText.textContent = line.adlib;

                e.adlibs.append(adlibMember, adlibText);

                // fade the ad-lib in, mirroring the main lyric crossfade
                requestAnimationFrame(() => {
                    [adlibMember, adlibText].forEach(el => {
                        el.classList.remove("fade-out");
                        el.classList.add("fade-in");
                    });
                });
            }

            // paint everything with the singing member's color
            e.section.style.setProperty("--accent", accent);
            e.section.style.setProperty("--accent-secondary", secondaryAccent);
            e.section.style.setProperty("--group-gradient", groupGradient);
            e.section.classList.toggle("singing", !isAdlib);
            e.section.classList.toggle("multi-member", isSharedLine);
            e.section.classList.toggle("group", isGroupLine);
            e.adlibs.style.setProperty("--accent", accent);
            e.adlibs.style.setProperty("--accent-secondary", secondaryAccent);
            e.adlibs.style.setProperty("--group-gradient", groupGradient);
            e.adlibs.classList.toggle("singing", isAdlib);
            e.adlibs.classList.toggle("multi-member", isSharedLine);
            e.adlibs.classList.toggle("group", isGroupLine);
            e.member.style.color   = accent;
            e.original.style.color = accent;
            e.roman.style.color    = accent;
            e.english.style.color  = accent;

            Ranking.setActive(line.members);
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

        const e = this.els();

        this.group().forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });
        e.adlibs.querySelectorAll(".adlib-member, .adlib-text").forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });

        setTimeout(() => {

            e.member.textContent   = "";
            e.original.textContent = "";
            e.roman.textContent    = "";
            e.english.textContent  = "";
            e.adlibs.replaceChildren();

            // reset accent colors
            e.member.style.color   = "";
            e.original.style.color = "";
            e.roman.style.color    = "";
            e.english.style.color  = "";
            e.adlibs.style.removeProperty("--accent");
            e.section.style.removeProperty("--accent-secondary");
            e.adlibs.style.removeProperty("--accent-secondary");

            e.section.style.removeProperty("--group-gradient");
            e.adlibs.style.removeProperty("--group-gradient");

            e.section.classList.remove("singing");
            e.section.classList.remove("multi-member");
            e.section.classList.remove("group");
            e.adlibs.classList.remove("singing");
            e.adlibs.classList.remove("multi-member");
            e.adlibs.classList.remove("group");

            this.group().forEach(el => el.classList.remove("fade-out"));

        }, 180);

        Ranking.setActive("");
        Ranking.updateVisuals();   // update in place — no full rebuild (no flicker)
    }
};
