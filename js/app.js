/*
=========================================
K-Line Distribution
Version: 2.0
App
=========================================
*/

let SONG = null;

/* Scale the fixed 1920×1080 UI canvas to fit the current screen, so the layout
   looks the same on every monitor/resolution (fixes fonts/cards looking off on
   higher-res displays). Recomputed on resize. */
function fitUI(){
    // Phones use a fluid, stacked layout (see the mobile @media block) — no
    // fixed-canvas scaling there, or everything would shrink to nothing.
    const mobile = window.matchMedia("(max-width:900px)").matches;
    const s = mobile ? 1 : Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.documentElement.style.setProperty("--ui-scale", s);
}
window.addEventListener("resize", fitUI);
fitUI();

document.addEventListener("DOMContentLoaded", async () => {

    try {

        // Default song is Moonlight; append ?song=<path> to load another
        // (e.g. ?song=data/nctdream/test.json to preview features).
        const songUrl = new URLSearchParams(location.search).get("song")
            || "data/nctdream/moonlight.json";

        const response = await fetch(songUrl);

        SONG = await response.json();

        // Optional per-song light theme (e.g. Moonlight test): white panels + light bg.
        document.body.classList.toggle("theme-light", SONG.theme === "light");

        // PRUEBA de diseño (solo en Moonlight test): ranking "flotante" sin caja
        // (foto + nombre en color + barrita + número), estilo referencia. No es definitivo.
        document.body.classList.toggle("rank-preview", /nctdream\/moonlight/i.test(songUrl));

        loadSongInformation();

        loadVideo();

        Ranking.load(SONG);

        Timeline.build();

        Player.init();

        Lyrics.clear();

    } catch (error) {

        console.error("Error loading song:", error);

    }

});
