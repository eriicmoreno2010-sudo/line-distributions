/*
=========================================
Recording mode — enable with ?rec=1 in the URL.
Hides the video's native controls and the mouse cursor for a clean capture.
Play/pause with a click anywhere or the SPACE bar.
=========================================
*/
(function(){
  const params = new URLSearchParams(location.search);
  if(!params.get("rec")) return;

  // hide the cursor everywhere
  const style = document.createElement("style");
  style.textContent = `*{ cursor:none !important; }
    #video::-webkit-media-controls{ display:none !important; }`;
  document.head.appendChild(style);

  const start = () => {
    const v = document.getElementById("video");
    if(!v) return;
    v.removeAttribute("controls");

    const toggle = () => { if(v.paused) v.play(); else v.pause(); };
    document.addEventListener("click", toggle);
    document.addEventListener("keydown", e => {
      if(e.code === "Space"){ e.preventDefault(); toggle(); }
    });
  };

  if(document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
