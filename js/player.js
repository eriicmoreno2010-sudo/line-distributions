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

    // Audio limpio (mp3) con WEB AUDIO API. Un <audio> normal arranca con latencia
    // impredecible y descodifica los seeks tarde -> el mp3 sonaba tarde y cortado.
    // Con Web Audio el mp3 se descodifica UNA vez a memoria y arranca EXACTO en
    // cualquier posición, al instante y sin cortes (crucial para grabar con OBS).
    setupAudio() {
        const src = (typeof SONG !== "undefined" && SONG && (SONG.audio || SONG.mp3)) || "";
        if(!src) return;                         // sin campo audio -> usa el audio del vídeo (como siempre)
        const v = this.video;
        const off = +((SONG && SONG.audioOffset) || 0);   // desfase (+ retrasa, − adelanta)

        let ctx = null, buf = null, node = null, startCtx = 0, startOff = 0, ready = false;
        const stop = () => { if(node){ try{ node.onended = null; node.stop(0); }catch(e){} node = null; } };
        const pos  = () => node ? startOff + (ctx.currentTime - startCtx) * (node.playbackRate.value || 1) : null;
        const startAt = (offset) => {
            if(!ctx || !buf) return; stop();
            if(offset < 0 || offset >= buf.duration) return;   // fuera de rango: no suena
            const s = ctx.createBufferSource();
            s.buffer = buf; s.playbackRate.value = v.playbackRate || 1;
            s.connect(ctx.destination);
            startCtx = ctx.currentTime; startOff = offset;
            try{ s.start(0, offset); }catch(e){ return; }
            node = s;
        };
        const reengage = () => { if(!v.paused && ready){
            if(ctx.state === "suspended"){ ctx.resume().then(() => { if(!v.paused) startAt(v.currentTime + off); }); }
            else startAt(v.currentTime + off);
        } };

        v.muted = true;                          // el sonido sale del mp3, no del vídeo
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        fetch(src).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b.slice(0)))
            .then(decoded => { buf = decoded; ready = true; reengage(); })
            .catch(() => { ready = false; v.muted = false; });   // si falla, usa el audio del vídeo

        // 'playing' = el vídeo ya está reproduciendo de verdad: enganchamos el mp3
        // EXACTO en la posición real del vídeo (sin latencia, sin cortes).
        v.addEventListener("playing", () => {
            if(!ready){ v.muted = false; return; }   // mp3 aún no listo -> audio del vídeo
            if(ctx.state === "suspended"){
                ctx.resume().then(() => { if(!v.paused){ v.muted = true; startAt(v.currentTime + off); } });
                // sin gesto de usuario (modo auto) el contexto no arranca -> tras un
                // momento, si sigue suspendido, usa el audio del propio vídeo
                setTimeout(() => { if(ctx.state === "suspended" && !v.paused) v.muted = false; }, 400);
            } else { v.muted = true; startAt(v.currentTime + off); }
        });
        v.addEventListener("pause",  stop);
        v.addEventListener("ended",  stop);
        v.addEventListener("seeked", reengage);
        v.addEventListener("ratechange", reengage);
        // corrección de deriva (rara): si se desvía > 0,12 s, reengancha al instante
        setInterval(() => {
            if(v.paused || !node || !buf) return;
            const want = v.currentTime + off;
            if(want < 0 || want >= buf.duration){ stop(); return; }
            const p = pos(); if(p == null) return;
            if(Math.abs(p - want) > 0.12) startAt(want);
        }, 700);
    }

};
