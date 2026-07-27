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

            // The JSON's "duration" can be stale (e.g. after re-trimming the
            // video). Trust the ACTUAL video so the timeline/ranking always
            // match it, then rebuild the timeline with the correct length.
            if(typeof SONG !== "undefined" && SONG &&
               isFinite(this.video.duration) && this.video.duration > 0){
                SONG.duration = this.video.duration;
                if(typeof Timeline !== "undefined" && Timeline.build) Timeline.build();
            }

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
