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

    // Audio limpio (mp3) con WEB AUDIO API. El <audio> normal, al darle a play,
    // hace un seek y descodifica esa posición tarde -> el principio se oía CORTADO.
    // Con Web Audio el mp3 se descodifica UNA vez a memoria y arranca EXACTO en la
    // posición, al instante y SIN cortes. Clave para grabar con OBS.
    setupAudio() {
        const src = (typeof SONG !== "undefined" && SONG && (SONG.audio || SONG.mp3)) || "";
        if(!src) return;                         // sin campo audio -> usa el audio del vídeo (como siempre)
        const v = this.video;
        const off = +((SONG && SONG.audioOffset) || 0);   // desfase (+ retrasa, − adelanta)

        let ctx=null, buf=null, node=null, startCtx=0, startOff=0, ready=false;
        const stop = () => { if(node){ try{ node.onended=null; node.stop(0); }catch(e){} node=null; } };
        const pos  = () => node ? startOff + (ctx.currentTime - startCtx) * (node.playbackRate.value||1) : null;
        // want = posición objetivo del mp3 (= tiempo de vídeo + desfase). Puede ser
        // NEGATIVA (desfase negativo: el mp3 aún no entra); en ese caso PROGRAMAMOS
        // el arranque para el instante EXACTO en que el vídeo llegue, empezando el
        // mp3 desde su principio (0). Así una canción retrasada ya no empieza "ya
        // empezada" (antes el chequeo cada 0,5s la enganchaba tarde y avanzada).
        const startAt = (want) => {
            stop();
            if(!buf || want >= buf.duration) return;             // pasado el final del mp3
            const rate = v.playbackRate || 1;
            const s = ctx.createBufferSource();
            s.buffer = buf; s.playbackRate.value = rate;
            const g = ctx.createGain();
            const now = ctx.currentTime;
            let whenCtx, offInBuf;
            if(want >= 0){ whenCtx = now; offInBuf = want; }             // entra ya, en la posición want
            else { whenCtx = now + (-want) / rate; offInBuf = 0; }       // entra luego, desde el principio
            // fundido de entrada de ~18 ms (anti-clic), anclado al momento real de arranque
            g.gain.setValueAtTime(0.0001, whenCtx);
            g.gain.linearRampToValueAtTime(1, whenCtx + 0.018);
            s.connect(g); g.connect(ctx.destination);
            startCtx = whenCtx; startOff = offInBuf;
            try{ s.start(whenCtx, offInBuf); }catch(e){ return; }
            node = s;
        };
        // Deja el mp3 sonando EXACTO donde va el vídeo. No hace nada si ya está bien.
        const resync = () => {
            if(v.paused || !ready || !ctx || ctx.state !== "running") return;
            const want = v.currentTime + off;
            if(want >= buf.duration){ stop(); return; }               // pasado el final del mp3
            v.muted = true;
            if(!node){ startAt(want); return; }                       // programa/arranca (limpio, desde el principio si toca)
            if(ctx.currentTime >= startCtx){                          // ya sonando de verdad -> corrige deriva
                const p = startOff + (ctx.currentTime - startCtx) * (node.playbackRate.value || 1);
                if(Math.abs(p - want) > 0.20) startAt(want);
            }
        };

        v.muted = true;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Desbloqueo del contexto (los navegadores solo lo permiten en un gesto).
        // TRIPLE red: (1) primera interacción, (2) evento 'play', (3) cuando el
        // contexto pase a "running" reenganchamos. Así nunca se queda mudo ni tarde.
        const unlock = () => { if(ctx.state === "suspended") ctx.resume().catch(()=>{}); };
        ["pointerdown","keydown","click","touchstart"].forEach(ev => window.addEventListener(ev, unlock, true));
        ctx.onstatechange = () => { if(ctx.state === "running") resync(); };

        fetch(src).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b.slice(0)))
            .then(d => { buf = d; ready = true; resync(); })
            .catch(() => { ready = false; v.muted = false; });        // si falla, audio del vídeo

        // ARRANQUE SIN SKIP: al darle a play, pausamos el vídeo un instante,
        // preparamos el mp3 EXACTO en el punto y arrancamos vídeo+audio a la vez
        // desde ahí. Así el audio nunca empieza "ya empezado" (antes enganchaba en
        // una posición ya avanzada porque el contexto tardaba un poco en arrancar).
        let selfPlay = false;
        v.addEventListener("play", () => {
            if(selfPlay){ selfPlay = false; return; }   // este 'play' lo lanzamos nosotros
            const P = v.currentTime;                    // punto exacto donde arrancar
            v.pause(); unlock();
            const t0 = performance.now();
            const go = () => {
                if(!ready || !ctx || ctx.state !== "running"){
                    if(performance.now() - t0 < 800){ setTimeout(go, 15); return; }
                    v.muted = false; selfPlay = true; v.play().catch(()=>{}); return;   // respaldo: audio del vídeo
                }
                v.muted = true; startAt(P + off);       // mp3 desde P
                selfPlay = true; v.play().catch(()=>{}); // vídeo desde P, a la vez
            };
            (ctx && ctx.resume) ? ctx.resume().then(go, go) : go();
        });
        v.addEventListener("playing", () => { if(!ready) v.muted = false; });
        v.addEventListener("pause",   stop);
        v.addEventListener("ended",   stop);
        v.addEventListener("seeked",  () => { if(!v.paused) resync(); });   // reengancha al mover (ya reproduciendo)
        v.addEventListener("ratechange", () => { if(!v.paused) resync(); });
        setInterval(resync, 500);                                            // corrección de deriva

        // ---- Indicador de DIAGNÓSTICO (pulsa F2 para mostrar/ocultar) ----
        // Dice si suena el MP3 (Web Audio) o el audio del vídeo, el estado del
        // contexto y el desfase real entre el audio y el vídeo. No sale en la
        // grabación salvo que lo actives tú.
        const dbg = document.createElement("div");
        dbg.style.cssText = "position:fixed;top:8px;left:8px;z-index:99999;display:none;"+
          "background:rgba(0,0,0,.82);color:#0f0;font:700 13px/1.5 monospace;padding:8px 11px;"+
          "border-radius:8px;white-space:pre;pointer-events:none";
        document.body.appendChild(dbg);
        let dbgOn = false;
        window.addEventListener("keydown", e => { if(e.key === "F2"){ dbgOn = !dbgOn; dbg.style.display = dbgOn ? "block" : "none"; } });
        setInterval(() => {
          if(!dbgOn) return;
          const p = pos(), want = v.currentTime + off;
          const mode = (!ready) ? "cargando…" : (node ? "MP3 (Web Audio)" : (v.muted ? "MP3 (parado)" : "AUDIO DEL VÍDEO (respaldo)"));
          dbg.textContent =
            "audio: " + mode + "\n" +
            "contexto: " + (ctx ? ctx.state : "—") + "   descodificado: " + (ready ? "sí" : "no") + "\n" +
            "vídeo mute: " + v.muted + "   sonando: " + (node ? "sí" : "no") + "\n" +
            "pos audio: " + (p==null?"—":p.toFixed(3)) + "  quiere: " + want.toFixed(3) +
            "  desfase: " + (p==null?"—":((p-want)*1000).toFixed(0)+" ms");
        }, 100);
    }

};
