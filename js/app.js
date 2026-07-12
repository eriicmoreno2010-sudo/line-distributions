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

        const response = await fetch("data/nctdream/moonlight.json");

        SONG = await response.json();

        loadSongInformation();

        loadVideo();

        Ranking.load(SONG);

        Player.init();

    } catch (error) {

        console.error("Error loading song:", error);

    }

});
