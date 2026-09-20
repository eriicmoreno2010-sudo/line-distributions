/* Editor de recorte con LAZO, BORRADOR y varias CAPAS. La foto ORIGINAL nunca se
   toca (capa base, de guía atenuada). Cada CAPA de recorte guarda lo que rodeas
   con el lazo (tomado de la original). El borrador quita de la capa ACTIVA. Puedes
   añadir varias capas y verlas a la vez. Se guarda la MEZCLA de todas las capas de
   recorte (PNG con transparencia). Trabaja a máxima calidad (limitada a MAXDIM). */
(function(){
  const $ = s => document.querySelector(s);
  const D = window.desktop;
  const P = new URLSearchParams(location.search);
  const IMG  = P.get("img")  || "";
  const NAME = P.get("name") || "";
  const SONG = P.get("song") || "";
  const BACK = P.get("back") || "";
  if($("#who")) $("#who").textContent = NAME || "Foto";
  // si venimos de otra página (p.ej. la portada), el botón "←" vuelve allí
  if(BACK){ const bb = document.querySelector("header button"); if(bb) bb.onclick = () => { location.href = BACK; }; }

  const MAXDIM = 2048, HISTMAX = 14;

  const view = $("#view"), vctx = view.getContext("2d");
  const orig = document.createElement("canvas"); let octx;   // capa ORIGINAL (intacta)
  let W = 0, H = 0, scale = 1, ox = 0, oy = 0;
  let tool = "lazo", brush = 70, tol = 55;
  let aiLib = null, aiRawCanvas = null, aiSolid = 0;   // recorte con IA (@imgly)
  let showOrig = false;   // por defecto NO se muestra (así ves el fondo YA quitado en vivo)
  let hasCut = false;     // ¿hay algo recortado ya? (antes del 1er lazo se ve la original para apuntar)
  let layers = [];        // [{canvas, ctx, name}]
  let active = 0;
  let history = [];       // [{layer, data}]
  let lassoing = false, lassoPts = [], ptr = null;
  let circling = false, circC = null, circR = 0;   // recorte en CÍRCULO perfecto

  // patrón de cuadros (transparencia)
  const chk = document.createElement("canvas"); chk.width = chk.height = 22;
  const cc = chk.getContext("2d");
  cc.fillStyle = "#3a3a46"; cc.fillRect(0,0,22,22);
  cc.fillStyle = "#2b2b34"; cc.fillRect(0,0,11,11); cc.fillRect(11,11,11,11);
  let chkPat = null;

  function newLayer(name){
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    return { canvas:c, ctx:c.getContext("2d"), name: name || ("Recorte " + (layers.length+1)) };
  }

  // Espejo HORIZONTAL de todo (original + capas): izquierda <-> derecha.
  function flipCanvasH(c){
    const t = document.createElement("canvas"); t.width = c.width; t.height = c.height;
    const x = t.getContext("2d"); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0);
    const cx = c.getContext("2d"); cx.clearRect(0, 0, c.width, c.height); cx.drawImage(t, 0, 0);
  }
  function flipH(){
    if(!W) return;
    flipCanvasH(orig); layers.forEach(l => flipCanvasH(l.canvas));
    history = []; if($("#undo")) $("#undo").disabled = true; redraw();
  }
  // Gira 90° en sentido horario todo (original + capas); intercambia ancho/alto.
  function rotate90(){
    if(!W) return;
    const nw = H, nh = W;
    const rot = src => { const t = document.createElement("canvas"); t.width = nw; t.height = nh;
      const x = t.getContext("2d"); x.translate(nw, 0); x.rotate(Math.PI/2); x.drawImage(src, 0, 0); return t; };
    const no = rot(orig); orig.width = nw; orig.height = nh; octx = orig.getContext("2d"); octx.drawImage(no, 0, 0);
    layers.forEach(l => { const nl = rot(l.canvas); l.canvas.width = nw; l.canvas.height = nh; l.ctx = l.canvas.getContext("2d"); l.ctx.drawImage(nl, 0, 0); });
    W = nw; H = nh; history = []; if($("#undo")) $("#undo").disabled = true;
    fitImage(); redraw();
  }
  function actLayer(){ return layers[active]; }

  function resizeView(){
    const r = view.parentElement.getBoundingClientRect();
    view.width  = Math.max(50, Math.floor(r.width));
    view.height = Math.max(50, Math.floor(r.height));
    chkPat = vctx.createPattern(chk, "repeat");
  }
  function fitImage(){
    if(!W) return;
    const s = Math.min(view.width/W, view.height/H) * 0.96;
    scale = s; ox = (view.width - W*s)/2; oy = (view.height - H*s)/2;
  }
  function redraw(){
    vctx.setTransform(1,0,0,1,0,0);
    vctx.fillStyle = "#0d0d12"; vctx.fillRect(0,0,view.width,view.height);
    if(!W) return;
    const dw = W*scale, dh = H*scale;
    vctx.save(); vctx.beginPath(); vctx.rect(ox,oy,dw,dh); vctx.clip();
    if(chkPat){ vctx.fillStyle = chkPat; vctx.fillRect(ox,oy,dw,dh); }
    vctx.restore();
    vctx.imageSmoothingEnabled = true; vctx.imageSmoothingQuality = "high";
    // Original: antes del 1er recorte se ve ENTERA (para apuntar); después solo si
    // activas "👁 Original" y muy tenue (guía). Así, al recortar, VES el fondo quitado.
    if(!hasCut){ vctx.drawImage(orig, ox,oy,dw,dh); }
    else if(showOrig){ vctx.globalAlpha = 0.18; vctx.drawImage(orig, ox,oy,dw,dh); vctx.globalAlpha = 1; }
    layers.forEach(l => vctx.drawImage(l.canvas, ox,oy,dw,dh));
    if(lassoing && lassoPts.length > 1){
      vctx.beginPath();
      vctx.moveTo(ox + lassoPts[0].x*scale, oy + lassoPts[0].y*scale);
      for(let i=1;i<lassoPts.length;i++) vctx.lineTo(ox + lassoPts[i].x*scale, oy + lassoPts[i].y*scale);
      vctx.setLineDash([7,5]);
      vctx.strokeStyle = "rgba(0,0,0,.7)"; vctx.lineWidth = 3; vctx.stroke();
      vctx.strokeStyle = "rgba(255,255,255,.95)"; vctx.lineWidth = 1.5; vctx.stroke();
      vctx.setLineDash([]);
    }
    if(circling && circC && circR > 0){
      vctx.beginPath();
      vctx.arc(ox + circC.x*scale, oy + circC.y*scale, circR*scale, 0, 7);
      vctx.setLineDash([7,5]);
      vctx.strokeStyle = "rgba(0,0,0,.7)"; vctx.lineWidth = 3; vctx.stroke();
      vctx.strokeStyle = "rgba(255,255,255,.95)"; vctx.lineWidth = 1.5; vctx.stroke();
      vctx.setLineDash([]);
    }
    if(ptr && tool === "erase"){
      vctx.beginPath(); vctx.arc(ptr.x, ptr.y, brush/2, 0, 7);
      vctx.strokeStyle = "rgba(255,90,90,.9)"; vctx.lineWidth = 1.5; vctx.stroke();
    }
  }

  async function load(){
    let url = IMG;
    if(D && D.cutoutLoad){ try{ const r = await D.cutoutLoad({ imagePath: IMG }); if(r && r.ok) url = r.src; }catch(e){} }
    if(!url){ alert("No hay foto que editar."); return; }
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, MAXDIM / Math.max(im.naturalWidth, im.naturalHeight));
      W = Math.round(im.naturalWidth*k); H = Math.round(im.naturalHeight*k);
      orig.width = W; orig.height = H; octx = orig.getContext("2d"); octx.drawImage(im,0,0,W,H);
      layers = [ newLayer("Recorte 1") ]; active = 0;
      // Si la foto YA venía recortada (transparente), arráncala como recorte 1.
      try{
        const id = octx.getImageData(0,0,W,H).data; let hasAlpha = false;
        for(let p=3; p<id.length; p+=4*997){ if(id[p] < 250){ hasAlpha = true; break; } }
        if(hasAlpha){ layers[0].ctx.drawImage(orig,0,0); hasCut = true; }
      }catch(e){}
      $("#layOrig").classList.toggle("on", showOrig);
      renderLayerBtns(); resizeView(); fitImage(); redraw();
    };
    im.onerror = () => alert("No se pudo cargar la foto.");
    im.src = url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now();
  }

  function toWork(e){
    const r = view.getBoundingClientRect();
    return { x:(e.clientX - r.left - ox)/scale, y:(e.clientY - r.top - oy)/scale,
             vx:(e.clientX - r.left), vy:(e.clientY - r.top) };
  }

  function snapshot(){
    try{ history.push({ layer: active, data: actLayer().ctx.getImageData(0,0,W,H) });
         if(history.length > HISTMAX) history.shift(); }catch(e){}
    $("#undo").disabled = history.length === 0;
  }
  function undo(){
    const s = history.pop(); if(!s) return;
    if(layers[s.layer]){ layers[s.layer].ctx.putImageData(s.data,0,0); redraw(); }
    $("#undo").disabled = history.length === 0;
  }

  // AÑADE la zona rodeada (de la original) a la capa ACTIVA.
  function addLasso(pts){
    if(pts.length < 3 || !actLayer()) return;
    snapshot();
    const x = actLayer().ctx;
    x.save();
    x.beginPath(); x.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length;i++) x.lineTo(pts[i].x, pts[i].y);
    x.closePath(); x.clip();
    x.drawImage(orig, 0, 0);
    x.restore();
    hasCut = true;                 // ya hay recorte -> se ve el fondo quitado
    redraw();
  }
  /* QUITAR FONDO AUTOMÁTICO de la CAPA ACTIVA (lo que has recortado con el lazo).
     Toma el color del fondo del BORDE de tu recorte (los píxeles pegados a la zona
     transparente) y, si la capa está entera, del borde de la imagen. Luego rellena
     desde fuera hacia dentro quitando todo lo que se parezca a ese color (± "Sensib.").
     Así limpias el fondo que quedó DENTRO del lazo, sin tocar el original. */
  function autoRemoveBg(){
    if(!W || !actLayer()) return;
    const lctx = actLayer().ctx;
    const src = lctx.getImageData(0,0,W,H), sd = src.data;
    const N = W*H;
    const A = i => sd[i*4+3];
    // ¿hay algo recortado en esta capa?
    let opaque = 0; for(let p=0;p<N;p++){ if(A(p) > 10){ opaque++; } }
    if(!opaque){ alert("Esta capa está vacía. Rodea antes al miembro con el lazo y quita el fondo de dentro."); return; }
    const full = opaque > N*0.985;                 // capa entera (no lazada) -> muestrea bordes de imagen

    // ---- color del fondo a quitar ----
    let br=0,bg=0,bb=0,bn=0;
    const addC = p => { const i=p*4; br+=sd[i]; bg+=sd[i+1]; bb+=sd[i+2]; bn++; };
    if(full){
      for(let x=0;x<W;x++){ if(A(x)>10) addC(x); const q=(H-1)*W+x; if(A(q)>10) addC(q); }
      for(let y=0;y<H;y++){ const a=y*W; if(A(a)>10) addC(a); const b=a+W-1; if(A(b)>10) addC(b); }
    } else {
      // píxeles opacos pegados a transparente = borde exterior del recorte = fondo
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const p=y*W+x; if(A(p)<=10) continue;
        if((x>0&&A(p-1)<=10)||(x<W-1&&A(p+1)<=10)||(y>0&&A(p-W)<=10)||(y<H-1&&A(p+W)<=10)) addC(p);
      }
    }
    if(!bn){ alert("No pude detectar el fondo. Prueba a rodear al miembro con un poco de margen y vuelve a intentarlo."); return; }
    br/=bn; bg/=bn; bb/=bn;

    const tol2 = tol*tol*3;                        // umbral (dist. de color al cuadrado)
    const isBg = p => {                            // ¿este píxel es fondo (a quitar)?
      const i=p*4; if(sd[i+3] < 10) return true;   // ya transparente
      const dr=sd[i]-br, dg=sd[i+1]-bg, db=sd[i+2]-bb;
      return (dr*dr+dg*dg+db*db) <= tol2;
    };
    // relleno desde los bordes de la imagen hacia dentro (cruza lo transparente y
    // sigue por el fondo del recorte que sea de color parecido)
    const visited = new Uint8Array(N), bgMask = new Uint8Array(N), stack = [];
    const seed = p => { if(!visited[p]){ visited[p]=1; if(isBg(p)) stack.push(p); } };
    for(let x=0;x<W;x++){ seed(x); seed((H-1)*W+x); }
    for(let y=0;y<H;y++){ seed(y*W); seed(y*W+W-1); }
    while(stack.length){
      const p = stack.pop(); bgMask[p]=1;
      const x=p%W, y=(p/W)|0;
      if(x>0)   seed(p-1);
      if(x<W-1) seed(p+1);
      if(y>0)   seed(p-W);
      if(y<H-1) seed(p+W);
    }
    snapshot();
    // quita el fondo detectado; suaviza un poco el borde para que no quede dentado
    for(let p=0;p<N;p++){
      const i=p*4;
      if(bgMask[p]){ sd[i+3]=0; continue; }
      if(sd[i+3]<10) continue;
      const x=p%W, y=(p/W)|0;
      if((x>0&&bgMask[p-1])||(x<W-1&&bgMask[p+1])||(y>0&&bgMask[p-W])||(y<H-1&&bgMask[p+W])) sd[i+3] = Math.round(sd[i+3]*0.55);
    }
    lctx.putImageData(src,0,0);
    hasCut = true; redraw();
  }

  // AÑADE un CÍRCULO perfecto (de la original) a la capa ACTIVA.
  function addCircle(c, rad){
    if(!c || rad < 2 || !actLayer()) return;
    snapshot();
    const x = actLayer().ctx;
    x.save();
    x.beginPath(); x.arc(c.x, c.y, rad, 0, Math.PI*2); x.closePath(); x.clip();
    x.drawImage(orig, 0, 0);
    x.restore();
    hasCut = true;
    redraw();
  }

  /* ---- Recorte con IA (@imgly/background-removal) ----
     Recorta a la PERSONA con un modelo que corre en el PC. La 1ª vez el proceso
     principal descarga el modelo (~95MB) y lo sirve por http local. */
  // "Solidez": endurece el alpha para rellenar zonas que la IA dejó semitransparentes
  // (típico en ropa oscura sobre fondo oscuro). 0 = tal cual la IA.
  function hardenAlpha(id, s){
    if(s <= 0) return;
    const d = id.data;
    const cut = s * 0.15;                    // por debajo -> transparente
    const up  = 0.5 - s * 0.34;              // por encima -> opaco (a más s, más brusco)
    const span = Math.max(0.02, up - cut);
    for(let i = 3; i < d.length; i += 4){
      const a = d[i] / 255;
      d[i] = a <= cut ? 0 : a >= up ? 255 : Math.round((a - cut) / span * 255);
    }
  }
  function applyAiToLayer(){
    if(!aiRawCanvas || !actLayer()) return;
    const tc = document.createElement("canvas"); tc.width = W; tc.height = H;
    const tx = tc.getContext("2d"); tx.drawImage(aiRawCanvas, 0, 0);
    if(aiSolid > 0){ const id = tx.getImageData(0,0,W,H); hardenAlpha(id, aiSolid); tx.putImageData(id,0,0); }
    const lx = actLayer().ctx;
    lx.clearRect(0,0,W,H); lx.drawImage(tc,0,0);
    hasCut = true; redraw();
  }
  async function aiCutout(){
    if(!(D && D.aiModelEnsure)){ alert("El recorte con IA solo funciona en la app de escritorio."); return; }
    if(!W){ return; }
    const ov = $("#ov"), ovT = $("#ovT");
    ov.classList.add("show"); ovT.textContent = "Preparando IA…";
    try{
      const ready = await D.aiModelEnsure();
      if(!ready || !ready.ok) throw new Error((ready && ready.error) || "no disponible");
      ovT.textContent = "Recortando con IA…";
      if(!aiLib) aiLib = await import(new URL("vendor/imgly/index.mjs?v=2", document.baseURI).href);
      // fuente = original a máxima calidad (ya limitada a MAXDIM)
      const oc = document.createElement("canvas"); oc.width = W; oc.height = H;
      oc.getContext("2d").drawImage(orig, 0, 0);
      const blob = await new Promise(r => oc.toBlob(r, "image/png"));
      const out = await aiLib.removeBackground(blob, {
        publicPath: ready.publicPath, model: "isnet_fp16", device: "cpu",
        progress: (key, cur, total) => {
          if(/fetch/i.test(key)) ovT.textContent = "Cargando IA…";
          else if(/compute|inference/i.test(key)) ovT.textContent = "Recortando con IA…";
        }
      });
      const url = URL.createObjectURL(out);
      const im = new Image(); await new Promise((r,j)=>{ im.onload=r; im.onerror=j; im.src=url; });
      aiRawCanvas = document.createElement("canvas"); aiRawCanvas.width = W; aiRawCanvas.height = H;
      aiRawCanvas.getContext("2d").drawImage(im, 0, 0, W, H);
      URL.revokeObjectURL(url);
      snapshot();
      applyAiToLayer();
      ov.classList.remove("show");
    }catch(e){
      ovT.textContent = "✕ IA: " + (e && e.message || e);
      setTimeout(() => ov.classList.remove("show"), 3200);
    }
  }

  // BORRA (quita) de la capa ACTIVA con el pincel.
  function eraseAt(a, b){
    const x = actLayer() && actLayer().ctx; if(!x) return;
    const rw = (brush/2)/scale;
    const dx=b.x-a.x, dy=b.y-a.y, dist=Math.hypot(dx,dy);
    const n = Math.max(1, Math.ceil(dist/(rw*0.5)));
    x.save(); x.globalCompositeOperation = "destination-out";
    for(let i=0;i<=n;i++){ x.beginPath(); x.arc(a.x+dx*i/n, a.y+dy*i/n, rw, 0, 7); x.fill(); }
    x.restore();
  }

  // ---- interacción ----
  let panning=false, panLast=null, erasing=false, last=null;
  view.addEventListener("pointerdown", e => {
    view.setPointerCapture(e.pointerId);
    if(e.button === 1 || tool === "pan"){ panning=true; panLast={x:e.clientX,y:e.clientY}; return; }
    const w = toWork(e);
    if(tool === "lazo"){ lassoing=true; lassoPts=[w]; }
    else if(tool === "circ"){ circling=true; circC=w; circR=0; }
    else if(tool === "erase"){ erasing=true; snapshot(); last=w; eraseAt(w,w); redraw(); }
  });
  view.addEventListener("pointermove", e => {
    const w = toWork(e); ptr = { x:w.vx, y:w.vy };
    if(panning){ ox += e.clientX-panLast.x; oy += e.clientY-panLast.y; panLast={x:e.clientX,y:e.clientY}; redraw(); return; }
    if(lassoing){ const l=lassoPts[lassoPts.length-1]; if(!l || Math.hypot(w.x-l.x,w.y-l.y) > 2/scale) lassoPts.push(w); redraw(); }
    else if(circling){ circR = Math.hypot(w.x-circC.x, w.y-circC.y); redraw(); }
    else if(erasing){ eraseAt(last,w); last=w; redraw(); }
    else if(tool === "erase") redraw();
  });
  const endPtr = () => {
    panning=false; erasing=false;
    if(lassoing){ lassoing=false; const pts=lassoPts; lassoPts=[]; addLasso(pts); }
    if(circling){ circling=false; const c=circC, r=circR; circC=null; circR=0; addCircle(c, r); }
  };
  view.addEventListener("pointerup", endPtr);
  view.addEventListener("pointercancel", endPtr);
  view.addEventListener("pointerleave", () => { ptr=null; redraw(); });

  view.addEventListener("wheel", e => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    const wx=(mx-ox)/scale, wy=(my-oy)/scale;
    scale = Math.max(0.05, Math.min(40, scale * (e.deltaY>0 ? 0.9 : 1.1)));
    ox = mx-wx*scale; oy = my-wy*scale; redraw();
  }, { passive:false });

  // ---- capas (botones) ----
  function renderLayerBtns(){
    const box = $("#layerList"); box.innerHTML = "";
    layers.forEach((l, i) => {
      const b = document.createElement("button");
      b.textContent = l.name; b.className = (i === active ? "on" : "");
      b.title = "Capa activa (lazo/borrador actúan aquí)";
      b.onclick = () => { active = i; renderLayerBtns(); };
      box.appendChild(b);
    });
    $("#delLayer").disabled = layers.length <= 1;
  }

  // ---- botones ----
  function setTool(t){
    tool = t;
    $("#tLazo").classList.toggle("on", t==="lazo");
    $("#tCirc").classList.toggle("on", t==="circ");
    $("#tErase").classList.toggle("on", t==="erase");
    $("#tPan").classList.toggle("on", t==="pan");
    $("#brushGrp").style.display = (t==="erase") ? "" : "none";
    redraw();
  }
  $("#tLazo").onclick  = () => setTool("lazo");
  $("#tCirc").onclick  = () => setTool("circ");
  $("#tErase").onclick = () => setTool("erase");
  $("#tPan").onclick   = () => setTool("pan");
  $("#flipH").onclick  = () => flipH();
  $("#rot90").onclick  = () => rotate90();
  $("#brush").oninput  = e => { brush = +e.target.value; $("#brushV").textContent = brush; redraw(); };
  $("#tol").oninput    = e => { tol = +e.target.value; $("#tolV").textContent = tol; };
  $("#autoBg").onclick = () => { $("#autoBg").disabled = true; setTimeout(() => { autoRemoveBg(); $("#autoBg").disabled = false; }, 20); };
  if(D && D.onAiProgress) D.onAiProgress(p => {
    if(p && p.total){ const t = $("#ovT"); if(t) t.textContent = p.done < p.total ? ("Descargando IA (1ª vez)… " + Math.round(p.done/p.total*100) + "%") : "Cargando IA…"; }
  });
  $("#aiBg").onclick = () => { $("#aiBg").disabled = true; aiCutout().finally(() => { $("#aiBg").disabled = false; }); };
  $("#aiSolid").oninput = e => { aiSolid = (+e.target.value)/100; $("#aiSolidV").textContent = e.target.value; applyAiToLayer(); };
  if(!(D && D.aiModelEnsure)){ const b = $("#aiBg"); if(b && b.parentElement) b.parentElement.style.display = "none"; }
  $("#layOrig").onclick = () => { showOrig = !showOrig; $("#layOrig").classList.toggle("on", showOrig); redraw(); };
  $("#addLayer").onclick = () => { layers.push(newLayer()); active = layers.length-1; renderLayerBtns(); redraw(); };
  $("#delLayer").onclick = () => {
    if(layers.length <= 1) return;
    if(!confirm("¿Borrar la capa activa (" + actLayer().name + ")?")) return;
    layers.splice(active, 1); if(active >= layers.length) active = layers.length-1;
    history = history.filter(h => h.layer !== active);
    renderLayerBtns(); redraw();
  };
  $("#undo").onclick  = undo;
  $("#fit").onclick   = () => { fitImage(); redraw(); };
  $("#reset").onclick = () => {
    if(!actLayer() || !confirm("¿Vaciar la capa activa (" + actLayer().name + ")?")) return;
    snapshot(); actLayer().ctx.clearRect(0,0,W,H); redraw();
  };

  window.addEventListener("resize", () => { resizeView(); redraw(); });
  document.addEventListener("keydown", e => {
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="z"){ e.preventDefault(); undo(); }
    else if(e.key==="l"||e.key==="L") setTool("lazo");
    else if(e.key==="c"||e.key==="C") setTool("circ");
    else if(e.key==="e"||e.key==="E") setTool("erase");
    else if(e.key===" "){ e.preventDefault(); setTool("pan"); }
    else if(e.key==="["){ brush=Math.max(6,brush-8); $("#brush").value=brush; $("#brushV").textContent=brush; redraw(); }
    else if(e.key==="]"){ brush=Math.min(220,brush+8); $("#brush").value=brush; $("#brushV").textContent=brush; redraw(); }
  });

  // ---- guardar (mezcla de todas las capas de recorte) ----
  $("#save").onclick = async () => {
    if(!W || !(D && D.cutoutSave)){ alert("Guardar solo funciona en la app de escritorio."); return; }
    const flat = document.createElement("canvas"); flat.width = W; flat.height = H;
    const fx = flat.getContext("2d");
    layers.forEach(l => fx.drawImage(l.canvas, 0, 0));
    let empty = true;
    try{ const d = fx.getImageData(0,0,W,H).data; for(let p=3;p<d.length;p+=4*997){ if(d[p]>4){ empty=false; break; } } }catch(e){ empty=false; }
    if(empty){ alert("No hay nada recortado. Rodea con el lazo lo que quieras conservar."); return; }
    $("#ov").classList.add("show"); $("#ovT").textContent = "Guardando…";
    let res = null;
    try{ res = await D.cutoutSave({ imagePath: IMG, dataURL: flat.toDataURL("image/png"), song: SONG }); }catch(e){}
    if(res && res.ok){
      $("#ovT").textContent = res.pushed ? "✓ Guardado y subido" : "✓ Guardado";
      setTimeout(() => $("#ov").classList.remove("show"), 1200);
    } else {
      $("#ovT").textContent = "✕ Error al guardar";
      setTimeout(() => $("#ov").classList.remove("show"), 1800);
    }
  };

  // ---- guardar como ARCHIVO PNG en el PC (eliges carpeta) ----
  $("#savePc").onclick = async () => {
    if(!W) return;
    if(!(D && D.saveCutoutFile)){ alert("Guardar en el PC solo funciona en la app de escritorio."); return; }
    const flat = document.createElement("canvas"); flat.width = W; flat.height = H;
    const fx = flat.getContext("2d");
    layers.forEach(l => fx.drawImage(l.canvas, 0, 0));
    let empty = true;
    try{ const d = fx.getImageData(0,0,W,H).data; for(let p=3;p<d.length;p+=4*997){ if(d[p]>4){ empty=false; break; } } }catch(e){ empty=false; }
    if(empty){ alert("No hay nada recortado que guardar."); return; }
    $("#ov").classList.add("show"); $("#ovT").textContent = "Guardando en el PC…";
    let res = null;
    try{ res = await D.saveCutoutFile({ dataURL: flat.toDataURL("image/png"), name: (NAME || "recorte") }); }catch(e){}
    if(res && res.ok){ $("#ovT").textContent = "✓ Guardado en el PC"; setTimeout(() => $("#ov").classList.remove("show"), 1400); }
    else if(res && res.canceled){ $("#ov").classList.remove("show"); }
    else { $("#ovT").textContent = "✕ Error al guardar"; setTimeout(() => $("#ov").classList.remove("show"), 1800); }
  };

  resizeView();
  load();
})();
