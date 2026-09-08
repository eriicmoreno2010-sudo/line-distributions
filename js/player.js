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
        const sync = (force) => { try{
            // Si ya hay un seek en curso, NO encadenar otro: eso provocaba el bucle
            // de "se reinicia cada 0,5s y no avanza" (cada corrección disparaba otra
            // antes de terminar la anterior).
            if(aud.seeking) return;
            const tgt = v.currentTime + off;
            const dur = aud.duration;
            // Fin del mp3 (o mp3 más corto que el vídeo): PARAR y no reintentar.
            // Antes el sync periódico volvía a darle play cerca del final y se oía
            // "reiniciado" en bucle al acabar el audio oficial.
            if(aud.ended || (isFinite(dur) && dur > 0 && tgt >= dur - 0.15)){ if(!aud.paused) aud.pause(); return; }
            if(tgt < 0){ if(!aud.paused) aud.pause(); return; }   // desfase negativo: aún no ha empezado
            // Corrige solo desfases GRANDES (con force —play/seek— ajusta fino). El
            // margen amplio evita reseeks constantes por micro-derivas.
            if(Math.abs(aud.currentTime - tgt) > (force ? 0.08 : 0.5)) aud.currentTime = tgt;
            if(!v.paused && aud.paused) aud.play().catch(() => {});   // reanuda al entrar en rango
        }catch(e){} };
        v.addEventListener("play",  () => sync(true));
        v.addEventListener("pause", () => aud.pause());
        v.addEventListener("seeked", () => sync(true));
        v.addEventListener("ratechange", () => { aud.playbackRate = v.playbackRate; });
        v.addEventListener("ended", () => aud.pause());
        // corrección de deriva suave (cada 1s, no 0,5s -> menos reseeks)
        setInterval(() => { if(!v.paused) sync(false); }, 1000);
    }

};
