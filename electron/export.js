/*
=========================================
Frame-by-frame exporter (runs inside the desktop app).
Uses headless Chrome (puppeteer-core, driving the system Chrome) because it can
render ABOVE the physical screen resolution (Electron windows can't) — so we get
true 4K. Each frame: seek the MV + refresh the overlays, screenshot, pipe into
ffmpeg with the clean official audio. Renders at the MV's native fps (no judder).
Perfect A/V sync by construction. No screen recording, no quality loss.
=========================================
*/
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
// puppeteer-core is ESM-only -> load it via dynamic import (require() would throw).

function findChrome(){
  const cands = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    process.env.LOCALAPPDATA + "/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  ];
  for(const c of cands){ try{ if(c && fs.existsSync(c)) return c; }catch(e){} }
  return null;
}

function fileUrl(root, song){
  let u = "file:///" + path.join(root, "index.html").replace(/\\/g, "/");
  if(song) u += "?song=" + encodeURIComponent(song);
  return u;
}

function jsSeek(t){
  return `(async()=>{
    const v=document.getElementById('video');
    await new Promise(r=>{ const d=()=>r(); v.addEventListener('seeked',d,{once:true});
      try{ v.currentTime=${t}; }catch(e){ r(); } setTimeout(d,4000); });
    try{ Engine.update(${t}); }catch(e){}
    try{ Ranking.updateAt(${t}); }catch(e){}
    try{ const c=document.getElementById('timeline-cursor'); if(c) c.style.left=(${t}/SONG.duration*100)+'%'; }catch(e){}
  })()`;
}

// opts: { out, root, song, scale=2, fps=24000/1001, resultsHold=12, maxDur, ffmpeg }
async function runExport(opts, onProgress){
  const chrome = opts.chrome || findChrome();
  if(!chrome) throw new Error("No se encontró Chrome/Edge instalado para el render.");
  const scale = opts.scale || 2;
  const fps = opts.fps || (24000 / 1001);
  const resultsHold = (opts.resultsHold != null) ? opts.resultsHold : 12;

  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    executablePath: chrome, headless: "new",
    args: ["--allow-file-access-from-files","--autoplay-policy=no-user-gesture-required",
           "--disable-features=Translate","--ignore-gpu-blocklist","--enable-gpu-rasterization",
           "--use-angle=gl","--hide-scrollbars","--mute-audio"]
  });
  try{
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: scale });
    await page.goto(fileUrl(opts.root, opts.song), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(
      () => { const v = document.getElementById("video"); return v && typeof SONG !== "undefined" && SONG && v.readyState >= 1; },
      { timeout: 20000 });

    const info = await page.evaluate(() => ({ dur: SONG.duration, video: SONG.video }));
    const dur = Math.min(info.dur, opts.maxDur || info.dur);
    const songFrames = Math.round(dur * fps);
    const videoAbs = path.join(opts.root, info.video.replace(/\//g, path.sep));

    // freeze animations (exact per-frame state) + hide UI chrome
    await page.addStyleTag({ content:
      "*{transition:none !important;animation:none !important;cursor:none !important}" +
      "#export-btn,#export-hud,#lib-back{display:none !important}" +
      "#video::-webkit-media-controls,#video::-webkit-media-controls-enclosure,#video::-webkit-media-controls-panel{display:none !important}" });
    await page.evaluate(() => { const v=document.getElementById("video"); v.removeAttribute("controls"); v.pause(); v.muted=true; });

    const ff = spawn(opts.ffmpeg || "ffmpeg", [
      "-y","-loglevel","error",
      "-f","image2pipe","-framerate", String(fps), "-i","pipe:0",
      "-i", videoAbs,
      "-map","0:v:0","-map","1:a:0","-t", String(dur + Math.max(0, resultsHold)),
      "-c:v","libx264","-crf","16","-preset","medium","-pix_fmt","yuv420p",
      "-c:a","aac","-b:a","320k","-movflags","+faststart", opts.out
    ]);
    let fferr=""; ff.stderr.on("data", d => fferr += d.toString());
    const ffClose = new Promise((res, rej) => ff.on("close", c => c===0 ? res() : rej(new Error("ffmpeg "+c+": "+fferr.slice(-400)))));
    const write = (b) => ff.stdin.write(b) ? Promise.resolve() : new Promise(r => ff.stdin.once("drain", r));

    for(let i=0;i<songFrames;i++){
      await page.evaluate(jsSeek(i/fps));
      await write(await page.screenshot({ type:"jpeg", quality:96 }));
      if(i % 8 === 0 && onProgress) onProgress({ phase:"song", done:i, total:songFrames });
    }

    if(resultsHold > 0){
      await page.evaluate(() => { const v=document.getElementById("video"); try{ v.currentTime=SONG.duration; }catch(e){} v.dispatchEvent(new Event("ended")); });
      await new Promise(r => setTimeout(r, 7000));   // let the top-down reveal finish
      const resBuf = await page.screenshot({ type:"jpeg", quality:96 });
      const resFrames = Math.round(resultsHold * fps);
      for(let i=0;i<resFrames;i++){
        await write(resBuf);
        if(i % 8 === 0 && onProgress) onProgress({ phase:"results", done:i, total:resFrames });
      }
    }

    ff.stdin.end();
    await ffClose;
    return { out: opts.out };
  } finally {
    await browser.close();
  }
}

module.exports = { runExport, findChrome };
