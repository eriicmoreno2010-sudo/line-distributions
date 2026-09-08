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
        // engancha el mp3 a la posición REAL del vídeo (mutea el vídeo). Reanuda el
        // AudioContext si hiciera falta (aunque normalmente ya está desbloqueado).
        const play = () => {
            if(!ready || v.paused) return;
            const go = () => { if(v.paused) return; v.muted = true; startAt(v.currentTime + off); };
            if(ctx.state === "suspended") ctx.resume().then(go, go); else go();
        };

        v.muted = true;                          // el sonido sale del mp3, no del vídeo
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        // CLAVE: el navegador solo deja arrancar el AudioContext dentro de un GESTO
        // del usuario. El evento 'playing' del vídeo llega DESPUÉS del clic (ya no
        // cuenta como gesto) -> el mp3 no sonaba hasta mover la barra. Lo desbloqueamos
        // en la primera interacción (clic/tecla/toque) para que siempre esté listo.
        const unlock = () => { if(ctx.state === "suspended"){ ctx.resume().then(() => { if(!v.paused) play(); }); } };
        ["pointerdown","keydown","click","touchstart"].forEach(ev => window.addEventListener(ev, unlock, true));

        fetch(src).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b.slice(0)))
            .then(decoded => { buf = decoded; ready = true; play(); })
            .catch(() => { ready = false; v.muted = false; });   // si falla, usa el audio del vídeo

        // 'playing' = el vídeo ya reproduce de verdad -> mp3 EXACTO en su posición.
        v.addEventListener("playing", () => { if(!ready){ v.muted = false; return; } play(); });
        v.addEventListener("pause",  stop);
        v.addEventListener("ended",  stop);
        v.addEventListener("seeked", () => { if(!v.paused) play(); });
        v.addEventListener("ratechange", () => { if(!v.paused) play(); });
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
