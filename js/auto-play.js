/*
=========================================
Auto-play mode — enable with ?auto=1 (used by the GitHub cloud render).
Starts the song from the beginning by itself, with sound.
=========================================
*/
(function(){
  if(!new URLSearchParams(location.search).get("auto")) return;

  function go(){
    const v = document.getElementById("video");
    if(!v) return;
    const play = () => {
      try{ v.currentTime = 0; }catch(e){}
      v.muted = false;
      v.play().catch(() => { v.muted = true; v.play().catch(()=>{}); });
    };
    if(v.readyState >= 2) play();
    else v.addEventListener("loadeddata", play, { once:true });
  }

  if(document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", go);
  else go();
})();
