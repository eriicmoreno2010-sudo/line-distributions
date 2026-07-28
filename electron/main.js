/*
=========================================
Desktop app (Electron) — main process.
 - Normal launch: opens the viewer window; the in-app "Export" button asks the
   main process (IPC) to render the video frame-by-frame in 4K (headless Chrome
   under the hood — it can exceed the screen resolution, Electron windows can't).
 - `--export <out.mp4> [--song p] [--maxdur N] [--hold N]`: headless render + quit.
=========================================
*/
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { runExport } = require("./export");

const ROOT = path.join(__dirname, "..");

// Resolve git: prefer the standard Windows install path, fall back to PATH.
const GIT = (function(){
  const cands = [
    "C:\\Program Files\\Git\\cmd\\git.exe",
    "C:\\Program Files\\Git\\bin\\git.exe",
    "C:\\Program Files (x86)\\Git\\cmd\\git.exe"
  ];
  for(const c of cands){ try{ if(fs.existsSync(c)) return c; }catch(e){} }
  return "git";
})();

// Run a git command in the repo root; never throws (returns code/out/err).
function git(args){
  return new Promise(resolve => {
    execFile(GIT, args, { cwd: ROOT, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({
        code: err ? (typeof err.code === "number" ? err.code : 1) : 0,
        out: (stdout || "").trim(),
        err: (stderr || "").trim() || (err && err.message) || ""
      }));
  });
}
function argVal(flag){ const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : null; }
const EXPORT_OUT = argVal("--export");
const SELFTEST   = process.argv.includes("--selftest");

// ---------- headless export (CLI / testing) ----------
async function exportHeadless(){
  await runExport({
    out: EXPORT_OUT, root: ROOT,
    song: argVal("--song"),
    maxDur: argVal("--maxdur") ? parseFloat(argVal("--maxdur")) : null,
    fps: argVal("--fps") ? parseFloat(argVal("--fps")) : null,
    resultsHold: argVal("--hold") ? parseFloat(argVal("--hold")) : null
  }, p => console.log("PROGRESS " + JSON.stringify(p)));
  console.log("EXPORT_DONE " + EXPORT_OUT);
  app.quit();
}

// ---------- interactive window ----------
function createWindow(){
  const win = new BrowserWindow({
    width: 1500, height: 900, backgroundColor: "#0b0b10",
    show: !SELFTEST, autoHideMenuBar: true,
    webPreferences: {
      webSecurity: false, backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js")
    }
  });
  const page = argVal("--page");
  if(page){
    const [file, query] = page.split("?");
    win.loadFile(path.join(ROOT, file), query ? { search: query } : {});
  } else {
    win.loadFile(path.join(ROOT, "library.html"));
  }

  if(SELFTEST){
    win.webContents.once("did-finish-load", async () => {
      await new Promise(r => setTimeout(r, 2500));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(argVal("--selftest") || path.join(ROOT, "selftest.png"), img.toPNG());
      console.log("SELFTEST_OK"); app.quit();
    });
  }
  return win;
}

// Button → render frame-by-frame; stream progress back to the window.
ipcMain.handle("export-video", async (evt, args) => {
  args = args || {};
  // ask where to save
  const def = path.join(app.getPath("videos") || ROOT, (args.name || "line-distribution") + ".mp4");
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Guardar vídeo",
    defaultPath: def,
    filters: [{ name: "Vídeo MP4", extensions: ["mp4"] }]
  });
  if(canceled || !filePath) return { ok: false, canceled: true };

  const web = evt.sender;
  try{
    await runExport({ out: filePath, root: ROOT, song: args.song || null },
      p => web.send("export-progress", p));
    return { ok: true, out: filePath };
  }catch(e){
    return { ok: false, error: e.message };
  }
});

// List every song JSON under data/ for the library screen.
ipcMain.handle("list-songs", async () => {
  const out = [];
  const walk = (d) => {
    let entries = [];
    try{ entries = fs.readdirSync(d); }catch(e){ return; }
    for(const name of entries){
      const full = path.join(d, name);
      let st; try{ st = fs.statSync(full); }catch(e){ continue; }
      if(st.isDirectory()) walk(full);
      else if(name.toLowerCase().endsWith(".json")){
        try{
          const j = JSON.parse(fs.readFileSync(full, "utf8"));
          out.push({
            path: path.relative(ROOT, full).replace(/\\/g, "/"),
            group: j.group || "",
            song: j.song || name.replace(/\.json$/i, ""),
            duration: j.duration || 0,
            members: (j.members || []).map(m => ({ name: m.name, image: m.image, color: m.color }))
          });
        }catch(e){}
      }
    }
  };
  walk(path.join(ROOT, "data"));
  return out;
});

// Editor: load a song JSON, and save it back after editing.
ipcMain.handle("load-song", async (_e, relPath) => {
  try{ return { ok: true, data: JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8")) }; }
  catch(e){ return { ok: false, error: e.message }; }
});
ipcMain.handle("save-song", async (_e, args) => {
  // 1) Write the file to disk.
  try{
    const full = path.join(ROOT, args.path);
    fs.writeFileSync(full, JSON.stringify(args.data, null, 2), "utf8");
  }catch(e){ return { ok: false, error: e.message }; }

  // 2) Auto commit + push just this file (so every save lands on GitHub).
  const res = { ok: true, committed: false, pushed: false, gitError: null };
  try{
    await git(["add", "--", args.path]);
    const staged = await git(["diff", "--cached", "--quiet", "--", args.path]); // code!=0 => has changes
    if(staged.code !== 0){
      const song = (args.data && args.data.song) ? args.data.song : args.path;
      const c = await git(["commit", "-m", "Update " + song + " line distribution", "--", args.path]);
      if(c.code === 0) res.committed = true;
      else res.gitError = c.err || c.out;
    }
    const p = await git(["push"]);
    if(p.code === 0) res.pushed = true;
    else res.gitError = (res.gitError ? res.gitError + " | " : "") + (p.err || p.out);
  }catch(e){ res.gitError = e.message; }
  return res;
});

// Photos tool: tell the framer where to READ each photo from — prefer the
// pristine original in _src/ so re-framing is never done on an already-baked crop.
ipcMain.handle("photo-sources", async (_e, paths) => {
  return (paths || []).map(rel => {
    try{
      const abs = path.join(ROOT, rel);
      const srcAbs = path.join(path.dirname(abs), "_src", path.basename(abs));
      const use = fs.existsSync(srcAbs) ? srcAbs : abs;
      return "file:///" + use.replace(/\\/g, "/");
    }catch(e){ return "file:///" + path.join(ROOT, rel).replace(/\\/g, "/"); }
  });
});

// Photos tool: write the baked 800×800 crops, bump the cache version, commit+push.
ipcMain.handle("save-photos", async (_e, args) => {
  args = args || {};
  const photos = Array.isArray(args.photos) ? args.photos : [];
  const res = { ok: true, written: 0, committed: false, pushed: false, gitError: null };
  const dirs = new Set();
  try{
    for(const p of photos){
      if(!p || !p.path || !p.dataURL) continue;
      const abs = path.join(ROOT, p.path);
      const dir = path.dirname(abs), base = path.basename(abs);
      const srcDir = path.join(dir, "_src");
      try{ fs.mkdirSync(srcDir, { recursive: true }); }catch(e){}
      // Back up the pristine original the first time we bake over it.
      const srcAbs = path.join(srcDir, base);
      if(!fs.existsSync(srcAbs) && fs.existsSync(abs)){ try{ fs.copyFileSync(abs, srcAbs); }catch(e){} }
      const b64 = String(p.dataURL).replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(abs, Buffer.from(b64, "base64"));
      res.written++; dirs.add(dir);
    }
  }catch(e){ return { ok: false, error: e.message }; }
  if(res.written === 0) return { ok: false, error: "no hay fotos que guardar" };

  // Bump PHOTO_VER so the viewer busts its image cache.
  let bumped = null;
  try{
    const rvPath = path.join(ROOT, "js", "ranking.js");
    let rv = fs.readFileSync(rvPath, "utf8");
    const m = rv.match(/const PHOTO_VER\s*=\s*(\d+)\s*;/);
    if(m){ rv = rv.replace(m[0], "const PHOTO_VER = " + (parseInt(m[1], 10) + 1) + ";"); fs.writeFileSync(rvPath, rv, "utf8"); bumped = "js/ranking.js"; }
  }catch(e){}

  // Commit + push (rebase-and-retry once if the remote moved on).
  try{
    for(const d of dirs){ await git(["add", "--", path.relative(ROOT, d).replace(/\\/g, "/")]); }
    if(bumped) await git(["add", "--", bumped]);
    const staged = await git(["diff", "--cached", "--quiet"]);
    if(staged.code !== 0){
      const c = await git(["commit", "-m", "Update " + (args.song || "song") + " photos"]);
      if(c.code === 0) res.committed = true; else res.gitError = c.err || c.out;
    }
    let p = await git(["push"]);
    if(p.code !== 0){ await git(["pull", "--rebase"]); p = await git(["push"]); }
    if(p.code === 0) res.pushed = true;
    else res.gitError = (res.gitError ? res.gitError + " | " : "") + (p.err || p.out);
  }catch(e){ res.gitError = e.message; }
  return res;
});

// Thumbnail: render thumb.html at exactly 1280×720 in an offscreen window and
// save it as a PNG (YouTube thumbnail size).
ipcMain.handle("export-thumb", async (evt, args) => {
  args = args || {};
  const song = args.song || "";
  const base = (args.name || song.split("/").pop().replace(/\.json$/i, "") || "thumb");
  const def = path.join(app.getPath("pictures") || ROOT, base + "_thumb.png");
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Guardar miniatura", defaultPath: def,
    filters: [{ name: "Imagen PNG", extensions: ["png"] }]
  });
  if(canceled || !filePath) return { ok: false, canceled: true };
  let win;
  try{
    win = new BrowserWindow({ width: 1280, height: 720, show: false, useContentSize: true,
      webPreferences: { webSecurity: false, preload: path.join(__dirname, "preload.js") } });
    let q = "song=" + song + "&export=1";
    if(args.cover) q += "&cover=" + encodeURIComponent(args.cover);
    if(args.t != null && args.t !== "") q += "&t=" + encodeURIComponent(args.t);
    await win.loadFile(path.join(ROOT, "thumb.html"), { search: q });
    await new Promise(r => setTimeout(r, 1600));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 720 });
    fs.writeFileSync(filePath, img.toPNG());
    return { ok: true, out: filePath };
  }catch(e){ return { ok: false, error: e.message }; }
  finally{ if(win) win.destroy(); }
});

app.whenReady().then(() => {
  if(EXPORT_OUT) exportHeadless().catch(e => { console.error("EXPORT_ERR " + e.message); app.exit(1); });
  else createWindow();
});
app.on("window-all-closed", () => app.quit());
