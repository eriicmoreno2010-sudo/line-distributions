/*
=========================================
K-Line Distribution
Version: 2.0
App
=========================================
*/

let SONG = null;

document.addEventListener("DOMContentLoaded", async () => {

    try {

        // Default song is Moonlight; append ?song=<path> to load another
        // (e.g. ?song=data/nctdream/test.json to preview features).
        const songUrl = new URLSearchParams(location.search).get("song")
            || "data/nctdream/moonlight.json";

        const response = await fetch(songUrl);

        SONG = await response.json();

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
