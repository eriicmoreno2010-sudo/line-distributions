/*
=========================================
Timeline  v3
=========================================
*/

const Timeline = {

    build(){

        const timeline = document.getElementById("timeline");
        const cursor   = document.getElementById("timeline-cursor");

        // remove previous segments
        timeline.querySelectorAll(".timeline-segment").forEach(s => s.remove());

        if(!SONG || !SONG.lyrics) return;

        SONG.lyrics.forEach(line => {

            const background = this.lineColor(line);
            if(!background) return;

            const segment = document.createElement("div");
            segment.className = "timeline-segment";

            segment.style.left   = (line.start / SONG.duration) * 100 + "%";
            segment.style.width  = ((line.end - line.start) / SONG.duration) * 100 + "%";
            segment.style.background = background;

            timeline.insertBefore(segment, cursor);
        });

        this.startCursor();
    },

    /* Color de la barra de una línea:
       · Si interviene el GRUPO (línea de grupo, "todos", o una parte de grupo) ->
         degradado con TODOS los colores (se ve el grupo entero).
       · Si la cantan 2+ miembros (p. ej. JUN / THE8) -> UN color MEZCLADO (promedio),
         no un degradado.
       · Un solo cantante -> su color.
       Recoge cantantes de line.members, de los marcadores **...@Miembro** y de los
       segmentos de voz (line.voice), así no se pierde nadie (antes THE8 no salía). */
    lineColor(line){
        const members = SONG.members || [];
        const byName = n => members.find(m => m.name === n);
        const names = new Set();
        let hasGroup = false;
        const add = n => {
            if(!n) return; n = ("" + n).trim();
            if(n === SONG.group || /^(todos|all|grupo|group)$/i.test(n)){ hasGroup = true; return; }
            if(byName(n)) names.add(n);
        };
        (line.members || []).forEach(add);
        const txt = (line.original || "") + "\n" + (line.romanization || "") + "\n" + (line.english || "");
        const re = /@([^*\n]+?)\*\*/g; let m;
        while((m = re.exec(txt))){ m[1].split(",").forEach(add); }
        if(Array.isArray(line.voice)){
            line.voice.forEach(seg => { const who = seg && seg[2]; if(Array.isArray(who)) who.forEach(add); else add(who); });
        }

        if(hasGroup && members.length > 1)
            return `linear-gradient(90deg, ${members.map(m => m.color).join(", ")})`;
        const arr = [...names];
        if(arr.length === 0) return null;
        if(arr.length === 1) return byName(arr[0]).color;
        return this.mixColors(arr.map(n => byName(n).color));   // 2+ -> color mezclado sólido
    },

    _cx: null,
    toRgb(c){
        if(!this._cx) this._cx = document.createElement("canvas").getContext("2d");
        this._cx.fillStyle = "#000"; this._cx.fillStyle = c;
        const s = this._cx.fillStyle;
        if(s[0] === "#"){ let h = s.slice(1); if(h.length === 3) h = h.split("").map(x => x + x).join(""); const n = parseInt(h, 16); return [(n>>16)&255, (n>>8)&255, n&255]; }
        const g = s.match(/\d+/g); return g ? g.slice(0,3).map(Number) : [136,136,136];
    },
    mixColors(cols){
        const rgb = cols.map(c => this.toRgb(c));
        const a = [0,1,2].map(i => Math.round(rgb.reduce((s,v) => s + v[i], 0) / rgb.length));
        return `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
    },

    /* The cursor is animated with requestAnimationFrame reading the video's
       currentTime directly, so it glides smoothly at 60fps instead of jumping
       on each (throttled) timeupdate event. */
    cursorStarted:false,
    startCursor(){
        if(this.cursorStarted) return;
        this.cursorStarted = true;

        const cursor = document.getElementById("timeline-cursor");
        const video  = document.getElementById("video");

        const tick = () => {
            if(cursor && video && SONG && SONG.duration){
                const pct = Math.max(0, Math.min(100,
                    (video.currentTime / SONG.duration) * 100));
                cursor.style.left = pct + "%";
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    // Cursor is driven by startCursor()'s rAF loop; kept for the engine call.
    update(){}
};
