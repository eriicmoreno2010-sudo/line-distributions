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
  if($("#who")) $("#who").textContent = NAME || "Foto";

  const MAXDIM = 2048, HISTMAX = 14;

  const view = $("#view"), vctx = view.getContext("2d");
  const orig = document.createElement("canvas"); let octx;   // capa ORIGINAL (intacta)
  let W = 0, H = 0, scale = 1, ox = 0, oy = 0;
  let tool = "lazo", brush = 70;
  let showOrig = true;
  let layers = [];        // [{canvas, ctx, name}]
  let active = 0;
  let history = [];       // [{layer, data}]
  let lassoing = false, lassoPts = [], ptr = null;

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
    const anyCut = layers.some(l => l);
    if(showOrig){ vctx.globalAlpha = anyCut ? 0.32 : 1; vctx.drawImage(orig, ox,oy,dw,dh); vctx.globalAlpha = 1; }
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
        if(hasAlpha) layers[0].ctx.drawImage(orig,0,0);
      }catch(e){}
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
    x.restore(); redraw();
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
    else if(tool === "erase"){ erasing=true; snapshot(); last=w; eraseAt(w,w); redraw(); }
  });
  view.addEventListener("pointermove", e => {
    const w = toWork(e); ptr = { x:w.vx, y:w.vy };
    if(panning){ ox += e.clientX-panLast.x; oy += e.clientY-panLast.y; panLast={x:e.clientX,y:e.clientY}; redraw(); return; }
    if(lassoing){ const l=lassoPts[lassoPts.length-1]; if(!l || Math.hypot(w.x-l.x,w.y-l.y) > 2/scale) lassoPts.push(w); redraw(); }
    else if(erasing){ eraseAt(last,w); last=w; redraw(); }
    else if(tool === "erase") redraw();
  });
  const endPtr = () => {
    panning=false; erasing=false;
    if(lassoing){ lassoing=false; const pts=lassoPts; lassoPts=[]; addLasso(pts); }
  };
  view.addEventListener("pointerup", endPtr);
  view.addEventListener("pointercancel", endPtr);
  view.addEventListener("pointerleave", () => { ptr=null; redraw(); });

  view.addEventListener("wheel", e => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    const wx=(mx-ox)/scale, wy=(my-oy)/scale;
    scale = Math.max(0.05, Math.min(20, scale * (e.deltaY>0 ? 0.9 : 1.1)));
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
    $("#tErase").classList.toggle("on", t==="erase");
    $("#tPan").classList.toggle("on", t==="pan");
    $("#brushGrp").style.display = (t==="erase") ? "" : "none";
    redraw();
  }
  $("#tLazo").onclick  = () => setTool("lazo");
  $("#tErase").onclick = () => setTool("erase");
  $("#tPan").onclick   = () => setTool("pan");
  $("#brush").oninput  = e => { brush = +e.target.value; $("#brushV").textContent = brush; redraw(); };
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

  resizeView();
  load();
})();
