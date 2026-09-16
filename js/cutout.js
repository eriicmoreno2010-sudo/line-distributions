/* Editor de recorte con LAZO. Rodeas lo que quieres CONSERVAR y el fondo (lo de
   fuera) se quita al instante, con vista previa en vivo. Trabaja sobre la foto
   ORIGINAL a máxima calidad (limitada a MAXDIM). No destructivo: la original se
   conserva (Deshacer / Reiniciar / Ver original) y se guarda un PNG con transparencia. */
(function(){
  const $ = s => document.querySelector(s);
  const D = window.desktop;
  const P = new URLSearchParams(location.search);
  const IMG  = P.get("img")  || "";
  const NAME = P.get("name") || "";
  const SONG = P.get("song") || "";
  if($("#who")) $("#who").textContent = NAME || "Foto";

  const MAXDIM = 2048, HISTMAX = 12;

  const view = $("#view"), vctx = view.getContext("2d");
  const work = document.createElement("canvas"); let wctx;   // resultado actual (editable)
  const orig = document.createElement("canvas"); let octx;   // original intacta
  let W = 0, H = 0, scale = 1, ox = 0, oy = 0;
  let tool = "lazo";
  let history = [];
  let showOrig = false;

  // lazo en curso (puntos en coords de TRABAJO)
  let lassoing = false, lassoPts = [];
  let ptr = null;

  // patrón de cuadros (transparencia)
  const chk = document.createElement("canvas"); chk.width = chk.height = 22;
  const cc = chk.getContext("2d");
  cc.fillStyle = "#3a3a46"; cc.fillRect(0,0,22,22);
  cc.fillStyle = "#2b2b34"; cc.fillRect(0,0,11,11); cc.fillRect(11,11,11,11);
  let chkPat = null;

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
    vctx.drawImage(showOrig ? orig : work, ox, oy, dw, dh);
    // lazo en curso
    if(lassoing && lassoPts.length > 1){
      vctx.beginPath();
      vctx.moveTo(ox + lassoPts[0].x*scale, oy + lassoPts[0].y*scale);
      for(let i=1;i<lassoPts.length;i++) vctx.lineTo(ox + lassoPts[i].x*scale, oy + lassoPts[i].y*scale);
      // línea de puntos: blanca sobre negra para que se vea en cualquier fondo
      vctx.setLineDash([7,5]);
      vctx.strokeStyle = "rgba(0,0,0,.7)"; vctx.lineWidth = 3; vctx.stroke();
      vctx.strokeStyle = "rgba(255,255,255,.95)"; vctx.lineWidth = 1.5; vctx.stroke();
      vctx.setLineDash([]);
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
      work.width = W; work.height = H; wctx = work.getContext("2d"); wctx.drawImage(orig,0,0);
      resizeView(); fitImage(); redraw();
    };
    im.onerror = () => alert("No se pudo cargar la foto.");
    im.src = url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now();
  }

  function toWork(e){
    const r = view.getBoundingClientRect();
    return { x:(e.clientX - r.left - ox)/scale, y:(e.clientY - r.top - oy)/scale };
  }

  function snapshot(){
    try{ history.push(wctx.getImageData(0,0,W,H)); if(history.length > HISTMAX) history.shift(); }catch(e){}
    $("#undo").disabled = history.length === 0;
  }
  function undo(){
    const s = history.pop(); if(!s) return;
    wctx.putImageData(s,0,0); redraw();
    $("#undo").disabled = history.length === 0;
  }

  // aplicar el lazo: CONSERVA lo de dentro (recortado de lo que hay ahora), quita lo de fuera
  function applyLasso(pts){
    if(pts.length < 3) return;
    snapshot();
    const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H;
    const t = tmp.getContext("2d");
    t.save();
    t.beginPath(); t.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length;i++) t.lineTo(pts[i].x, pts[i].y);
    t.closePath(); t.clip();
    t.drawImage(work, 0, 0);       // conserva SOLO lo de dentro del lazo (de lo actual)
    t.restore();
    wctx.clearRect(0,0,W,H); wctx.drawImage(tmp, 0, 0);
    redraw();
  }

  // ---- interacción ----
  let panning = false, panLast = null;
  view.addEventListener("pointerdown", e => {
    view.setPointerCapture(e.pointerId);
    if(e.button === 1 || tool === "pan"){ panning = true; panLast = { x:e.clientX, y:e.clientY }; return; }
    if(tool === "lazo"){ lassoing = true; lassoPts = [toWork(e)]; }
  });
  view.addEventListener("pointermove", e => {
    ptr = toWork(e);
    if(panning){ ox += e.clientX-panLast.x; oy += e.clientY-panLast.y; panLast = { x:e.clientX, y:e.clientY }; redraw(); return; }
    if(lassoing){
      const p = toWork(e), last = lassoPts[lassoPts.length-1];
      if(!last || Math.hypot(p.x-last.x, p.y-last.y) > 2/scale) lassoPts.push(p);   // muestrea puntos
      redraw();
    }
  });
  const endPtr = () => {
    panning = false;
    if(lassoing){ lassoing = false; const pts = lassoPts; lassoPts = []; applyLasso(pts); }
  };
  view.addEventListener("pointerup", endPtr);
  view.addEventListener("pointercancel", endPtr);

  view.addEventListener("wheel", e => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    const mx = e.clientX-r.left, my = e.clientY-r.top;
    const wx = (mx-ox)/scale, wy = (my-oy)/scale;
    scale = Math.max(0.05, Math.min(20, scale * (e.deltaY>0 ? 0.9 : 1.1)));
    ox = mx - wx*scale; oy = my - wy*scale; redraw();
  }, { passive:false });

  // ---- botones ----
  function setTool(t){
    tool = t;
    $("#tLazo").classList.toggle("on", t === "lazo");
    $("#tPan").classList.toggle("on", t === "pan");
  }
  $("#tLazo").onclick = () => setTool("lazo");
  $("#tPan").onclick  = () => setTool("pan");
  $("#undo").onclick  = undo;
  $("#fit").onclick   = () => { fitImage(); redraw(); };
  $("#reset").onclick = () => {
    if(!confirm("¿Reiniciar la foto (deshace todos los recortes)?")) return;
    snapshot(); wctx.clearRect(0,0,W,H); wctx.drawImage(orig,0,0); redraw();
  };
  // Ver original: mantener pulsado
  const ob = $("#orig");
  const showO = () => { showOrig = true; redraw(); };
  const hideO = () => { showOrig = false; redraw(); };
  ob.addEventListener("pointerdown", showO);
  ob.addEventListener("pointerup", hideO);
  ob.addEventListener("pointerleave", hideO);

  window.addEventListener("resize", () => { resizeView(); redraw(); });
  document.addEventListener("keydown", e => {
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="z"){ e.preventDefault(); undo(); }
    else if(e.key==="l"||e.key==="L") setTool("lazo");
    else if(e.key===" "){ e.preventDefault(); setTool("pan"); }
  });

  // ---- guardar ----
  $("#save").onclick = async () => {
    if(!W || !(D && D.cutoutSave)){ alert("Guardar solo funciona en la app de escritorio."); return; }
    $("#ov").classList.add("show"); $("#ovT").textContent = "Guardando…";
    let res = null;
    try{ res = await D.cutoutSave({ imagePath: IMG, dataURL: work.toDataURL("image/png"), song: SONG }); }catch(e){}
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
