/*
=========================================
Render mode — enable with ?render=1
Used by the local automatic capture (ffmpeg + Chrome). It:
  - hides the cursor and the video controls (clean frame)
  - autoplays the song from 0 (muted; the clean audio is muxed later)
  - flashes the screen white for a few frames the instant playback
    starts, so the capture can be sync-aligned to time 0 afterwards.
=========================================
*/
(function(){
  if(!new URLSearchParams(location.search).get("render")) return;

  const css = document.createElement("style");
  css.textContent = `
    html, body, * { cursor:none !important; }
    #video::-webkit-media-controls,
    #video::-webkit-media-controls-enclosure,
    #video::-webkit-media-controls-panel { display:none !important; -webkit-appearance:none !important; }
  `;
  (document.head || document.documentElement).appendChild(css);

  function flash(){
    const f = document.createElement("div");
    f.style.cssText = "position:fixed;inset:0;background:#ffffff;z-index:2147483647;pointer-events:none";
    document.body.appendChild(f);
    let n = 0;
    const id = setInterval(() => { if(++n > 6){ clearInterval(id); f.remove(); } }, 16);
  }

  function go(){
    const v = document.getElementById("video");
    if(!v) return;
    if(v.hasAttribute("controls")) v.removeAttribute("controls");

    let flashed = false;
    v.addEventListener("playing", () => { if(!flashed){ flashed = true; flash(); } });

    const start = () => {
      try{ v.currentTime = 0; }catch(e){}
      v.muted = true;                       // audio is replaced with the clean official track
      // wait ~3s (paused on frame 0) so the capture is already recording
      // steadily before playback + flash -> the sync marker lands cleanly.
      setTimeout(() => {
        v.play().catch(() => { v.muted = true; v.play().catch(()=>{}); });
      }, 3000);
    };
    if(v.readyState >= 2) start();
    else v.addEventListener("loadeddata", start, { once:true });
  }

  if(document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", go);
  else go();
})();
