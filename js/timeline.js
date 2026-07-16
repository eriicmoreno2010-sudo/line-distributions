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

            // Group lines get a blended gradient; solo lines get the singer's color
            const isGroupLine = line.members && line.members.includes(SONG.group);

            let background;
            if(isGroupLine){
                background = `linear-gradient(90deg, ${SONG.members.map(m => m.color).join(", ")})`;
            } else {
                const singer = line.members && line.members[0];
                const member = SONG.members.find(m => m.name === singer);
                if(!member) return;
                background = member.color;
            }

            const segment = document.createElement("div");
            segment.className = "timeline-segment";

            segment.style.left   = (line.start / SONG.duration) * 100 + "%";
            segment.style.width  = ((line.end - line.start) / SONG.duration) * 100 + "%";
            segment.style.background = background;

            timeline.insertBefore(segment, cursor);
        });
    },

    update(currentTime){

        const cursor = document.getElementById("timeline-cursor");
        if(!cursor || !SONG) return;

        cursor.style.left = (currentTime / SONG.duration) * 100 + "%";
    }
};
