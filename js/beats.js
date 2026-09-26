/*
  AudioFX — señal audio-reactiva CONTINUA, precisa y DETERMINISTA.

  En vez de "detectar beats" en tiempo real (con latencia y una media móvil) y luego
  animar el glitch con @keyframes independientes, aquí:
    1) PRECALCULAMOS una envolvente de amplitud del audio a alta resolución
       (bloques de 256 muestras ≈ 5.3 ms) una sola vez al cargar.
    2) CADA FRAME leemos video.currentTime y sacamos por interpolación la intensidad
       EXACTA del audio en ese instante -> señal 0..1 suave y precisa.
    3) Publicamos esa intensidad y un desplazamiento de glitch DETERMINISTA (derivado
       del propio tiempo) en variables CSS (--beat, --gx1/--gy1, --gx2/--gy2). El halo
       y el glitch dependen DIRECTAMENTE de esas variables, sin animaciones autónomas.

  Como todo depende de video.currentTime (que el export fija frame a frame) y de una
  envolvente precalculada, el resultado es idéntico en vivo y en el render/export.
  AudioFX.level queda expuesto para alimentar después el glitch de las letras.
*/
const AudioFX = {
  on:false, env:null, hop:256, sr:44100, dur:0, ready:false, level:0, glitch:0,
  MAXOFF:9,          // px de desplazamiento del glitch a intensidad 1
  raf:0,

  enable(){
    if(this.on) return;
    if(!(typeof SONG !== "undefined" && SONG && SONG.beats)) return;
    this.on = true;
    document.body.style.setProperty("--beat", "0");
    this.precompute();     // asíncrono; hasta que termine, level = 0
    this.loop();           // el bucle por frame arranca ya (usa currentTime)
  },

  async precompute(){
    try{
      const src = SONG.audio || SONG.mp3 || SONG.video;
      if(!src){ window.__audioReady = true; return; }
      const resp = await fetch(new URL(src, document.baseURI));
      const arr  = await resp.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const audio = await ac.decodeAudioData(arr);
      if(ac.close) ac.close();

      this.sr = audio.sampleRate;
      this.dur = audio.duration;
      const L = audio.getChannelData(0);
      const R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
      const hop = this.hop, win = 1024;
      const n = Math.floor(L.length / hop);
      const env = new Float32Array(n);
      let peak = 1e-6;
      for(let i = 0; i < n; i++){
        let s = 0; const st = i*hop, end = Math.min(L.length, st + win), cnt = end - st || 1;
        for(let j = st; j < end; j++){ const v = (L[j] + R[j]) * 0.5; s += v*v; }
        const r = Math.sqrt(s / cnt);
        env[i] = r; if(r > peak) peak = r;
      }
      // Normaliza (0..1) + curva (levanta medios) + seguidor de envolvente:
      // ataque INSTANTÁNEO (preciso en cada golpe) y release suave (caída elegante).
      const relTime = 0.11;                                   // s
      const rel = Math.exp(-(hop / this.sr) / relTime);       // coef. por punto
      let e = 0;
      for(let i = 0; i < n; i++){
        let x = Math.pow(env[i] / peak, 0.72);
        e = x > e ? x : e * rel;
        env[i] = e;
      }
      this.env = env;
      this.ready = true;
      window.__audioReady = true;
    }catch(err){
      console.warn("AudioFX precompute:", err && err.message || err);
      window.__audioReady = true;   // no bloquear el export si algo falla
    }
  },

  // Intensidad exacta del audio en el instante t (interpolación lineal).
  at(t){
    const env = this.env; if(!env) return 0;
    const p = t * this.sr / this.hop;
    if(p <= 0) return env[0] || 0;
    const i = Math.floor(p), f = p - i;
    if(i >= env.length - 1) return env[env.length - 1] || 0;
    return env[i] * (1 - f) + env[i + 1] * f;
  },

  // Ruido determinista 0..1 a partir de un entero (hash) -> glitch reproducible.
  _h(s){
    let n = (s ^ 0x9e3779b9) >>> 0;
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    n = (n ^ (n >>> 16)) >>> 0;
    return n / 4294967295;
  },

  loop(){
    this.raf = requestAnimationFrame(() => this.loop());
    const v = document.getElementById("video");
    if(!v) return;
    const t = v.currentTime || 0;
    const lvl = this.at(t);
    this.level = lvl;
    this.glitch = lvl;

    // Glitch DETERMINISTA en función del tiempo (mismo t -> mismo desplazamiento).
    const off = lvl * this.MAXOFF;
    const seed = Math.round(t * 1000);           // ms
    const jx1 = (this._h(seed) * 2 - 1) * off;
    const jy1 = (this._h(seed + 101) * 2 - 1) * off;
    const jx2 = (this._h(seed + 7) * 2 - 1) * -off;
    const jy2 = (this._h(seed + 211) * 2 - 1) * -off;

    const st = document.body.style;
    st.setProperty("--beat", lvl.toFixed(4));
    st.setProperty("--gx1", jx1.toFixed(2) + "px");
    st.setProperty("--gy1", jy1.toFixed(2) + "px");
    st.setProperty("--gx2", jx2.toFixed(2) + "px");
    st.setProperty("--gy2", jy2.toFixed(2) + "px");
  }
};
if(typeof window !== "undefined"){
  window.AudioFX = AudioFX;
  // Compatibilidad: app.js llama Beats.enable()
  window.Beats = { enable: () => AudioFX.enable() };
}
