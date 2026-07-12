/* ========================================= */
/*              PLAYER.JS                    */
/* ========================================= */

const Player = {

    video: null,

    duration: 0,

    currentTime: 0,

    playing: false,

    init() {

        this.video = UI.elements.video;

        if (!this.video) return;

        this.video.addEventListener("loadedmetadata", () => {

            this.duration = this.video.duration;

        });

        this.video.addEventListener("play", () => {

            this.playing = true;

        });

        this.video.addEventListener("pause", () => {

            this.playing = false;

        });

        this.video.addEventListener("ended", () => {

            this.playing = false;

        });

        this.video.addEventListener("timeupdate", () => {

            this.currentTime = this.video.currentTime;

            if (this.duration > 0) {

                UI.updateTimeline(
                    (this.currentTime / this.duration) * 100
                );

            }

        });

    },

    play() {

        if (this.video) {

            this.video.play();

        }

    },

    pause() {

        if (this.video) {

            this.video.pause();

        }

    },

    stop() {

        if (!this.video) return;

        this.video.pause();

        this.video.currentTime = 0;

    },

    seek(seconds) {

        if (!this.video) return;

        this.video.currentTime = seconds;

    },

    getTime() {

        return this.currentTime;

    },

    getDuration() {

        return this.duration;

    }

};
