/*
=========================================
Lyrics  v3
=========================================
*/

// All the elements that live inside the ad-lib panel (used for fading).
const ADLIB_PARTS =
    ".adlib-member, .adlib-original, .adlib-roman, .adlib-english, .adlib-text";

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
        // Halo built from ALL member colors, one soft blob each across the width.
        const groupGlow = isGroupLine
            ? SONG.members.map((m, i, arr) => {
                  const pos = arr.length > 1 ? 8 + (i / (arr.length - 1)) * 84 : 50;
                  return `radial-gradient(42% 60% at ${pos}% 45%, ` +
                         `color-mix(in srgb, ${m.color} 22%, transparent), transparent 70%)`;
              }).join(", ")
            : "";

        // A line can wrap part of its text in **...** to show ONLY that
        // fragment in the members' gradient (e.g. JENO sings the line, JAEMIN
        // only "let's go"); the rest stays in the primary member's colour.
        const hasPartial = !isGroupLine &&
            [line.original, line.romanization, line.english]
                .some(t => t && t.includes("**"));

        const sharedGradient =
            `linear-gradient(90deg, ${singers.map(s => s.color).join(", ")})`;

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

        // fade out
        this.group().forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });
        e.adlibs.querySelectorAll(ADLIB_PARTS).forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });

        setTimeout(() => {

            // Paint text: normal lines use one colour; **marked** fragments
            // (partial lines) render the marked part in the members' gradient.
            const escapeHtml = s => (s || "")
                .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            const clearPaint = el => {
                el.style.background = "";
                el.style.webkitBackgroundClip = "";
                el.style.backgroundClip = "";
            };
            const paintText = (el, text) => {
                text = text || "";
                clearPaint(el);
                if(hasPartial && text.includes("**")){
                    el.innerHTML = text.split("**").map((chunk, i) => i % 2
                        ? `<span style="background:${sharedGradient};-webkit-background-clip:text;background-clip:text;color:transparent">${escapeHtml(chunk)}</span>`
                        : `<span style="color:${accent}">${escapeHtml(chunk)}</span>`
                    ).join("");
                } else {
                    el.textContent = text;
                    el.style.color = accent;
                }
            };

            clearPaint(e.member);
            if(isAdlib){
                e.member.textContent = "";
            } else if(hasPartial){
                e.member.textContent = line.members.join("  &  ");
                e.member.style.background = sharedGradient;
                e.member.style.webkitBackgroundClip = "text";
                e.member.style.backgroundClip = "text";
                e.member.style.color = "transparent";
            } else {
                e.member.textContent = line.members.join("  &  ");
                e.member.style.color = accent;
            }
            paintText(e.original, isAdlib ? "" : line.original);
            paintText(e.roman,    isAdlib ? "" : line.romanization);
            paintText(e.english,  isAdlib ? "" : line.english);

            e.adlibs.replaceChildren();
            if(line.adlib){
                // The ad-lib panel mirrors the main panel: name + original +
                // romanization + translation, plus the ad-lib vocalization.
                // Only non-empty fields are shown.
                const parts = [];
                const addPart = (cls, text) => {
                    if(!text) return;
                    const el2 = document.createElement("div");
                    el2.className = cls + " fade-out";
                    el2.textContent = text;
                    parts.push(el2);
                };
                addPart("adlib-member",   line.members.join("  &  "));
                addPart("adlib-original", line.original);
                addPart("adlib-roman",    line.romanization);
                addPart("adlib-english",  line.english);
                // adlib can be `true` (just a marker) or a string (the
                // vocalisation, e.g. "Woah"). Only show text when it's a string.
                addPart("adlib-text", typeof line.adlib === "string" ? line.adlib : "");

                e.adlibs.append(...parts);

                // fade the ad-lib in, mirroring the main lyric crossfade
                requestAnimationFrame(() => {
                    parts.forEach(el2 => {
                        el2.classList.remove("fade-out");
                        el2.classList.add("fade-in");
                    });
                });
            }

            // paint everything with the singing member's color
            e.section.style.setProperty("--accent", accent);
            e.section.style.setProperty("--accent-secondary", secondaryAccent);
            e.section.style.setProperty("--group-glow", groupGlow);
            e.section.style.setProperty("--group-gradient", groupGradient);
            e.section.classList.toggle("singing", !isAdlib);
            e.section.classList.toggle("multi-member", isSharedLine);
            e.section.classList.toggle("group", isGroupLine);
            e.adlibs.style.setProperty("--accent", accent);
            e.adlibs.style.setProperty("--accent-secondary", secondaryAccent);
            e.adlibs.style.setProperty("--group-glow", groupGlow);
            e.adlibs.style.setProperty("--group-gradient", groupGradient);
            e.adlibs.classList.toggle("singing", isAdlib);
            e.adlibs.classList.toggle("multi-member", isSharedLine);
            e.adlibs.classList.toggle("group", isGroupLine);

            // (Text colour/paint already applied above via paintText.)
            // (Card highlight is driven by the voice in Engine.updateActive.)

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
        e.adlibs.querySelectorAll(ADLIB_PARTS).forEach(el => {
            el.classList.add("fade-out");
            el.classList.remove("fade-in");
        });

        setTimeout(() => {

            e.member.textContent   = "";
            e.original.textContent = "";
            e.roman.textContent    = "";
            e.english.textContent  = "";
            e.adlibs.replaceChildren();

            // reset accent colors and any partial-line gradient paint
            [e.member, e.original, e.roman, e.english].forEach(el => {
                el.style.color = "";
                el.style.background = "";
                el.style.webkitBackgroundClip = "";
                el.style.backgroundClip = "";
            });
            e.adlibs.style.removeProperty("--accent");
            e.section.style.removeProperty("--accent-secondary");
            e.adlibs.style.removeProperty("--accent-secondary");

            e.section.style.removeProperty("--group-gradient");
            e.adlibs.style.removeProperty("--group-gradient");
            e.section.style.removeProperty("--group-glow");
            e.adlibs.style.removeProperty("--group-glow");

            e.section.classList.remove("singing");
            e.section.classList.remove("multi-member");
            e.section.classList.remove("group");
            e.adlibs.classList.remove("singing");
            e.adlibs.classList.remove("multi-member");
            e.adlibs.classList.remove("group");

            this.group().forEach(el => el.classList.remove("fade-out"));

        }, 180);

        // (Card highlight is driven by the voice in Engine.updateActive.)
    }
};
