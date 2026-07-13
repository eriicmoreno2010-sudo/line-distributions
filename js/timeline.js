/*
=========================================
Timeline
=========================================
*/

const Timeline = {

    build() {

        const timeline = document.getElementById("timeline");

        // Eliminamos todos los segmentos anteriores
        timeline.querySelectorAll(".timeline-segment").forEach(segment => {
            segment.remove();
        });

        if (!SONG || !SONG.lyrics) return;

        SONG.lyrics.forEach(line => {

            const member = SONG.members.find(
                m => m.name === line.member
            );

            if (!member) return;

            const segment = document.createElement("div");

            segment.className = "timeline-segment";

            const left =
                (line.start / SONG.duration) * 100;

            const width =
                ((line.end - line.start) / SONG.duration) * 100;

            segment.style.left = left + "%";
            segment.style.width = width + "%";
            segment.style.background = member.color;

            timeline.insertBefore(
                segment,
                document.getElementById("timeline-cursor")
            );

        });

    },

    update(currentTime) {

        const cursor = document.getElementById("timeline-cursor");

        if (!cursor || !SONG) return;

        cursor.style.left =
            (currentTime / SONG.duration) * 100 + "%";

    }

};
