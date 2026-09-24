/*
  Separar INSTRUMENTAL / voz con IA — Mel-Band RoFormer (SOTA para voces).
  Export ONNX "host-STFT" fp16 para WebGPU: el modelo recibe la STFT y devuelve
  una MÁSCARA compleja; aquí hacemos la STFT/iSTFT y aplicamos (1-máscara) para
  quedarnos con el instrumental. Corre en la GPU con onnxruntime-web 1.30.
  DSP verificado: reconstrucción STFT/iSTFT ~1e-14; pipeline completo probado.
*/
(function(){
  const D = window.desktop;
  const $ = id => document.getElementById(id);
  const setStatus = (t) => { $("status").textContent = t; };
  const setBar = (f) => { $("bar").style.width = Math.max(0, Math.min(100, f*100)).toFixed(1) + "%"; };

  if(!(D && D.stemModelEnsure)){
    $("nodesktop").style.display = "block";
    $("go").disabled = true;
    return;
  }

  // ================= FFT radix-2 (n_fft=2048 es potencia de 2) =================
  function fft(re, im, sign){
    const n = re.length;
    for(let i=1,j=0;i<n;i++){ let bit=n>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit;
      if(i<j){ const tr=re[i];re[i]=re[j];re[j]=tr; const ti=im[i];im[i]=im[j];im[j]=ti; } }
    for(let len=2;len<=n;len<<=1){
      const ang=sign*2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang), half=len>>1;
      for(let i=0;i<n;i+=len){
        let cr=1, ci=0;
        for(let k=0;k<half;k++){
          const ur=re[i+k], ui=im[i+k];
          const vr=re[i+k+half]*cr - im[i+k+half]*ci;
          const vi=re[i+k+half]*ci + im[i+k+half]*cr;
          re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+half]=ur-vr; im[i+k+half]=ui-vi;
          const ncr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=ncr;
        }
      }
    }
  }

  // ================= STFT/iSTFT (torch.stft center=True) para el RoFormer =================
  const N_FFT=2048, HOP=441, N_BINS=N_FFT/2+1, TRIM=N_FFT/2;   // 1025 bins
  const T_FR=1101, CHUNK=HOP*(T_FR-1), STEP=Math.round(8*44100);   // ventana ~11s, salto 8s
  const WIN = new Float64Array(N_FFT);
  for(let n=0;n<N_FFT;n++) WIN[n]=0.5-0.5*Math.cos(2*Math.PI*n/N_FFT);      // hann periódica
  const HAM = new Float64Array(CHUNK);
  for(let n=0;n<CHUNK;n++) HAM[n]=0.54-0.46*Math.cos(2*Math.PI*n/(CHUNK-1)); // hamming (solape entre trozos)
  function reflectPad(x, p){
    const Ln=x.length, out=new Float64Array(Ln+2*p);
    for(let i=0;i<Ln;i++) out[p+i]=x[i];
    for(let i=1;i<=p;i++){ out[p-i]=x[i]; out[p+Ln-1+i]=x[Ln-1-i]; }
    return out;
  }
  function stft(x){
    const xp=reflectPad(x, TRIM);
    const frames=1+Math.floor((xp.length-N_FFT)/HOP);
    const RE=Array.from({length:frames},()=>new Float64Array(N_BINS));
    const IM=Array.from({length:frames},()=>new Float64Array(N_BINS));
    const fr=new Float64Array(N_FFT), fi=new Float64Array(N_FFT);
    for(let m=0;m<frames;m++){
      const off=m*HOP;
      for(let n=0;n<N_FFT;n++){ fr[n]=xp[off+n]*WIN[n]; fi[n]=0; }
      fft(fr,fi,-1);
      const rm=RE[m], imm=IM[m];
      for(let k=0;k<N_BINS;k++){ rm[k]=fr[k]; imm[k]=fi[k]; }
    }
    return { RE, IM, frames };
  }
  function istft(RE, IM, frames){
    const len=(frames-1)*HOP+N_FFT;
    const xp=new Float64Array(len), ws=new Float64Array(len);
    const fr=new Float64Array(N_FFT), fi=new Float64Array(N_FFT);
    for(let m=0;m<frames;m++){
      fr.fill(0); fi.fill(0);
      const rm=RE[m], imm=IM[m];
      for(let k=0;k<N_BINS;k++){ fr[k]=rm[k]; fi[k]=imm[k]; }
      for(let k=1;k<N_BINS-1;k++){ fr[N_FFT-k]=fr[k]; fi[N_FFT-k]=-fi[k]; }
      fft(fr,fi,+1);
      const off=m*HOP;
      for(let n=0;n<N_FFT;n++){ const v=(fr[n]/N_FFT)*WIN[n]; xp[off+n]+=v; ws[off+n]+=WIN[n]*WIN[n]; }
    }
    for(let i=0;i<len;i++){ if(ws[i]>1e-8) xp[i]/=ws[i]; }
    return xp.subarray(TRIM, len-TRIM);
  }

  // ================= carga del modelo (una vez) =================
  let ort=null, sess=null, modelBase=null, engine="GPU";
  async function ensureModel(){
    if(sess) return;
    setStatus("Preparando el modelo de IA (se descarga una vez, ~710 MB)…");
    D.onStemProgress(p => { if(p && p.total){ setStatus("⬇️ " + (p.label||"") + "  (" + (p.done).toFixed(1) + "/" + p.total + ")"); setBar(p.done/p.total); } });
    const r = await D.stemModelEnsure();
    if(!r || !r.ok) throw new Error((r && r.error) || "no se pudo preparar el modelo");
    modelBase = r.base;
    if(!ort){
      ort = (await import(modelBase + "ort.webgpu.bundle.min.mjs")).default;
      ort.env.wasm.wasmPaths = modelBase;                 // runtime asyncify, mismo origen
      const iso = (typeof SharedArrayBuffer !== "undefined") && (self.crossOriginIsolated !== false);
      ort.env.wasm.numThreads = iso ? Math.min(navigator.hardwareConcurrency || 4, 8) : 1;
      ort.env.wasm.proxy = false;
    }
    setBar(0.02);
    const modelUrl = modelBase + r.model;
    const ext = [{ path: r.dataName, data: modelBase + r.dataName }];   // pesos externos (.onnx.data)
    engine = "GPU";
    if(navigator.gpu){
      try{ setStatus("Cargando el modelo en la GPU…"); sess = await ort.InferenceSession.create(modelUrl, { executionProviders:["webgpu"], externalData: ext }); }
      catch(e){ sess = null; console.warn("webgpu:", e); }
    }
    if(!sess){
      engine = "CPU";
      setStatus("Sin GPU disponible: cargando en CPU (irá lento)…");
      sess = await ort.InferenceSession.create(modelUrl, { executionProviders:["wasm"], externalData: ext });
    }
  }

  // ================= decodificar + remuestrear a 44100 estéreo =================
  async function decodeAudioBytes(arr){
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ac.decodeAudioData(arr.slice(0));
    ac.close && ac.close();
    let L, R;
    if(Math.abs(buf.sampleRate - 44100) < 1){
      L = buf.getChannelData(0); R = buf.numberOfChannels>1 ? buf.getChannelData(1) : buf.getChannelData(0);
    }else{
      const off = new OfflineAudioContext(2, Math.ceil(buf.duration*44100), 44100);
      const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
      const rb = await off.startRendering();
      L = rb.getChannelData(0); R = rb.numberOfChannels>1 ? rb.getChannelData(1) : rb.getChannelData(0);
    }
    return { L: Float32Array.from(L), R: Float32Array.from(R) };
  }

  // ================= separación (RoFormer: máscara compleja + solape Hamming) =================
  async function demix(L, R, onProg){
    const N = L.length;
    const accL = new Float64Array(N), accR = new Float64Array(N), accW = new Float64Array(N);
    const cl = new Float64Array(CHUNK), cr = new Float64Array(CHUNK);
    const nWin = Math.max(1, Math.ceil(N / STEP));
    let wi = 0;
    for(let i=0; i<N; i+=STEP){
      for(let n=0;n<CHUNK;n++){ cl[n]=L[i+n]||0; cr[n]=R[i+n]||0; }
      const SL = stft(cl), SR = stft(cr), fr = SL.frames;
      // empaqueta [1,2050,T,2], fila = 2*freq + canal, último eje = (re, im)
      const data = new Float32Array(2050*T_FR*2);
      for(let f=0; f<N_BINS; f++) for(let c=0; c<2; c++){
        const RE=c?SR.RE:SL.RE, IM=c?SR.IM:SL.IM, row=2*f+c;
        for(let m=0;m<fr;m++){ const idx=row*(T_FR*2)+m*2; data[idx]=RE[m][f]; data[idx+1]=IM[m][f]; }
      }
      const res = await sess.run({ stft_repr: new ort.Tensor("float32", data, [1,2050,T_FR,2]) });
      const mk = res.masks.data;
      // instrumental = (1 - máscara) · entrada  (por canal)
      const IRE=[Array.from({length:fr},()=>new Float64Array(N_BINS)),Array.from({length:fr},()=>new Float64Array(N_BINS))];
      const IIM=[Array.from({length:fr},()=>new Float64Array(N_BINS)),Array.from({length:fr},()=>new Float64Array(N_BINS))];
      for(let f=0; f<N_BINS; f++) for(let c=0; c<2; c++){
        const RE=c?SR.RE:SL.RE, IM=c?SR.IM:SL.IM, row=2*f+c;
        for(let m=0;m<fr;m++){
          const idx=row*(T_FR*2)+m*2, mr=mk[idx], mi=mk[idx+1], xr=RE[m][f], xi=IM[m][f];
          const vr=mr*xr-mi*xi, vi=mr*xi+mi*xr;   // voz
          IRE[c][m][f]=xr-vr; IIM[c][m][f]=xi-vi; // instrumental = mezcla - voz
        }
      }
      const wl = istft(IRE[0],IIM[0],fr), wr = istft(IRE[1],IIM[1],fr);
      for(let n=0;n<CHUNK;n++){ const g=i+n; if(g<N){ const w=HAM[n]; accL[g]+=wl[n]*w; accR[g]+=wr[n]*w; accW[g]+=w; } }
      wi++;
      if(onProg) onProg(Math.min(1, wi/nWin));
      await new Promise(res2 => setTimeout(res2, 0));
    }
    let peak=0;
    for(let i=0;i<N;i++){ if(accW[i]>1e-8){ accL[i]/=accW[i]; accR[i]/=accW[i]; } const a=Math.abs(accL[i]), b=Math.abs(accR[i]); if(a>peak)peak=a; if(b>peak)peak=b; }
    const scale = peak>0.99 ? 0.99/peak : 1;   // normalización de pico (evita saturación)
    const oL=new Float32Array(N), oR=new Float32Array(N);
    for(let i=0;i<N;i++){ oL[i]=accL[i]*scale; oR[i]=accR[i]*scale; }
    return { L: oL, R: oR };
  }

  // ================= WAV 16-bit estéreo =================
  function encodeWav(L, R){
    const n = L.length, b = new ArrayBuffer(44 + n*4), v = new DataView(b);
    const ws = (o,s) => { for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
    ws(0,"RIFF"); v.setUint32(4, 36+n*4, true); ws(8,"WAVE"); ws(12,"fmt ");
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true);
    v.setUint32(24,44100,true); v.setUint32(28,44100*4,true); v.setUint16(32,4,true); v.setUint16(34,16,true);
    ws(36,"data"); v.setUint32(40, n*4, true);
    let p=44;
    for(let i=0;i<n;i++){
      let a=Math.max(-1,Math.min(1,L[i])); v.setInt16(p, a<0?a*32768:a*32767, true); p+=2;
      let c=Math.max(-1,Math.min(1,R[i])); v.setInt16(p, c<0?c*32768:c*32767, true); p+=2;
    }
    return new Uint8Array(b);
  }
  function toBase64(bytes){
    return new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1]);
      fr.readAsDataURL(new Blob([bytes]));
    });
  }

  // ================= UI =================
  let pickedBytes = null, pickedName = "", resultBytes = null, resultUrl = null;
  const pick = $("pick"), go = $("go"), saveBtn = $("save"), prev = $("preview");

  pick.onclick = async () => {
    try{
      const r = await D.pickAudioFile();
      if(!r || !r.ok){ if(r && r.error) setStatus("✕ " + r.error); return; }
      pickedBytes = (r.bytes instanceof Uint8Array) ? r.bytes : new Uint8Array(r.bytes);
      pickedName = r.name || "audio";
      $("fname").textContent = "🎵 " + pickedName;
      go.disabled = false;
      setStatus("");
    }catch(e){ setStatus("✕ " + (e.message||e)); }
  };

  go.onclick = async () => {
    if(!pickedBytes){ setStatus("Elige un archivo de audio primero."); return; }
    go.disabled = true; saveBtn.disabled = true; $("result").style.display="none";
    resultBytes = null; if(resultUrl){ URL.revokeObjectURL(resultUrl); resultUrl=null; }
    try{
      await ensureModel();
      setStatus("Decodificando el audio…"); setBar(0.02);
      const ab = pickedBytes.buffer.slice(pickedBytes.byteOffset, pickedBytes.byteOffset + pickedBytes.byteLength);
      const { L, R } = await decodeAudioBytes(ab);
      setStatus("Separando en " + engine + "…"); setBar(0);
      const t0 = performance.now();
      const out = await demix(L, R, f => { setBar(f); setStatus("Separando en " + engine + "… " + Math.round(f*100) + "%"); });
      const secs = ((performance.now()-t0)/1000).toFixed(0);
      setStatus("Codificando el instrumental…"); setBar(1);
      resultBytes = encodeWav(out.L, out.R);
      resultUrl = URL.createObjectURL(new Blob([resultBytes], { type:"audio/wav" }));
      prev.src = resultUrl;
      $("result").style.display = "block";
      saveBtn.disabled = false;
      setStatus("✅ Listo en " + secs + "s (" + engine + "). Escúchalo abajo y guárdalo en tu PC.");
    }catch(e){
      setStatus("✕ " + (e.message || e));
    }finally{
      go.disabled = false;
    }
  };

  saveBtn.onclick = async () => {
    if(!resultBytes){ return; }
    saveBtn.disabled = true; const t = saveBtn.textContent; saveBtn.textContent = "Guardando…";
    try{
      const b64 = await toBase64(resultBytes);
      const r = await D.saveInstrumentalFile({ wavB64: b64, name: pickedName });
      if(r && r.ok){ setStatus("✅ Guardado: " + r.path); saveBtn.textContent = "✅ Guardado"; }
      else if(r && r.canceled){ saveBtn.textContent = t; saveBtn.disabled = false; }
      else { setStatus("✕ " + ((r && r.error) || "no se pudo guardar")); saveBtn.textContent = t; saveBtn.disabled = false; }
    }catch(e){ setStatus("✕ " + (e.message||e)); saveBtn.textContent = t; saveBtn.disabled = false; }
  };
})();
