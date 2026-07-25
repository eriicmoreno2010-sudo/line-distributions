/*
=========================================
Recording mode — for clean screen capture.
 - Toggle live with the R key (or start with ?rec=1 in the URL).
 - Hides: the "← Biblioteca" button, the mouse cursor, and the video's
   native controls. SPACE plays/pauses while recording.
=========================================
*/
(function(){
  const P = new URLSearchParams(location.search);
  let on = false, observer = null, toastT = null;

  const css = document.createElement("style");
  css.textContent = `
    body.recording, body.recording *{ cursor:none !important; }
    body.recording #lib-back{ display:none !important; }
    body.recording #video::-webkit-media-controls,
    body.recording #video::-webkit-media-controls-enclosure,
    body.recording #video::-webkit-media-controls-panel{ display:none !important; -webkit-appearance:none !important; }
    #rec-toast{ position:fixed; top:16px; left:50%; transform:translateX(-50%);
      z-index:2147483600; padding:8px 16px; border-radius:999px;
      font:800 13px system-ui,sans-serif; background:rgba(18,18,26,.92); color:#fff;
      border:1px solid #33334a; pointer-events:none; opacity:0; transition:opacity .25s ease; }
    #rec-toast.show{ opacity:1; }
  `;
  (document.head || document.documentElement).appendChild(css);

  function video(){ return document.getElementById("video"); }
  function stripControls(){ const v = video(); if(v && v.hasAttribute("controls")) v.removeAttribute("controls"); }
  function restoreControls(){ const v = video(); if(v && !v.hasAttribute("controls")) v.setAttribute("controls",""); }

  function toast(txt){
    let el = document.getElementById("rec-toast");
    if(!el){ el = document.createElement("div"); el.id = "rec-toast"; document.body.appendChild(el); }
    el.textContent = txt;
    el.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("show"), 1000);   // fades before you start recording
  }

  function enable(){
    on = true;
    document.body.classList.add("recording");
    stripControls();
    const v = video();
    if(v && window.MutationObserver && !observer){
      observer = new MutationObserver(stripControls);
      observer.observe(v, { attributes:true, attributeFilter:["controls"] });   // keep them off if re-added
    }
    toast("🔴  Grabación ON  ·  R para salir");
  }
  function disable(){
    on = false;
    document.body.classList.remove("recording");
    if(observer){ observer.disconnect(); observer = null; }
    restoreControls();
    toast("Grabación OFF");
  }
  function toggle(){ on ? disable() : enable(); }

  function init(){
    if(P.get("rec")) enable();
    document.addEventListener("keydown", e => {
      const typing = /^(input|textarea|select)$/i.test(e.target && e.target.tagName || "");
      if((e.key === "r" || e.key === "R") && !typing){ e.preventDefault(); toggle(); return; }
      if(on && e.code === "Space"){                     // play/pause while controls are hidden
        e.preventDefault();
        const v = video(); if(v){ v.paused ? v.play() : v.pause(); }
      }
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
