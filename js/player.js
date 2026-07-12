/*
=========================================
Player
=========================================
*/

const Player = {

    video: null,

    init() {

        this.video = document.getElementById("video");

        this.video.addEventListener("loadedmetadata", () => {

            UI.setDuration(this.video.duration);

        });

        this.video.addEventListener("timeupdate", () => {

            UI.setCurrentTime(this.video.currentTime);

            Engine.update(this.video.currentTime);

        });

    }

};
