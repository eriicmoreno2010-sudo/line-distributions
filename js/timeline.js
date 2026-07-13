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

            // JSON uses "members" (array); take the main singer
            const singer = line.members && line.members[0];
            const member = SONG.members.find(m => m.name === singer);
            if(!member) return;

            const segment = document.createElement("div");
            segment.className = "timeline-segment";

            segment.style.left   = (line.start / SONG.duration) * 100 + "%";
            segment.style.width  = ((line.end - line.start) / SONG.duration) * 100 + "%";
            segment.style.background = member.color;

            timeline.insertBefore(segment, cursor);
        });
    },

    update(currentTime){

        const cursor = document.getElementById("timeline-cursor");
        if(!cursor || !SONG) return;

        cursor.style.left = (currentTime / SONG.duration) * 100 + "%";
    }
};
