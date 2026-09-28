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

    // Diseño "coded": no hay vídeo MV -> el <video> reproduce el mp3 (audio) y hace
    // de reloj. Usa SONG.audio si está; si no, el vídeo (del que solo se oye el audio).
    const coded = (SONG.layout === "coded");
    const src = coded ? (SONG.audio || SONG.video || "") : (SONG.video || "");
    if(!src){ return; }
    // Cache-bust by duration so re-trimmed media reload instead of serving the stale cached file.
    UI.elements.video.src = src + (src.indexOf("?") < 0 ? "?" : "&") + "v=" + (SONG.duration || 0);

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
