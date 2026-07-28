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

/* `**...**` marks a substring sung by the shared members (gradient paint).
   Only treat it as a marker when the `**` come in PAIRS (odd number of chunks
   after splitting). This keeps censored profanity like "f***ing" — which has a
   lone, unpaired `**` — as literal text instead of breaking the line. */
function hasPairedMarker(t){
    return typeof t === "string" && t.includes("**") && (t.split("**").length % 2 === 1);
}

/* Join singer names: "A" · "A & B" · "A, B & C" · "A, B, C & D" ... */
function joinNames(names){
    names = (names || []).filter(Boolean);
    if(names.length <= 1) return names[0] || "";
    if(names.length === 2) return names[0] + "  &  " + names[1];
    return names.slice(0, -1).join(", ") + "  &  " + names[names.length - 1];
}

/* Shrink a lyric line's font until it fits on ONE row (detected by height). */
function fitField(el){
    if(!el || !(el.textContent || "").trim()) return;
    el.style.fontSize = "";                 // back to the CSS base
    let s = parseFloat(getComputedStyle(el)?.fontSize) || 30;
    let guard = 0;
    // one line ≈ 42px (min-height); a wrapped line is ~84px -> shrink past 52px
    while(el.offsetHeight > 52 && s > 16 && guard++ < 40){ s -= 1; el.style.fontSize = s + "px"; }
}

const Lyrics = {

    centralIndex: -1,
    adlibIndex: -1,
    lastCentralMembers: null,   // for name persistence across same-singer lines

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
                .some(hasPairedMarker);
        // A CSS linear-gradient needs >=2 colour stops; with a single singer we
        // duplicate the colour so the gradient stays valid (otherwise the whole
        // background is dropped and the name, painted with color:transparent,
        // becomes INVISIBLE on solo lines that have a **...** highlight).
        const singerCols = singers.map(s => s.color);
        const sharedGradient =
            `linear-gradient(90deg, ${(singerCols.length === 1 ? [singerCols[0], singerCols[0]] : singerCols).join(", ")})`;
        // The `**...**` highlight: for a solo line it means "everyone joins in on
        // this word" -> paint it with the whole-group rainbow; for a line already
        // shared by several members, keep it as those members' gradient.
        const groupAllGradient =
            `linear-gradient(90deg, ${SONG.members.map(m => m.color).join(", ")})`;
        const markGradient = singers.length <= 1 ? groupAllGradient : sharedGradient;

        // Glow made from EVERY singer's colour (so 3+ members all show, not just 2).
        const membersGlow = singers.length
            ? singers.map((s, i, arr) => {
                  const pos = arr.length > 1 ? 8 + (i / (arr.length - 1)) * 84 : 50;
                  return `radial-gradient(42% 60% at ${pos}% 45%, ` +
                         `color-mix(in srgb, ${s.color} 20%, transparent), transparent 70%)`;
              }).join(", ")
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
            isSharedLine = !hasPartial && singers.length > 1;
        }
        return { isGroupLine, groupGradient, groupGlow, hasPartial,
                 sharedGradient, markGradient, membersGlow, accent, secondaryAccent, isSharedLine };
    },

    /* Each frame: pick the active CENTRAL line and the active AD-LIB line
       independently, so both panels can be filled at the same time. */
    // When a line ends the TEXT disappears right away, but the member NAME is
    // kept through short gaps and only clears after HOLD seconds of silence —
    // so on runs with small gaps (e.g. NCT DREAM) the name stays until they stop.
    HOLD: 1.0,
    centralTextCleared: false,

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

        // AD-LIB — clears fully as soon as nothing is active (original behaviour)
        if(ai === -1) this.clearAdlib();
        else if(ai !== this.adlibIndex){ this.adlibIndex = ai; this.showAdlib(lyrics[ai]); }
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
            // A **...** chunk may name who sings it: "word@Nicholas" (one member),
            // "word@Nicholas,Taki" (a couple → their gradient), "word@todos" or plain
            // "word" (no @) → the whole group / the line's shared colour.
            const memberColor = name => {
                const m = SONG.members.find(mm => mm.name.toLowerCase() === name.toLowerCase());
                return m ? m.color : null;
            };
            const markedSpan = chunk => {
                let display = chunk, colors = null;
                const at = chunk.lastIndexOf("@");
                if(at > 0){
                    const names = chunk.slice(at + 1).split(",").map(s => s.trim()).filter(Boolean);
                    if(names.length && names.every(n => /^(all|todos|grupo)$/i.test(n))){
                        colors = SONG.members.map(m => m.color); display = chunk.slice(0, at);
                    } else if(names.length){
                        const cs = names.map(memberColor);
                        if(cs.every(Boolean)){ colors = cs; display = chunk.slice(0, at); }
                    }
                }
                if(colors && colors.length === 1)
                    return `<span style="color:${colors[0]}">${escapeHtml(display)}</span>`;
                const bg = colors ? `linear-gradient(90deg, ${colors.join(", ")})` : c.markGradient;
                return `<span style="background:${bg};-webkit-background-clip:text;background-clip:text;color:transparent">${escapeHtml(display)}</span>`;
            };
            const paintText = (el, text) => {
                text = text || "";
                clearPaint(el);
                if(c.hasPartial && hasPairedMarker(text)){
                    el.innerHTML = text.split("**").map((chunk, i) => i % 2
                        ? markedSpan(chunk)
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
                    e.member.textContent = joinNames(line.members);
                    e.member.style.background = c.sharedGradient;
                    e.member.style.webkitBackgroundClip = "text";
                    e.member.style.backgroundClip = "text";
                    e.member.style.color = "transparent";
                } else {
                    e.member.textContent = joinNames(line.members);
                    e.member.style.color = c.accent;
                }
            }
            // Don't repeat identical text 3× (e.g. pure-English lines): show it
            // once, centred. Korean lines (3 distinct) still show all three.
            const raw = [line.original, line.romanization, line.english].map(t => (t||"").trim());
            const uniq = raw.filter((t,i) => t && raw.indexOf(t) === i);
            let so="", sr="", se="";
            if(uniq.length <= 1){ sr = uniq[0] || ""; }
            else if(uniq.length === 2){ so = uniq[0]; sr = uniq[1]; }
            else { so = raw[0]; sr = raw[1]; se = raw[2]; }
            paintText(e.original, so);
            paintText(e.roman,    sr);
            paintText(e.english,  se);
            requestAnimationFrame(() => { fitField(e.original); fitField(e.roman); fitField(e.english); });

            e.section.style.setProperty("--accent", c.accent);
            e.section.style.setProperty("--accent-secondary", c.secondaryAccent);
            e.section.style.setProperty("--group-glow", c.groupGlow);
            e.section.style.setProperty("--group-gradient", c.groupGradient);
            e.section.style.setProperty("--members-gradient", c.sharedGradient);
            e.section.style.setProperty("--members-glow", c.membersGlow);
            e.section.classList.add("singing");
            e.section.classList.toggle("multi-member", c.isSharedLine);
            e.section.classList.toggle("group", c.isGroupLine);

            fadeEls.forEach(el => { el.classList.remove("fade-out"); el.classList.add("fade-in"); });
        }, 100);
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
        }, 100);
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
        }, 100);
    },

    /* ---------------- AD-LIB panel ---------------- */
    showAdlib(line){
        const e = this.els();
        const c = this.colorsFor(line);

        e.adlibs.querySelectorAll(ADLIB_PARTS).forEach(el => {
            el.classList.add("fade-out"); el.classList.remove("fade-in");
        });

        setTimeout(() => {
            e.adlibs.replaceChildren();
            const parts = [];
            const addPart = (cls, text) => {
                if(!text) return;
                const el2 = document.createElement("div");
                el2.className = cls + " fade-out";
                el2.textContent = text;
                parts.push(el2);
            };
            addPart("adlib-member",   joinNames(line.members));
            addPart("adlib-original", line.original);
            addPart("adlib-roman",    line.romanization);
            addPart("adlib-english",  line.english);
            addPart("adlib-text", typeof line.adlib === "string" ? line.adlib : "");
            e.adlibs.append(...parts);

            e.adlibs.style.setProperty("--accent", c.accent);
            e.adlibs.style.setProperty("--accent-secondary", c.secondaryAccent);
            e.adlibs.style.setProperty("--group-glow", c.groupGlow);
            e.adlibs.style.setProperty("--group-gradient", c.groupGradient);
            e.adlibs.style.setProperty("--members-gradient", c.sharedGradient);
            e.adlibs.style.setProperty("--members-glow", c.membersGlow);
            e.adlibs.classList.add("singing");
            e.adlibs.classList.toggle("multi-member", c.isSharedLine);
            e.adlibs.classList.toggle("group", c.isGroupLine);

            requestAnimationFrame(() => {
                parts.forEach(el2 => { el2.classList.remove("fade-out"); el2.classList.add("fade-in"); });
            });
        }, 100);
    },

    clearAdlib(){
        if(this.adlibIndex === -1) return;
        this.adlibIndex = -1;

        const e = this.els();
        e.adlibs.querySelectorAll(ADLIB_PARTS).forEach(el => {
            el.classList.add("fade-out"); el.classList.remove("fade-in");
        });

        setTimeout(() => {
            e.adlibs.replaceChildren();
            // Keep the colour vars so the halo fades out in the member's colour
            // (removing them would revert --accent to the default purple).
            // They're harmless while idle and get overwritten by the next ad-lib.
            e.adlibs.classList.remove("singing");
            e.adlibs.classList.remove("multi-member");
            e.adlibs.classList.remove("group");
        }, 100);
    },

    /* Clear both panels (used at startup). */
    clear(){
        this.clearCentral();
        this.clearAdlib();
    }
};
