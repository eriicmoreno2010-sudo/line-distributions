/*
  Separar INSTRUMENTAL / voz con IA (MDX-Net UVR-MDX-NET-Inst_HQ_3).
  Corre en el navegador con onnxruntime-web (WASM). El modelo "Inst" saca
  directamente el instrumental (a favor de la instrumental, como pidió el user).
  El DSP (STFT/iSTFT compatible con torch.stft, FFT de Bluestein para n_fft=6144)
  está verificado con reconstrucción de ~3e-7 antes de integrarlo.
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

  // ================= FFT (radix-2 iterativa, in-place). sign=-1 fwd, +1 inv =================
  function fft(re, im, sign){
    const n = re.length;
    for(let i=1,j=0;i<n;i++){ let bit=n>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit;
      if(i<j){ const tr=re[i];re[i]=re[j];re[j]=tr; const ti=im[i];im[i]=im[j];im[j]=ti; } }
    for(let len=2;len<=n;len<<=1){
      const ang = sign*2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang), half=len>>1;
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
  // ================= Bluestein (DFT de tamaño arbitrario; fwd + inv por conjugado) =========
  function makeBluestein(N){
    let M=1; while(M < 2*N-1) M<<=1;
    const cosT=new Float64Array(N), sinT=new Float64Array(N);
    for(let n=0;n<N;n++){ const a=Math.PI*((n*n)%(2*N))/N; cosT[n]=Math.cos(a); sinT[n]=Math.sin(a); }
    const br=new Float64Array(M), bi=new Float64Array(M);
    br[0]=cosT[0]; bi[0]=sinT[0];
    for(let n=1;n<N;n++){ br[n]=cosT[n]; bi[n]=sinT[n]; br[M-n]=cosT[n]; bi[M-n]=sinT[n]; }
    fft(br,bi,-1);
    return { N, M, cosT, sinT, br, bi, ar:new Float64Array(M), ai:new Float64Array(M) };
  }
  function dftFwd(bs, xr, xi){
    const {N,M,cosT,sinT,br,bi,ar,ai}=bs;
    ar.fill(0); ai.fill(0);
    for(let n=0;n<N;n++){ const c=cosT[n], s=sinT[n]; ar[n]=xr[n]*c + xi[n]*s; ai[n]=xi[n]*c - xr[n]*s; }
    fft(ar,ai,-1);
    for(let k=0;k<M;k++){ const r=ar[k]*br[k]-ai[k]*bi[k], i=ar[k]*bi[k]+ai[k]*br[k]; ar[k]=r; ai[k]=i; }
    fft(ar,ai,+1);
    const outr=new Float64Array(N), outi=new Float64Array(N), inv=1/M;
    for(let k=0;k<N;k++){ const c=cosT[k], s=sinT[k], rr=ar[k]*inv, ii=ai[k]*inv;
      outr[k]=rr*c + ii*s; outi[k]=ii*c - rr*s; }
    return { r:outr, i:outi };
  }
  function dftInv(bs, xr, xi){
    const nxi=new Float64Array(xr.length); for(let i=0;i<xr.length;i++) nxi[i]=-xi[i];
    const t=dftFwd(bs, xr, nxi);
    for(let i=0;i<t.i.length;i++) t.i[i]=-t.i[i];
    return t;
  }

  // ================= STFT / iSTFT compatibles con torch.stft(center=True) =================
  const N_FFT=6144, HOP=1024, DIM_F=3072, N_BINS=N_FFT/2+1, TRIM=N_FFT/2;
  const DIM_T=256, CHUNK=HOP*(DIM_T-1), GEN=CHUNK-2*TRIM;
  const bs = makeBluestein(N_FFT);
  const WIN = new Float64Array(N_FFT);
  for(let n=0;n<N_FFT;n++) WIN[n]=0.5-0.5*Math.cos(2*Math.PI*n/N_FFT); // hann periódica
  function reflectPad(x, p){
    const L=x.length, out=new Float64Array(L+2*p);
    for(let i=0;i<L;i++) out[p+i]=x[i];
    for(let i=1;i<=p;i++){ out[p-i]=x[i]; out[p+L-1+i]=x[L-1-i]; }
    return out;
  }
  function stftReal(x){
    const xp=reflectPad(x, TRIM);
    const frames=1+Math.floor((xp.length-N_FFT)/HOP);
    const re=Array.from({length:frames},()=>new Float64Array(DIM_F));
    const im=Array.from({length:frames},()=>new Float64Array(DIM_F));
    const fr=new Float64Array(N_FFT), fi=new Float64Array(N_FFT);
    for(let m=0;m<frames;m++){
      const off=m*HOP;
      for(let n=0;n<N_FFT;n++){ fr[n]=xp[off+n]*WIN[n]; fi[n]=0; }
      const R=dftFwd(bs, fr, fi);
      const rm=re[m], imm=im[m];
      for(let k=0;k<DIM_F;k++){ rm[k]=R.r[k]; imm[k]=R.i[k]; }
    }
    return { re, im, frames };
  }
  function istftReal(re, im, frames){
    const len=(frames-1)*HOP+N_FFT;
    const xp=new Float64Array(len), wsum=new Float64Array(len);
    const fr=new Float64Array(N_FFT), fi=new Float64Array(N_FFT);
    for(let m=0;m<frames;m++){
      fr.fill(0); fi.fill(0);
      const rm=re[m], imm=im[m];
      for(let k=0;k<DIM_F;k++){ fr[k]=rm[k]; fi[k]=imm[k]; }
      for(let k=1;k<N_BINS-1;k++){ fr[N_FFT-k]=fr[k]; fi[N_FFT-k]=-fi[k]; }
      const R=dftInv(bs, fr, fi);
      const off=m*HOP;
      for(let n=0;n<N_FFT;n++){ const v=(R.r[n]/N_FFT)*WIN[n]; xp[off+n]+=v; wsum[off+n]+=WIN[n]*WIN[n]; }
    }
    for(let i=0;i<len;i++){ if(wsum[i]>1e-8) xp[i]/=wsum[i]; }
    return xp.subarray(TRIM, len-TRIM);
  }

  // ================= carga del modelo (una vez) =================
  let ort=null, sess=null, modelBase=null, engine="CPU";
  async function ensureModel(){
    if(sess) return;
    setStatus("Preparando el modelo de IA (se descarga una vez, ~70 MB)…");
    D.onStemProgress(p => { if(p && p.total){ setStatus("⬇️ " + (p.label||"") + "  (" + p.done + "/" + p.total + ")"); setBar(p.done/p.total); } });
    const r = await D.stemModelEnsure();
    if(!r || !r.ok) throw new Error((r && r.error) || "no se pudo preparar el modelo");
    modelBase = r.base;
    if(!ort){
      // bundle WebGPU (corre en la GPU); trae también el motor wasm de reserva
      ort = (await import(modelBase + "ort.webgpu.bundle.min.mjs")).default;
      ort.env.wasm.wasmPaths = modelBase;   // ort-*.jsep.wasm/.mjs y wasm normal (mismo origen)
      const iso = (typeof SharedArrayBuffer !== "undefined") && (self.crossOriginIsolated !== false);
      ort.env.wasm.numThreads = iso ? Math.min(navigator.hardwareConcurrency || 4, 8) : 1;
      ort.env.wasm.proxy = false;
    }
    setBar(0.02);
    const modelUrl = modelBase + r.model;
    // 1º intenta GPU (WebGPU, rapidísimo); si no hay GPU, cae a CPU (wasm)
    engine = "GPU";
    if(navigator.gpu){
      try{ setStatus("Cargando el modelo en la GPU…"); sess = await ort.InferenceSession.create(modelUrl, { executionProviders:["webgpu"] }); }
      catch(e){ sess = null; }
    }
    if(!sess){
      engine = "CPU";
      setStatus("Cargando el modelo en la CPU… (sin GPU, irá más lento)");
      try{ sess = await ort.InferenceSession.create(modelUrl, { executionProviders:["wasm"] }); }
      catch(e){ ort.env.wasm.numThreads = 1; sess = await ort.InferenceSession.create(modelUrl, { executionProviders:["wasm"] }); }
    }
  }

  // ================= decodificar + remuestrear a 44100 estéreo =================
  async function decodeAudioBytes(arr){
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ac.decodeAudioData(arr.slice(0));   // slice: evita detached buffer
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

  // ================= separación (mismo chunking que UVR/MDX) =================
  const COMPENSATE = 1.030848;   // factor del modelo Inst_HQ_3 (nivel correcto)
  const DENOISE = true;          // como UVR: pasa +x y -x y promedia -> quita artefactos
  async function runModel(data, fr){
    const res = await sess.run({ input: new ort.Tensor("float32", data, [1,4,DIM_F,fr]) });
    return res.output.data;
  }
  async function demix(L, R, onProg){
    const N = L.length;
    const pad = GEN - (N % GEN);
    const total = TRIM + N + pad + TRIM;
    const padL = new Float64Array(total), padR = new Float64Array(total);
    padL.set(L, TRIM); padR.set(R, TRIM);
    const outL = new Float64Array(total), outR = new Float64Array(total);
    const nChunks = Math.floor((total - CHUNK) / GEN) + 1;
    const plane = DIM_F * DIM_T;
    let done = 0;
    const steps = DENOISE ? 2 : 1;
    for(let i=0; i+CHUNK<=total; i+=GEN){
      const cl = padL.subarray(i, i+CHUNK), cr = padR.subarray(i, i+CHUNK);
      const SL = stftReal(cl), SR = stftReal(cr), fr = SL.frames;
      const data = new Float32Array(4*DIM_F*fr);
      for(let f=0;f<fr;f++){
        const slr=SL.re[f], sli=SL.im[f], srr=SR.re[f], sri=SR.im[f];
        for(let k=0;k<DIM_F;k++){
          const idx=k*fr+f;
          data[idx]=slr[k]; data[plane+idx]=sli[k]; data[2*plane+idx]=srr[k]; data[3*plane+idx]=sri[k];
        }
      }
      // salida = compensate * ( denoise ? (model(x) - model(-x))/2 : model(x) )
      const oPos = await runModel(data, fr);
      let o = new Float32Array(oPos.length);
      if(DENOISE){
        const neg = new Float32Array(data.length); for(let j=0;j<data.length;j++) neg[j] = -data[j];
        done += 0.5/nChunks; if(onProg) onProg(done);
        await new Promise(r => setTimeout(r, 0));
        const oNeg = await runModel(neg, fr);
        for(let j=0;j<o.length;j++) o[j] = (oPos[j] - oNeg[j]) * 0.5 * COMPENSATE;
      }else{
        for(let j=0;j<o.length;j++) o[j] = oPos[j] * COMPENSATE;
      }
      const orl=Array.from({length:fr},()=>new Float64Array(DIM_F)), oil=Array.from({length:fr},()=>new Float64Array(DIM_F));
      const orr=Array.from({length:fr},()=>new Float64Array(DIM_F)), oir=Array.from({length:fr},()=>new Float64Array(DIM_F));
      for(let f=0;f<fr;f++) for(let k=0;k<DIM_F;k++){ const idx=k*fr+f;
        orl[f][k]=o[idx]; oil[f][k]=o[plane+idx]; orr[f][k]=o[2*plane+idx]; oir[f][k]=o[3*plane+idx]; }
      const wl=istftReal(orl,oil,fr), wr=istftReal(orr,oir,fr);
      for(let n=0;n<GEN;n++){ outL[i+TRIM+n]=wl[TRIM+n]; outR[i+TRIM+n]=wr[TRIM+n]; }
      done = Math.max(done, (Math.floor(i/GEN)+1)/nChunks);
      if(onProg) onProg(done);
      await new Promise(r => setTimeout(r, 0));   // deja respirar a la UI
    }
    return { L: outL.subarray(TRIM, TRIM+N), R: outR.subarray(TRIM, TRIM+N) };
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
      // r.bytes llega como Uint8Array/Buffer por IPC
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
      // copia a un ArrayBuffer propio para decodeAudioData
      const ab = pickedBytes.buffer.slice(pickedBytes.byteOffset, pickedBytes.byteOffset + pickedBytes.byteLength);
      const { L, R } = await decodeAudioBytes(ab);
      setStatus("Separando la voz del instrumental… (esto tarda un poco)"); setBar(0);
      const t0 = performance.now();
      const out = await demix(L, R, f => { setBar(f); setStatus("Separando en " + engine + "… " + Math.round(f*100) + "%"); });
      const secs = ((performance.now()-t0)/1000).toFixed(0);
      setStatus("Codificando el instrumental…"); setBar(1);
      resultBytes = encodeWav(out.L, out.R);
      resultUrl = URL.createObjectURL(new Blob([resultBytes], { type:"audio/wav" }));
      prev.src = resultUrl;
      $("result").style.display = "block";
      saveBtn.disabled = false;
      setStatus("✅ Listo en " + secs + "s. Escúchalo abajo y guárdalo en tu PC.");
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
