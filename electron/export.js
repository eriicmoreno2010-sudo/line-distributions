/*
=========================================
Frame-by-frame exporter (runs inside the desktop app). NO screen recording.
Uses headless Chrome (puppeteer-core → system Chrome) with a VIRTUAL CLOCK
(CDP Emulation.setVirtualTimePolicy): each output frame we (1) seek the MV to
that instant, (2) advance the virtual clock by exactly 1/fps so the app's OWN
animations — ranking glide, lyric fades, halos — progress one real step, then
(3) screenshot. The app's native animations render smoothly and deterministically,
without faking anything. Audio is muxed from the clean official track. Perfect sync.
=========================================
*/
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
// puppeteer-core is ESM-only -> dynamic import.

function findChrome(){
  const cands = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
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

// opts: { out, root, song, scale, fps, resultsHold, maxDur, ffmpeg, chrome }
async function runExport(opts, onProgress){
  const chrome = opts.chrome || findChrome();
  if(!chrome) throw new Error("No se encontró Chrome/Edge para el render.");
  const scale = opts.scale || 1;                 // 1 = 1080p, 2 = 4K
  const fps = opts.fps || (24000 / 1001);        // MV native fps
  const budget = 1000 / fps;                     // ms of virtual time per frame
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

    // hide only the UI chrome — DON'T freeze animations (the virtual clock drives them)
    await page.addStyleTag({ content:
      "*{cursor:none !important}#export-btn,#lib-back{display:none !important}" +
      "#video::-webkit-media-controls,#video::-webkit-media-controls-enclosure,#video::-webkit-media-controls-panel{display:none !important}" });
    await page.evaluate(() => {
      const v = document.getElementById("video");
      v.removeAttribute("controls"); v.pause(); v.muted = true;
    });

    const cli = await page.target().createCDPSession();
    await cli.send("Emulation.setVirtualTimePolicy", { policy: "pause" });

    // Put the MV on frame t, then give the media pipeline a little REAL time to
    // decode it (Node timers run regardless of the paused virtual clock).
    async function seekWait(t){
      await page.evaluate((tt) => { document.getElementById("video").currentTime = tt; }, t);
      await new Promise(r => setTimeout(r, 30));
    }
    // Advance the virtual clock so rAF/setTimeout/CSS animations step forward
    // (and the freshly-decoded MV frame gets committed to the compositor).
    async function advance(ms){
      const done = new Promise(r => cli.once("Emulation.virtualTimeBudgetExpired", r));
      await cli.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms });
      await done;
    }

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

    // ---- song ----
    for(let i = 0; i < songFrames; i++){
      await seekWait((i + 0.5) / fps);   // MV frame centre → crisp, no judder
      await advance(budget);             // app's own animations progress one step
      await write(await page.screenshot({ type: "jpeg", quality: 96 }));
      if(i % 8 === 0 && onProgress) onProgress({ phase: "song", done: i, total: songFrames });
    }

    // ---- results (real reveal animation, driven by the virtual clock) ----
    if(resultsHold > 0){
      await page.evaluate(() => { const v=document.getElementById("video"); try{ v.currentTime=SONG.duration; }catch(e){} v.dispatchEvent(new Event("ended")); });
      const resFrames = Math.round(resultsHold * fps);
      for(let i = 0; i < resFrames; i++){
        await advance(budget);
        await write(await page.screenshot({ type: "jpeg", quality: 96 }));
        if(i % 8 === 0 && onProgress) onProgress({ phase: "results", done: i, total: resFrames });
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
