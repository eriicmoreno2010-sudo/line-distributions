/*
=========================================
Lyrics
=========================================
*/

const Lyrics = {

    currentIndex: -1,

    update(currentTime) {

        if (!SONG || !SONG.lyrics) return;

        const lyrics = SONG.lyrics;

        for (let i = 0; i < lyrics.length; i++) {

            const line = lyrics[i];

            if (
                currentTime >= line.start &&
                currentTime < line.end
            ) {

                if (this.currentIndex !== i) {

                    this.currentIndex = i;

                    this.show(line);

                }

                return;

            }

        }

        this.clear();

    },

   show(line) {

    const elements = [

        document.getElementById("current-member"),

        document.getElementById("hangul"),

        document.getElementById("romanized"),

        document.getElementById("english"),

        document.getElementById("adlibs-section")

    ];

    elements.forEach(element => {

        element.classList.add("fade-out");

        element.classList.remove("fade-in");

    });

    setTimeout(() => {

        document.getElementById("current-member").textContent =
            line.member;

        document.getElementById("hangul").textContent =
            line.hangul;

        document.getElementById("romanized").textContent =
            line.romanization;

        document.getElementById("english").textContent =
            line.english;

        document.getElementById("adlibs-section").textContent =
            line.adlib || "";

        Ranking.setActive(line.member);

        elements.forEach(element => {

            element.classList.remove("fade-out");

            element.classList.add("fade-in");

        });

    }, 180);

},

    clear() {

        if (this.currentIndex === -1) return;

        this.currentIndex = -1;

        document.getElementById("current-member").textContent = "";

        document.getElementById("hangul").textContent = "";

        document.getElementById("romanized").textContent = "";

        document.getElementById("english").textContent = "";

        document.getElementById("adlibs-section").textContent = "";

        Ranking.setActive("");

        Ranking.render();

    }

};
