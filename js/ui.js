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

function formatTime(seconds){

    const min = Math.floor(seconds / 60);

    const sec = Math.floor(seconds % 60);

    return `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;

}

UI.setCurrentTime = function(seconds){

    this.elements.currentTime.textContent = formatTime(seconds);

}

UI.setDuration = function(seconds){

    this.elements.duration.textContent = formatTime(seconds);

}
