/*
  Beats: detecta los golpes (bombo/graves) del audio que suena y publica su fuerza
  en la variable CSS --beat (0..1) del <body>. El halo glitch de las fotos del
  ranking reacciona a esa variable (ver css/ranking.css, body.rank-beats .beat-halo).
  Solo se activa si SONG.beats === true (prueba: Moonlight). El AudioContext se crea
  al PRIMER play (gesto del usuario) para no silenciar el vídeo antes de tiempo.
*/
const Beats = {
  on:false, ctx:null, an:null, data:null, cur:0, avg:0, raf:0, started:false,

  enable(){
    if(this.on) return;
    if(!(typeof SONG !== "undefined" && SONG && SONG.beats)) return;
    const v = document.getElementById("video");
    if(!v) return;
    this.on = true;
    document.body.style.setProperty("--beat", "0");
    // Arranca el análisis en el primer play (así el audio no pasa por el contexto
    // -y no se silencia- hasta que el usuario le da a reproducir).
    const start = () => this.start(v);
    v.addEventListener("play", start);
    v.addEventListener("playing", start);
  },

  start(v){
    if(this.started) { if(this.ctx && this.ctx.state === "suspended") this.ctx.resume(); return; }
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      let src = v._beatSrc;
      if(!src){ src = this.ctx.createMediaElementSource(v); v._beatSrc = src; }  // solo una vez por <video>
      this.an = this.ctx.createAnalyser();
      this.an.fftSize = 1024;
      this.an.smoothingTimeConstant = 0.55;
      src.connect(this.an);
      this.an.connect(this.ctx.destination);   // el audio sigue sonando
      this.data = new Uint8Array(this.an.frequencyBinCount);
      this.started = true;
      if(this.ctx.state === "suspended") this.ctx.resume();
      this.loop();
    }catch(e){ console.warn("Beats:", e && e.message || e); }
  },

  loop(){
    this.raf = requestAnimationFrame(() => this.loop());
    if(!this.an) return;
    this.an.getByteFrequencyData(this.data);
    // Energía de GRAVES (bombo/kick): primeras bins (~0-250 Hz con fft 1024 @48k).
    let e = 0; const N = 6;
    for(let i = 1; i <= N; i++) e += this.data[i];
    e = e / N / 255;                                   // 0..1
    // Media móvil para detectar el "salto" (onset) sobre el nivel de fondo.
    this.avg = this.avg * 0.90 + e * 0.10;
    let s = 0;
    const thr = this.avg * 1.35 + 0.04;
    if(e > thr) s = Math.min(1, (e - this.avg) / (this.avg + 0.12));   // fuerza del golpe
    // El valor mostrado sube de golpe y decae rápido -> se siente como un "beat".
    this.cur = Math.max(this.cur * 0.80, s);
    document.body.style.setProperty("--beat", this.cur.toFixed(3));
  }
};
if(typeof window !== "undefined") window.Beats = Beats;
