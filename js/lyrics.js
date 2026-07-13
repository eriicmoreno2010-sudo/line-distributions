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

        document.getElementById("original"),

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
            line.members;

        document.getElementById("original").textContent =
            line.hangul;

        document.getElementById("romanized").textContent =
            line.romanization;

        document.getElementById("english").textContent =
            line.english;

        document.getElementById("adlibs-section").textContent =
            line.adlib || "";

        Ranking.setActive(line.members);

        elements.forEach(element => {

            element.classList.remove("fade-out");

            element.classList.add("fade-in");

        });

    }, 180);

},

    clear() {

        if (this.currentIndex === -1) return;

        this.currentIndex = -1;

       setTimeout(() => {

    document.getElementById("current-member").textContent = "";

    document.getElementById("original").textContent = "";

    document.getElementById("romanized").textContent = "";

    document.getElementById("english").textContent = "";

    document.getElementById("adlibs-section").textContent = "";

    elements.forEach(element => {

        element.classList.remove("fade-out");

    });

}, 180);

        Ranking.setActive("");

        Ranking.render();

    }

};
