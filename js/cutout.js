/* Editor de recorte + quitar fondo (borrador manual + varita mágica).
   Trabaja sobre la foto ORIGINAL a máxima calidad (limitada a MAXDIM por rendimiento)
   y guarda un PNG con transparencia que sustituye el original limpio. */
(function(){
  const $ = s => document.querySelector(s);
  const D = window.desktop;
  const P = new URLSearchParams(location.search);
  const IMG  = P.get("img")  || "";
  const NAME = P.get("name") || "";
  const SONG = P.get("song") || "";
  if($("#who")) $("#who").textContent = NAME || "Foto";

  const MAXDIM = 2048;              // lado máximo de trabajo (calidad alta, rendimiento ok)
  const HISTMAX = 8;

  const view = $("#view"), vctx = view.getContext("2d", { willReadFrequently:false });
  const work = document.createElement("canvas");  let wctx;   // lienzo de trabajo (editable)
  const orig = document.createElement("canvas");  let octx;   // píxeles originales (para Restaurar)
  let W = 0, H = 0;
  let scale = 1, ox = 0, oy = 0;   // transformación trabajo -> vista
  let tool = "erase", brush = 70, tol = 32;
  let history = [];
  let ptr = null;                  // posición del ratón en la vista (para el aro del pincel)

  // patrón de cuadros (para ver la transparencia)
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
    const s = Math.min(view.width / W, view.height / H) * 0.96;
    scale = s; ox = (view.width - W*s)/2; oy = (view.height - H*s)/2;
  }
  function redraw(){
    vctx.setTransform(1,0,0,1,0,0);
    vctx.fillStyle = "#0d0d12"; vctx.fillRect(0,0,view.width,view.height);
    if(!W) return;
    const dw = W*scale, dh = H*scale;
    // cuadros solo bajo la imagen
    vctx.save(); vctx.beginPath(); vctx.rect(ox,oy,dw,dh); vctx.clip();
    if(chkPat){ vctx.fillStyle = chkPat; vctx.fillRect(ox,oy,dw,dh); }
    vctx.restore();
    vctx.imageSmoothingEnabled = true; vctx.imageSmoothingQuality = "high";
    vctx.drawImage(work, ox, oy, dw, dh);
    // aro del pincel
    if(ptr && (tool === "erase" || tool === "restore")){
      vctx.beginPath(); vctx.arc(ptr.x, ptr.y, brush/2, 0, 7);
      vctx.strokeStyle = "rgba(255,255,255,.85)"; vctx.lineWidth = 1.5; vctx.stroke();
      vctx.strokeStyle = "rgba(0,0,0,.5)"; vctx.lineWidth = .8; vctx.stroke();
    }
  }

  // ---- carga ----
  async function load(){
    let url = IMG;
    if(D && D.cutoutLoad){ try{ const r = await D.cutoutLoad({ imagePath: IMG }); if(r && r.ok) url = r.src; }catch(e){} }
    if(!url){ alert("No hay foto que editar."); return; }
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, MAXDIM / Math.max(im.naturalWidth, im.naturalHeight));
      W = Math.round(im.naturalWidth * k); H = Math.round(im.naturalHeight * k);
      work.width = W; work.height = H; wctx = work.getContext("2d", { willReadFrequently:true });
      wctx.drawImage(im, 0, 0, W, H);
      orig.width = W; orig.height = H; octx = orig.getContext("2d");
      octx.drawImage(work, 0, 0);
      resizeView(); fitImage(); redraw();
    };
    im.onerror = () => alert("No se pudo cargar la foto.");
    im.src = url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now();
  }

  // vista -> trabajo
  function toWork(e){
    const r = view.getBoundingClientRect();
    return { x:(e.clientX - r.left - ox)/scale, y:(e.clientY - r.top - oy)/scale,
             vx:(e.clientX - r.left), vy:(e.clientY - r.top) };
  }

  // ---- historial (deshacer) ----
  function snapshot(){
    try{ history.push(wctx.getImageData(0,0,W,H)); if(history.length > HISTMAX) history.shift(); }catch(e){}
    $("#undo").disabled = history.length === 0;
  }
  function undo(){
    const s = history.pop(); if(!s) return;
    wctx.putImageData(s, 0, 0); redraw();
    $("#undo").disabled = history.length === 0;
  }

  // ---- pincel (borrar / restaurar) ----
  function stamp(x, y){
    const rw = (brush/2)/scale;                 // radio en px de trabajo
    if(tool === "erase"){
      wctx.save(); wctx.globalCompositeOperation = "destination-out";
      wctx.beginPath(); wctx.arc(x, y, rw, 0, 7); wctx.fill(); wctx.restore();
    } else if(tool === "restore"){
      wctx.save(); wctx.beginPath(); wctx.arc(x, y, rw, 0, 7); wctx.clip();
      wctx.drawImage(orig, 0, 0); wctx.restore();
    }
  }
  function stroke(a, b){                          // interpola entre dos puntos
    const dx = b.x-a.x, dy = b.y-a.y, dist = Math.hypot(dx, dy);
    const step = Math.max(1, (brush/2)/scale * 0.35);
    const n = Math.max(1, Math.ceil(dist/step));
    for(let i=0;i<=n;i++) stamp(a.x + dx*i/n, a.y + dy*i/n);
  }

  // ---- varita mágica: borra la zona contigua de color parecido ----
  function wand(sx, sy){
    sx = Math.round(sx); sy = Math.round(sy);
    if(sx < 0 || sy < 0 || sx >= W || sy >= H) return;
    const id = wctx.getImageData(0,0,W,H), d = id.data;
    const i0 = (sy*W + sx)*4;
    if(d[i0+3] === 0) return;                     // ya transparente
    const r0=d[i0], g0=d[i0+1], b0=d[i0+2];
    const T = tol*tol*3;                          // umbral (suma de diferencias al cuadrado)
    const seen = new Uint8Array(W*H);
    const st = [sy*W + sx];
    while(st.length){
      const p = st.pop(); if(seen[p]) continue; seen[p] = 1;
      const i = p*4; if(d[i+3] === 0) continue;
      const dr=d[i]-r0, dg=d[i+1]-g0, db=d[i+2]-b0;
      if(dr*dr + dg*dg + db*db > T) continue;
      d[i+3] = 0;                                 // borrar
      const x = p % W, y = (p - x)/W;
      if(x > 0)   st.push(p-1);
      if(x < W-1) st.push(p+1);
      if(y > 0)   st.push(p-W);
      if(y < H-1) st.push(p+W);
    }
    wctx.putImageData(id, 0, 0);
  }

  // ---- interacción ----
  let down = false, panning = false, last = null, panLast = null;
  view.addEventListener("pointerdown", e => {
    view.setPointerCapture(e.pointerId);
    const w = toWork(e);
    // botón central o herramienta Mover -> pan
    if(e.button === 1 || tool === "pan"){ panning = true; panLast = { x:e.clientX, y:e.clientY }; return; }
    if(tool === "wand"){ snapshot(); wand(w.x, w.y); redraw(); return; }
    down = true; snapshot(); last = w; stamp(w.x, w.y); redraw();
  });
  view.addEventListener("pointermove", e => {
    const w = toWork(e); ptr = { x:w.vx, y:w.vy };
    if(panning){ ox += e.clientX - panLast.x; oy += e.clientY - panLast.y; panLast = { x:e.clientX, y:e.clientY }; redraw(); return; }
    if(down){ stroke(last, w); last = w; redraw(); }
    else if(tool === "erase" || tool === "restore") redraw();   // mover el aro
  });
  const end = () => { down = false; panning = false; };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);
  view.addEventListener("pointerleave", () => { ptr = null; redraw(); });

  // zoom con la rueda (hacia el cursor)
  view.addEventListener("wheel", e => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const wx = (mx - ox)/scale, wy = (my - oy)/scale;
    const f = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.05, Math.min(20, scale*f));
    ox = mx - wx*scale; oy = my - wy*scale;
    redraw();
  }, { passive:false });

  // ---- botones ----
  function setTool(t){
    tool = t;
    ["erase","restore","wand","pan"].forEach(k =>
      $("#t" + k[0].toUpperCase() + k.slice(1)).classList.toggle("on", k === t));
    $("#brushGrp").style.display = (t === "erase" || t === "restore") ? "" : "none";
    $("#tolGrp").style.display   = (t === "wand") ? "" : "none";
    redraw();
  }
  $("#tErase").onclick   = () => setTool("erase");
  $("#tRestore").onclick = () => setTool("restore");
  $("#tWand").onclick    = () => setTool("wand");
  $("#tPan").onclick     = () => setTool("pan");
  $("#brush").oninput = e => { brush = +e.target.value; $("#brushV").textContent = brush; redraw(); };
  $("#tol").oninput   = e => { tol   = +e.target.value; $("#tolV").textContent   = tol; };
  $("#undo").onclick  = undo;
  $("#fit").onclick   = () => { fitImage(); redraw(); };
  $("#reset").onclick = () => {
    if(!confirm("¿Reiniciar la foto (deshace todos los borrados)?")) return;
    wctx.clearRect(0,0,W,H); wctx.drawImage(orig,0,0); history = []; $("#undo").disabled = true; redraw();
  };

  window.addEventListener("resize", () => { const s=scale; resizeView(); if(!history.length && s===scale) fitImage(); redraw(); });
  document.addEventListener("keydown", e => {
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="z"){ e.preventDefault(); undo(); }
    else if(e.key==="e"||e.key==="E") setTool("erase");
    else if(e.key==="r"||e.key==="R") setTool("restore");
    else if(e.key==="w"||e.key==="W") setTool("wand");
    else if(e.key===" "){ e.preventDefault(); setTool("pan"); }
    else if(e.key==="[" ){ brush=Math.max(6,brush-8); $("#brush").value=brush; $("#brushV").textContent=brush; redraw(); }
    else if(e.key==="]" ){ brush=Math.min(220,brush+8); $("#brush").value=brush; $("#brushV").textContent=brush; redraw(); }
  });

  // ---- guardar ----
  $("#save").onclick = async () => {
    if(!W || !(D && D.cutoutSave)){ alert("Guardar solo funciona en la app de escritorio."); return; }
    $("#ov").classList.add("show"); $("#ovT").textContent = "Guardando…";
    let res = null;
    try{ res = await D.cutoutSave({ imagePath: IMG, dataURL: work.toDataURL("image/png"), song: SONG }); }catch(e){}
    if(res && res.ok){
      $("#ovT").textContent = res.pushed ? "✓ Guardado y subido" : "✓ Guardado";
      setTimeout(() => { $("#ov").classList.remove("show"); }, 1200);
    } else {
      $("#ovT").textContent = "✕ Error al guardar";
      setTimeout(() => { $("#ov").classList.remove("show"); }, 1800);
    }
  };

  resizeView();
  load();
})();
