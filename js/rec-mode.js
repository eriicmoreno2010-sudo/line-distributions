/*
=========================================
Recording mode — enable with ?rec=1 in the URL.
Hides the video's native controls and the mouse cursor for a clean capture.
Play/pause with a click anywhere or the SPACE bar.
=========================================
*/
(function(){
  if(!new URLSearchParams(location.search).get("rec")) return;

  // hide cursor everywhere + kill webkit media controls
  const css = document.createElement("style");
  css.textContent = `
    html, body, * { cursor:none !important; }
    #video::-webkit-media-controls,
    #video::-webkit-media-controls-enclosure,
    #video::-webkit-media-controls-panel { display:none !important; -webkit-appearance:none !important; }
  `;
  (document.head || document.documentElement).appendChild(css);

  function strip(){
    const v = document.getElementById("video");
    if(v && v.hasAttribute("controls")) v.removeAttribute("controls");
    return v;
  }

  function init(){
    const v = strip();
    // keep controls off even if something re-adds them
    if(v && window.MutationObserver){
      new MutationObserver(strip).observe(v, { attributes:true, attributeFilter:["controls"] });
    }
    const toggle = () => {
      const vid = document.getElementById("video");
      if(!vid) return;
      if(vid.paused) vid.play(); else vid.pause();
    };
    // Only the SPACE bar plays/pauses (clicking does nothing to the video).
    document.addEventListener("keydown", e => {
      if(e.code === "Space"){ e.preventDefault(); toggle(); }
    });
  }

  if(document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
