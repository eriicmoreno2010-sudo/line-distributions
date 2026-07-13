/*
=========================================
Lyrics
=========================================
*/

const Lyrics = {

    currentIndex: -1,

    lastLineTime: undefined,

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

                // Hay una línea activa, reiniciamos el contador
this.lastLineTime = undefined;

                return;

            }

        }

    // Si es la primera vez que no hay letra, guardamos el tiempo
if (this.lastLineTime === undefined) {

    this.lastLineTime = currentTime;

}

// Solo borramos si llevamos más de 1 segundo sin ninguna letra
if (currentTime - this.lastLineTime > 1) {

    this.clear();

}

    },

   show(line) {
       // Si ya se está mostrando esta línea, no hacemos nada
if (
    document.getElementById("current-member").textContent ===
    line.members.join(" & ")
) {
    return;
}

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
    line.members.join(" & ");

        document.getElementById("original").textContent =
            line.original;

        document.getElementById("romanized").textContent =
            line.romanization;

        document.getElementById("english").textContent =
            line.english;

        document.getElementById("adlibs-section").textContent =
            line.adlib || "";

        Ranking.setActive(line.members[0]);

        elements.forEach(element => {

            element.classList.remove("fade-out");

            element.classList.add("fade-in");

        });

    }, 180);

},

clear() {

    if (this.currentIndex === -1) return;

    this.currentIndex = -1;
    this.lastLineTime = undefined;

    const elements = [

        document.getElementById("current-member"),

        document.getElementById("original"),

        document.getElementById("romanized"),

        document.getElementById("english"),

        document.getElementById("adlibs-section")

    ];

    // Fade Out
    elements.forEach(element => {

        element.classList.add("fade-out");

        element.classList.remove("fade-in");

    });

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
