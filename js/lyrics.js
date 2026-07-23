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

const Lyrics = {

    centralIndex: -1,
    adlibIndex: -1,
    lastCentralMembers: null,   // for name persistence across same-singer lines
    lastAdlibMembers: null,

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

        const groupGradient = isGroupLine
            ? `linear-gradient(90deg, ${SONG.members.map(m => m.color).join(", ")})`
            : "";
        const groupGlow = isGroupLine
            ? SONG.members.map((m, i, arr) => {
                  const pos = arr.length > 1 ? 8 + (i / (arr.length - 1)) * 84 : 50;
                  return `radial-gradient(42% 60% at ${pos}% 45%, ` +
                         `color-mix(in srgb, ${m.color} 22%, transparent), transparent 70%)`;
              }).join(", ")
            : "";

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
        return { isGroupLine, groupGradient, groupGlow, hasPartial,
                 sharedGradient, accent, secondaryAccent, isSharedLine };
    },

    /* Each frame: pick the active CENTRAL line and the active AD-LIB line
       independently, so both panels can be filled at the same time. */
    // When a line ends the TEXT disappears right away, but the member NAME is
    // kept through short gaps and only clears after HOLD seconds of silence —
    // so on runs with small gaps (e.g. NCT DREAM) the name stays until they stop.
    HOLD: 1.0,
    centralTextCleared: false,
    adlibTextCleared: false,

    update(currentTime){
        if(!SONG || !SONG.lyrics) return;
        const lyrics = SONG.lyrics;

        let ci = -1, ai = -1;
        for(let i = 0; i < lyrics.length; i++){
            const l = lyrics[i];
            if(currentTime >= l.start && currentTime < l.end){
                if(isAdlibLine(l)){ if(ai === -1) ai = i; }
                else            { if(ci === -1) ci = i; }
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

        // AD-LIB — same look-ahead rule as the central lyrics
        if(ai !== -1){
            if(ai !== this.adlibIndex){ this.adlibIndex = ai; this.showAdlib(lyrics[ai]); }
        } else if(this.adlibIndex !== -1){
            const shown = lyrics[this.adlibIndex];
            let next = null;
            for(let k = 0; k < lyrics.length; k++){
                const l = lyrics[k];
                if(isAdlibLine(l) && l.start >= shown.end - 1e-3 && (!next || l.start < next.start)) next = l;
            }
            const gap = next ? next.start - shown.end : Infinity;
            const sameSinger = next && next.members.join("|") === shown.members.join("|");
            if(currentTime < shown.start || gap >= this.HOLD || !sameSinger){
                this.clearAdlib();
            } else if(!this.adlibTextCleared){
                this.clearAdlibText();
                this.adlibTextCleared = true;
            }
        }
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
            const paintText = (el, text) => {
                text = text || "";
                clearPaint(el);
                if(c.hasPartial && text.includes("**")){
                    el.innerHTML = text.split("**").map((chunk, i) => i % 2
                        ? `<span style="background:${c.sharedGradient};-webkit-background-clip:text;background-clip:text;color:transparent">${escapeHtml(chunk)}</span>`
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
                    e.member.textContent = line.members.join("  &  ");
                    e.member.style.background = c.sharedGradient;
                    e.member.style.webkitBackgroundClip = "text";
                    e.member.style.backgroundClip = "text";
                    e.member.style.color = "transparent";
                } else {
                    e.member.textContent = line.members.join("  &  ");
                    e.member.style.color = c.accent;
                }
            }
            paintText(e.original, line.original);
            paintText(e.roman,    line.romanization);
            paintText(e.english,  line.english);

            e.section.style.setProperty("--accent", c.accent);
            e.section.style.setProperty("--accent-secondary", c.secondaryAccent);
            e.section.style.setProperty("--group-glow", c.groupGlow);
            e.section.style.setProperty("--group-gradient", c.groupGradient);
            e.section.classList.add("singing");
            e.section.classList.toggle("multi-member", c.isSharedLine);
            e.section.classList.toggle("group", c.isGroupLine);

            fadeEls.forEach(el => { el.classList.remove("fade-out"); el.classList.add("fade-in"); });
        }, 180);
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
        }, 180);
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
        }, 180);
    },

    /* ---------------- AD-LIB panel ---------------- */
    showAdlib(line){
        const e = this.els();
        const c = this.colorsFor(line);
        this.adlibTextCleared = false;

        const membersKey = line.members.join("|");
        const sameName = this.lastAdlibMembers === membersKey;
        this.lastAdlibMembers = membersKey;

        // Persistent name element + a text container (mirrors the central panel),
        // so the name doesn't flicker/rebuild on every ad-lib.
        let nameEl = e.adlibs.querySelector(".adlib-member");
        let textWrap = e.adlibs.querySelector(".adlib-textwrap");
        if(!nameEl || !textWrap){
            e.adlibs.replaceChildren();
            nameEl = document.createElement("div"); nameEl.className = "adlib-member";
            textWrap = document.createElement("div"); textWrap.className = "adlib-textwrap";
            e.adlibs.append(nameEl, textWrap);
        }

        if(!sameName){ nameEl.classList.add("fade-out"); nameEl.classList.remove("fade-in"); }
        [...textWrap.children].forEach(el => { el.classList.add("fade-out"); el.classList.remove("fade-in"); });

        setTimeout(() => {
            if(!sameName) nameEl.textContent = line.members.join("  &  ");
            const parts = [];
            const addPart = (cls, text) => {
                if(!text) return;
                const d = document.createElement("div");
                d.className = cls + " fade-out"; d.textContent = text;
                parts.push(d);
            };
            addPart("adlib-original", line.original);
            addPart("adlib-roman",    line.romanization);
            addPart("adlib-english",  line.english);
            addPart("adlib-text", typeof line.adlib === "string" ? line.adlib : "");
            textWrap.replaceChildren(...parts);

            e.adlibs.style.setProperty("--accent", c.accent);
            e.adlibs.style.setProperty("--accent-secondary", c.secondaryAccent);
            e.adlibs.style.setProperty("--group-glow", c.groupGlow);
            e.adlibs.style.setProperty("--group-gradient", c.groupGradient);
            e.adlibs.classList.add("singing");
            e.adlibs.classList.toggle("multi-member", c.isSharedLine);
            e.adlibs.classList.toggle("group", c.isGroupLine);

            requestAnimationFrame(() => {
                nameEl.classList.remove("fade-out"); nameEl.classList.add("fade-in");
                parts.forEach(d => { d.classList.remove("fade-out"); d.classList.add("fade-in"); });
            });
        }, 180);
    },

    /* Clear ONLY the ad-lib text parts (keep the member name during the gap). */
    clearAdlibText(){
        const e = this.els();
        const textWrap = e.adlibs.querySelector(".adlib-textwrap");
        if(!textWrap) return;
        const parts = [...textWrap.children];
        parts.forEach(el => { el.classList.add("fade-out"); el.classList.remove("fade-in"); });
        setTimeout(() => { parts.forEach(el => el.remove()); }, 180);
    },

    clearAdlib(){
        if(this.adlibIndex === -1) return;
        this.adlibIndex = -1;
        this.adlibTextCleared = false;
        this.lastAdlibMembers = null;

        const e = this.els();
        [...e.adlibs.children].forEach(el => { el.classList.add("fade-out"); el.classList.remove("fade-in"); });

        setTimeout(() => {
            e.adlibs.replaceChildren();
            // Keep the colour vars so the halo fades out in the member's colour
            // (removing them would revert --accent to the default purple).
            // They're harmless while idle and get overwritten by the next ad-lib.
            e.adlibs.classList.remove("singing");
            e.adlibs.classList.remove("multi-member");
            e.adlibs.classList.remove("group");
        }, 180);
    },

    /* Clear both panels (used at startup). */
    clear(){
        this.clearCentral();
        this.clearAdlib();
    }
};
