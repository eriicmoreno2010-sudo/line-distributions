/*
=========================================
UI
=========================================
*/

const UI = {

    elements: {

        groupName: document.getElementById("group-name"),

        songName: document.getElementById("song-name"),

        video: document.getElementById("video"),

        ranking: document.getElementById("ranking"),

        currentTime: document.getElementById("current-time"),

        duration: document.getElementById("duration")

    }

};

function loadSongInformation(){

    UI.elements.groupName.textContent = SONG.group;

    UI.elements.songName.textContent = SONG.song;

}

function loadVideo(){

    UI.elements.video.src = SONG.video;

}
