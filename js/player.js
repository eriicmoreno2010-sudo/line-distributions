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

        // Drive the lyric/ad-lib panel every animation frame. The video's
        // "timeupdate" event only fires ~4×/second — far too coarse for fast
        // ad-libs (which could show late/short or be missed, differently on each
        // replay). Reading currentTime at ~60fps makes it precise & consistent,
        // matching the ranking and timeline loops.
        const loop = () => {
            if(this.video){
                UI.setCurrentTime(this.video.currentTime);
                Engine.update(this.video.currentTime);
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);

    }

};
