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

            // Group lines blend every color; multi-singer lines blend theirs;
            // solo lines use the single singer's color.
            const isGroupLine = line.members && line.members.includes(SONG.group);
            const singers = (line.members || [])
                .map(name => SONG.members.find(m => m.name === name))
                .filter(Boolean);

            let background;
            if(isGroupLine){
                background = `linear-gradient(90deg, ${SONG.members.map(m => m.color).join(", ")})`;
            } else if(singers.length > 1){
                background = `linear-gradient(90deg, ${singers.map(s => s.color).join(", ")})`;
            } else if(singers.length === 1){
                background = singers[0].color;
            } else {
                return;
            }

            const segment = document.createElement("div");
            segment.className = "timeline-segment";

            segment.style.left   = (line.start / SONG.duration) * 100 + "%";
            segment.style.width  = ((line.end - line.start) / SONG.duration) * 100 + "%";
            segment.style.background = background;

            timeline.insertBefore(segment, cursor);
        });

        this.startCursor();
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
