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

app.whenReady().then(() => {
  if(EXPORT_OUT) exportHeadless().catch(e => { console.error("EXPORT_ERR " + e.message); app.exit(1); });
  else createWindow();
});
app.on("window-all-closed", () => app.quit());
