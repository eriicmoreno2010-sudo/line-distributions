/*
=========================================
Player
=========================================
*/

const Player = {

    video: null,
    audio: null,

    init() {

        this.video = document.getElementById("video");

        // Audio limpio del mp3 en vez del audio del vídeo (opcional): pon
        // "audio":"audio/xxx.mp3" en el JSON de la canción. Silencia el vídeo y
        // reproduce el mp3 sincronizado (play/pausa/seek/velocidad lo siguen).
        this.setupAudio();

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

    },

    setupAudio() {
        const src = (typeof SONG !== "undefined" && SONG && (SONG.audio || SONG.mp3)) || "";
        if(!src) return;                         // sin campo audio -> usa el audio del vídeo (como siempre)
        const v = this.video;
        const aud = new Audio(src + (src.indexOf("?") < 0 ? "?" : "&") + "v=" + (SONG.duration || 0));
        aud.preload = "auto";
        this.audio = aud;
        v.muted = true;                          // el sonido sale del mp3, no del vídeo

        const off = +((SONG && SONG.audioOffset) || 0);   // desfase elegido en el editor (+ retrasa, − adelanta)
        // Si el objetivo es < 0 (desfase negativo: el audio aún no ha empezado) se PAUSA,
        // no se clava en 0 (eso reiniciaba el audio a partir de -0,25).
        const sync = (force) => { try{ const tgt = v.currentTime + off;
            if(tgt < 0){ if(!aud.paused) aud.pause(); return; }
            // reajusta solo si hace falta; con force igual respeta un margen para no dar
            // un saltito innecesario al arrancar (que se oía "cortado" al principio)
            if(Math.abs(aud.currentTime - tgt) > (force ? 0.06 : 0.25)) aud.currentTime = tgt;
            if(!v.paused && aud.paused) aud.play().catch(() => {});   // reanuda al entrar en rango
        }catch(e){} };
        v.addEventListener("play",  () => sync(true));
        v.addEventListener("pause", () => aud.pause());
        v.addEventListener("seeked", () => sync(true));
        v.addEventListener("ratechange", () => { aud.playbackRate = v.playbackRate; });
        v.addEventListener("ended", () => aud.pause());
        // corrección de deriva + reanuda si volvió al rango
        setInterval(() => { if(!v.paused) sync(false); }, 500);
    }

};
