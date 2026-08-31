/*
=========================================
Desktop app (Electron) — main process.
 - Normal launch: opens the viewer window; the in-app "Export" button asks the
   main process (IPC) to render the video frame-by-frame in 4K (headless Chrome
   under the hood — it can exceed the screen resolution, Electron windows can't).
 - `--export <out.mp4> [--song p] [--maxdur N] [--hold N]`: headless render + quit.
=========================================
*/
const { app, BrowserWindow, ipcMain, dialog, session } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile, spawn } = require("child_process");
const { runExport, findFfmpeg } = require("./export");

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
    scale: argVal("--scale") ? parseFloat(argVal("--scale")) : (4 / 3),  // default 1440p
    start: argVal("--start") ? parseFloat(argVal("--start")) : 0,
    maxDur: argVal("--maxdur") ? parseFloat(argVal("--maxdur")) : null,
    fps: argVal("--fps") ? parseFloat(argVal("--fps")) : null,
    resultsHold: argVal("--hold") ? parseFloat(argVal("--hold")) : null,
    ffmpeg: argVal("--ffmpeg") || null
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
    await runExport({ out: filePath, root: ROOT, song: args.song || null, scale: args.scale || (4 / 3) },
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
          if(j.type === "album") continue;   // los álbumes no son canciones
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

// ---- Crear una cancion nueva (croquis): JSON + carpeta de fotos ----
function slug(s){
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}
const NEW_GROUP_PALETTE = [
  "#ff4d6d","#4dabf7","#51cf66","#ffd43b","#cc5de8","#20c997","#ff922b",
  "#748ffc","#f06595","#94d82d","#5c7cfa","#e64980","#22b8cf","#fa5252"
];

ipcMain.handle("create-song", async (_e, args) => {
  args = args || {};
  try{
    const songName = String(args.song || "").trim();
    if(!songName) return { ok:false, error:"Falta el nombre de la canción." };
    const songFile = slug(songName);
    if(!songFile) return { ok:false, error:"El nombre de la canción no es válido." };

    let groupName, groupFolder, members;

    if(args.sourcePath){
      // Reutilizar un grupo existente: clonar los miembros de una canción suya.
      const src = JSON.parse(fs.readFileSync(path.join(ROOT, args.sourcePath), "utf8"));
      groupName   = src.group || args.group || "Grupo";
      groupFolder = args.sourcePath.split("/")[1] || slug(groupName);   // data/<folder>/x.json
      members = (src.members || []).map(m => {
        const base = (m.image || "").split("/").pop() || (slug(m.name) + ".png");
        return { name:m.name, image:`images/${groupFolder}/${songFile}/${base}`,
                 color:m.color || "#7c5cff", focus:(m.focus ?? 50), lift:(m.lift ?? 3) };
      });
    } else {
      // Grupo nuevo.
      groupName = String(args.group || "").trim();
      if(!groupName) return { ok:false, error:"Falta el nombre del grupo." };
      const names = (args.members || []).map(s => String(s).trim()).filter(Boolean);
      if(!names.length) return { ok:false, error:"Añade al menos un miembro." };
      groupFolder = slug(groupName);
      members = names.map((nm, i) => ({
        name:nm, image:`images/${groupFolder}/${songFile}/${slug(nm)}.png`,
        color:NEW_GROUP_PALETTE[i % NEW_GROUP_PALETTE.length], focus:50, lift:3
      }));
    }
    if(!groupFolder) return { ok:false, error:"El nombre del grupo no es válido." };

    const dataDir  = path.join(ROOT, "data", groupFolder);
    const dataPath = path.join(dataDir, songFile + ".json");
    if(fs.existsSync(dataPath)) return { ok:false, error:"Ya existe una canción con ese nombre en ese grupo." };
    fs.mkdirSync(dataDir, { recursive:true });

    const song = {
      group: groupName, song: songName, video: "", duration: 0,
      theme: (args.theme === "light" ? "light" : "dark"),   // fondo elegido al crear
      subunit: !!args.subunit,                              // sub-unidad/solista: tarjetas arriba, tamaño de 8
      members,
      lyrics: [
        { start:0, end:0, members:[members[0] ? members[0].name : ""],
          original:"", romanization:"", english:"", adlib:"" }
      ]
    };
    fs.writeFileSync(dataPath, JSON.stringify(song, null, 2), "utf8");

    // Carpeta de fotos + copiar las de la canción fuente (si reutilizamos grupo).
    const imgDir = path.join(ROOT, "images", groupFolder, songFile);
    fs.mkdirSync(imgDir, { recursive:true });
    if(args.sourcePath){
      const srcImgDir = path.join(ROOT, "images", groupFolder,
        path.basename(args.sourcePath, ".json"));
      for(const m of members){
        const base = m.image.split("/").pop();
        try{ const from = path.join(srcImgDir, base);
             if(fs.existsSync(from)) fs.copyFileSync(from, path.join(imgDir, base)); }catch(e){}
        try{ const fromS = path.join(srcImgDir, "_src", base);
             if(fs.existsSync(fromS)){ fs.mkdirSync(path.join(imgDir, "_src"), { recursive:true });
               fs.copyFileSync(fromS, path.join(imgDir, "_src", base)); } }catch(e){}
      }
    }

    // git add + commit + push (como save-song).
    const relData = path.relative(ROOT, dataPath).replace(/\\/g, "/");
    const relImg  = path.relative(ROOT, imgDir).replace(/\\/g, "/");
    const res = { ok:true, path: relData, committed:false, pushed:false };
    try{
      await git(["add", "--", relData, relImg]);
      const staged = await git(["diff", "--cached", "--quiet"]);
      if(staged.code !== 0){
        const c = await git(["commit", "-m", "Add song skeleton: " + groupName + " - " + songName]);
        if(c.code === 0) res.committed = true;
      }
      let p = await git(["push"]);
      if(p.code !== 0){ await git(["pull", "--rebase"]); p = await git(["push"]); }
      if(p.code === 0) res.pushed = true;
    }catch(e){ res.gitError = e.message; }
    return res;
  }catch(e){ return { ok:false, error:e.message }; }
});

// ---- Álbumes: listar y crear ----
// Un álbum es un JSON con type:"album" que apunta a varias canciones del grupo.
ipcMain.handle("list-albums", async () => {
  const out = [];
  const walk = (d) => {
    let entries = []; try{ entries = fs.readdirSync(d); }catch(e){ return; }
    for(const name of entries){
      const full = path.join(d, name);
      let st; try{ st = fs.statSync(full); }catch(e){ continue; }
      if(st.isDirectory()) walk(full);
      else if(name.toLowerCase().endsWith(".json")){
        try{
          const j = JSON.parse(fs.readFileSync(full, "utf8"));
          if(j.type !== "album") continue;
          out.push({
            path: path.relative(ROOT, full).replace(/\\/g, "/"),
            group: j.group || "", album: j.album || name.replace(/\.json$/i, ""),
            cover: j.cover || "", theme: j.theme || "dark",
            songs: Array.isArray(j.songs) ? j.songs : []
          });
        }catch(e){}
      }
    }
  };
  walk(path.join(ROOT, "data"));
  return out;
});

ipcMain.handle("create-album", async (_e, args) => {
  args = args || {};
  try{
    const albumName = String(args.album || "").trim();
    if(!albumName) return { ok:false, error:"Falta el nombre del álbum." };
    const albumFile = slug(albumName);
    if(!albumFile) return { ok:false, error:"El nombre del álbum no es válido." };
    const songs = (args.songs || []).map(String).filter(Boolean);
    if(!songs.length) return { ok:false, error:"Elige al menos una canción." };

    // carpeta del grupo (a partir de una canción suya, o del nombre)
    const groupFolder = (args.sourcePath ? args.sourcePath.split("/")[1] : "") || slug(args.group || "");
    if(!groupFolder) return { ok:false, error:"No se pudo determinar el grupo." };

    const dir = path.join(ROOT, "data", groupFolder, "albums");
    const dataPath = path.join(dir, albumFile + ".json");
    if(fs.existsSync(dataPath)) return { ok:false, error:"Ya existe un álbum con ese nombre en ese grupo." };
    fs.mkdirSync(dir, { recursive:true });

    const album = {
      type: "album",
      group: String(args.group || "").trim() || groupFolder,
      album: albumName,
      cover: "",
      theme: (args.theme === "light" ? "light" : "dark"),
      instrumental: "",
      songs
    };
    fs.writeFileSync(dataPath, JSON.stringify(album, null, 2), "utf8");

    const relData = path.relative(ROOT, dataPath).replace(/\\/g, "/");
    const res = { ok:true, path: relData, pushed:false };
    try{
      await git(["add", "--", relData]);
      const staged = await git(["diff", "--cached", "--quiet", "--", relData]);
      if(staged.code !== 0) await git(["commit", "-m", "Add album: " + album.group + " - " + albumName]);
      let p = await git(["push"]);
      if(p.code !== 0){ await git(["pull", "--rebase"]); p = await git(["push"]); }
      res.pushed = (p.code === 0);
    }catch(e){ res.gitError = e.message; }
    return res;
  }catch(e){ return { ok:false, error:e.message }; }
});

// ---- Elegir el vídeo (MV) desde el PC: copia a videos/ y lo sube ----
ipcMain.handle("pick-video", async (_e, args) => {
  args = args || {};
  try{
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Elegir vídeo (MV)",
      properties: ["openFile"],
      filters: [{ name:"Vídeo", extensions:["mp4","mov","mkv","webm","m4v","avi"] }]
    });
    if(canceled || !filePaths || !filePaths[0]) return { ok:false, canceled:true };
    const srcFile = filePaths[0];
    const base = (slug(args.group || "") + "_" + slug(args.song || "video")).replace(/^_|_$/g, "") || "video";
    const ext = (path.extname(srcFile) || ".mp4").toLowerCase();
    fs.mkdirSync(path.join(ROOT, "videos"), { recursive:true });
    const destRel = "videos/" + base + ext;
    fs.copyFileSync(srcFile, path.join(ROOT, destRel));
    // SOLO LOCAL: los vídeos NO se suben a GitHub (rápido, sin límite de 100 MB).
    // Se copian a videos/ y la app los usa desde ahí; carpeta videos/ está en .gitignore.
    return { ok:true, video: destRel, pushed:false, localOnly:true };
  }catch(e){ return { ok:false, error:e.message }; }
});

// ---- Elegir el AUDIO (mp3) desde el PC: copia a audio/ y lo sube ----
ipcMain.handle("pick-audio", async (_e, args) => {
  args = args || {};
  try{
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Elegir audio (mp3)",
      properties: ["openFile"],
      filters: [{ name:"Audio", extensions:["mp3","m4a","aac","wav","ogg","opus","flac"] }]
    });
    if(canceled || !filePaths || !filePaths[0]) return { ok:false, canceled:true };
    const srcFile = filePaths[0];
    const suffix = args.suffix ? String(args.suffix) : "";     // p.ej. "_inst" para el instrumental
    const base = (slug(args.group || "") + "_" + slug(args.song || "audio")).replace(/^_|_$/g, "") || "audio";
    const ext = (path.extname(srcFile) || ".mp3").toLowerCase();
    fs.mkdirSync(path.join(ROOT, "audio"), { recursive:true });
    const destRel = "audio/" + base + suffix + ext;
    fs.copyFileSync(srcFile, path.join(ROOT, destRel));

    const res = { ok:true, audio: destRel, pushed:false };
    try{
      await git(["add", "--", destRel]);
      const staged = await git(["diff", "--cached", "--quiet", "--", destRel]);
      if(staged.code !== 0) await git(["commit", "-m", "Add audio: " + (args.song || destRel)]);
      let p = await git(["push"]);
      if(p.code !== 0){ await git(["pull", "--rebase"]); p = await git(["push"]); }
      res.pushed = (p.code === 0);
      if(!res.pushed) res.gitError = p.err || p.out;
    }catch(e){ res.gitError = e.message; }
    return res;
  }catch(e){ return { ok:false, error:e.message }; }
});

// ---- Elegir la PORTADA (imagen) desde el PC: copia a covers/ y la sube ----
ipcMain.handle("pick-cover", async (_e, args) => {
  args = args || {};
  try{
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Elegir portada",
      properties: ["openFile"],
      filters: [{ name:"Imagen", extensions:["jpg","jpeg","png","webp"] }]
    });
    if(canceled || !filePaths || !filePaths[0]) return { ok:false, canceled:true };
    const srcFile = filePaths[0];
    const base = (slug(args.group || "") + "_" + slug(args.song || "cover")).replace(/^_|_$/g, "") || "cover";
    const ext = (path.extname(srcFile) || ".jpg").toLowerCase();
    fs.mkdirSync(path.join(ROOT, "covers"), { recursive:true });
    const destRel = "covers/" + base + ext;
    fs.copyFileSync(srcFile, path.join(ROOT, destRel));
    const res = { ok:true, cover: destRel, pushed:false };
    try{
      await git(["add", "--", destRel]);
      const staged = await git(["diff", "--cached", "--quiet", "--", destRel]);
      if(staged.code !== 0) await git(["commit", "-m", "Add cover: " + (args.song || destRel)]);
      let p = await git(["push"]);
      if(p.code !== 0){ await git(["pull", "--rebase"]); p = await git(["push"]); }
      res.pushed = (p.code === 0);
    }catch(e){ res.gitError = e.message; }
    return res;
  }catch(e){ return { ok:false, error:e.message }; }
});

// ---- Importar una foto (desde el PC) para un miembro: copia a _src y al display,
//      para que se vea ya y se pueda encuadrar. No hace commit (se sube al Guardar). ----
ipcMain.handle("import-photo", async (_e, args) => {
  args = args || {};
  try{
    const dest = String(args.imagePath || "");            // p.ej. images/nct2023/goldenage/mark.png
    if(!dest) return { ok:false, error:"falta la ruta de destino" };
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Elegir foto" + (args.name ? " de " + args.name : ""),
      properties: ["openFile"],
      filters: [{ name:"Imagen", extensions:["png","jpg","jpeg","webp","avif","bmp"] }]
    });
    if(canceled || !filePaths || !filePaths[0]) return { ok:false, canceled:true };
    const srcFile = filePaths[0];
    const destAbs = path.join(ROOT, dest);
    const dir = path.dirname(destAbs), base = path.basename(destAbs);
    const srcDir = path.join(dir, "_src");
    fs.mkdirSync(srcDir, { recursive:true });
    fs.copyFileSync(srcFile, path.join(srcDir, base));     // origen para encuadrar
    fs.copyFileSync(srcFile, destAbs);                     // display (se ve ya en el ranking, local)
    return { ok:true, src: "file:///" + path.join(srcDir, base).replace(/\\/g, "/") };
  }catch(e){ return { ok:false, error:e.message }; }
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

// Borrar una canción o álbum (su JSON). Seguridad: solo .json dentro de /data.
// Hace git rm + commit + push para que la baja llegue también a GitHub.
ipcMain.handle("delete-item", async (_e, args) => {
  const rel = (args && args.path) || "";
  const norm = rel.replace(/\\/g, "/");
  if(!/^data\/.+\.json$/i.test(norm) || norm.indexOf("..") !== -1){
    return { ok: false, error: "Ruta no permitida: " + rel };
  }
  const full = path.join(ROOT, rel);
  try{
    if(!fs.existsSync(full)) return { ok: false, error: "No existe el archivo." };
    fs.unlinkSync(full);
  }catch(e){ return { ok: false, error: e.message }; }

  const res = { ok: true, pushed: false, gitError: null };
  try{
    await git(["rm", "-f", "--ignore-unmatch", "--", rel]);
    const c = await git(["commit", "-m", "Delete " + (args.name || rel), "--", rel]);
    if(c.code !== 0) res.gitError = c.err || c.out;
    const p = await git(["push"]);
    if(p.code === 0) res.pushed = true;
    else res.gitError = (res.gitError ? res.gitError + " | " : "") + (p.err || p.out);
  }catch(e){ res.gitError = e.message; }
  return res;
});

// ============ CORTADOR DE VÍDEO (tipo LosslessCut, recodificando) ============
// Elegir un vídeo cualquiera del PC para recortar. Devuelve la ruta ABSOLUTA
// (el visor lo carga por file:// gracias a webSecurity:false).
ipcMain.handle("pick-cut-input", async () => {
  try{
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Elegir vídeo para recortar",
      properties: ["openFile"],
      filters: [{ name:"Vídeo", extensions:["mp4","mov","mkv","webm","m4v","avi","ts"] }]
    });
    if(canceled || !filePaths || !filePaths[0]) return { ok:false, canceled:true };
    return { ok:true, path: filePaths[0], name: path.basename(filePaths[0]) };
  }catch(e){ return { ok:false, error:e.message }; }
});

// Elegir el AUDIO oficial para el recorte (no se copia; ruta absoluta para file://).
ipcMain.handle("pick-cut-audio", async () => {
  try{
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Elegir audio oficial",
      properties: ["openFile"],
      filters: [{ name:"Audio", extensions:["mp3","m4a","aac","wav","flac","opus","ogg"] }]
    });
    if(canceled || !filePaths || !filePaths[0]) return { ok:false, canceled:true };
    return { ok:true, path: filePaths[0], name: path.basename(filePaths[0]) };
  }catch(e){ return { ok:false, error:e.message }; }
});

// Recorta recodificando (corte frame-exacto, sin depender de keyframes). Mantiene
// resolución y FPS del original; vídeo H.264 (CRF) + audio AAC 320k.
//  - segments: lista [{s,e}] de los TROZOS QUE SE CONSERVAN (en orden). Se concatenan.
//              (así se cubre: recortar puntas, y quitar uno o varios huecos de dentro.)
//  - audio (ruta): usa ese audio OFICIAL en vez del del vídeo (audioOffset: t_audio = t_video + off)
ipcMain.handle("cut-video", async (evt, args) => {
  args = args || {};
  const send = m => { try{ evt.sender.send("cut-progress", m); }catch(e){} };
  const input = String(args.input || "");
  const crf   = Math.min(28, Math.max(0, args.crf != null ? +args.crf : 16));
  const audio = args.audio ? String(args.audio) : "";
  const off   = +args.audioOffset || 0;
  // trozos a conservar
  let segs = Array.isArray(args.segments) ? args.segments
             : [{ s: +args.start || 0, e: +args.end || 0 }];
  segs = segs.map(sg => ({ s: Math.max(0, +sg.s || 0), e: +sg.e || 0 }))
             .filter(sg => sg.e - sg.s > 0.02)
             .sort((a,b) => a.s - b.s);
  if(!input || !fs.existsSync(input)) return { ok:false, error:"No se encuentra el vídeo de entrada." };
  if(audio && !fs.existsSync(audio)) return { ok:false, error:"No se encuentra el audio elegido." };
  if(!segs.length) return { ok:false, error:"No queda nada que guardar (revisa lo marcado)." };
  const outDur = segs.reduce((a,sg) => a + (sg.e - sg.s), 0);

  const dir  = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  const defOut = path.join(dir, base + "_cut.mp4");
  const save = await dialog.showSaveDialog({
    title: "Guardar recorte", defaultPath: defOut, filters: [{ name:"MP4", extensions:["mp4"] }]
  });
  if(save.canceled || !save.filePath) return { ok:false, canceled:true };
  const out = save.filePath;

  const ff = findFfmpeg();
  const vc = ["-c:v","libx264","-crf",String(crf),"-preset","slow","-pix_fmt","yuv420p"];
  const ac = ["-c:a","aac","-b:a","320k"];
  const tail = ["-movflags","+faststart","-stats_period","0.2", out];
  const f3 = n => (Math.max(0, n)).toFixed(3);
  let a;

  if(audio){
    // AUDIO OFICIAL CONTINUO: el vídeo se recorta/une, pero el audio suena seguido
    // (no se corta con los recortes). tiempo_audio = tiempo_editado + off, durante outDur.
    let fc = ""; const vlabels = [];
    segs.forEach((sg,i) => { fc += `[0:v]trim=${f3(sg.s)}:${f3(sg.e)},setpts=PTS-STARTPTS[v${i}];`; vlabels.push(`[v${i}]`); });
    fc += (segs.length > 1) ? (vlabels.join("") + `concat=n=${segs.length}:v=1:a=0[v];`)
                            : (`[v0]null[v];`);
    fc += `[1:a]atrim=${f3(off)}:${f3(off + outDur)},asetpts=PTS-STARTPTS[a]`;
    a = ["-y","-i",input,"-i",audio,"-filter_complex",fc,"-map","[v]","-map","[a]", ...vc, ...ac, ...tail];
  } else if(segs.length === 1){
    // un solo trozo, sin audio externo -> corte simple (rápido, frame-exacto al recodificar)
    a = ["-y","-ss",f3(segs[0].s),"-i",input,"-t",f3(segs[0].e-segs[0].s),
         "-map","0:v:0","-map","0:a:0?", ...vc, ...ac, ...tail];
  } else {
    // varios trozos, sin audio externo -> trim + concat (vídeo y su propio audio se cortan juntos)
    let fc = ""; const pairs = [];
    segs.forEach((sg,i) => {
      fc += `[0:v]trim=${f3(sg.s)}:${f3(sg.e)},setpts=PTS-STARTPTS[v${i}];`;
      fc += `[0:a]atrim=${f3(sg.s)}:${f3(sg.e)},asetpts=PTS-STARTPTS[a${i}];`;
      pairs.push(`[v${i}][a${i}]`);
    });
    fc += pairs.join("") + `concat=n=${segs.length}:v=1:a=1[v][a]`;
    a = ["-y","-i",input,"-filter_complex",fc,"-map","[v]","-map","[a]", ...vc, ...ac, ...tail];
  }

  send({ phase:"start", msg:"Recodificando (alta calidad)…" });
  try{
    const r = await spawnStream(ff, a, line => {
      const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
      if(m){ const t = (+m[1])*3600 + (+m[2])*60 + parseFloat(m[3]);
        send({ phase:"run", pct: Math.max(0, Math.min(100, Math.round(t/outDur*100))) }); }
    });
    if(r.code !== 0) return { ok:false, error:"ffmpeg " + r.code + ": " + (r.out||"").slice(-500) };
    let size = 0; try{ size = fs.statSync(out).size; }catch(e){}
    send({ phase:"done", pct:100 });
    return { ok:true, out, size };
  }catch(e){ return { ok:false, error:e.message }; }
});

// Member presets: reúne los miembros vistos en las OTRAS canciones del mismo
// grupo (misma carpeta), con su color/focus/lift más frecuente. Sirve para que,
// al re-añadir a alguien en el editor, salga con el preajuste que ya tenía.
ipcMain.handle("group-members", async (_e, relPath) => {
  try{
    const dir = path.dirname(path.join(ROOT, String(relPath)));
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith(".json"));
    const agg = {};
    for(const f of files){
      let data; try{ data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }catch(e){ continue; }
      (data.members || []).forEach(m => {
        if(!m || !m.name) return;
        const k = m.name;
        if(!agg[k]) agg[k] = { name:m.name, colors:{}, focus:m.focus, lift:m.lift };
        if(m.color) agg[k].colors[m.color] = (agg[k].colors[m.color] || 0) + 1;
        if(agg[k].focus == null && m.focus != null) agg[k].focus = m.focus;
        if(agg[k].lift  == null && m.lift  != null) agg[k].lift  = m.lift;
      });
    }
    const members = Object.values(agg).map(a => {
      let best = null, bc = -1;
      for(const c in a.colors){ if(a.colors[c] > bc){ bc = a.colors[c]; best = c; } }
      return { name:a.name, color: best || "#7c5cff", focus: a.focus != null ? a.focus : 50, lift: a.lift != null ? a.lift : 3 };
    });
    return { ok:true, members };
  }catch(e){ return { ok:false, error:e.message, members:[] }; }
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

  // Persist each member's framing (crop/zoom/rotation) into the song JSON so
  // reopening the tool restores exactly how you left every photo — and changing
  // ONE never touches the others. Written in the SAME commit as the photos.
  let songRel = null;
  try{
    if(args.songPath && args.songData){
      fs.writeFileSync(path.join(ROOT, args.songPath), JSON.stringify(args.songData, null, 2), "utf8");
      songRel = String(args.songPath).replace(/\\/g, "/");
    }
  }catch(e){ res.gitError = "json: " + e.message; }

  if(res.written === 0 && !songRel) return { ok: false, error: "no hay cambios que guardar" };

  // Bump PHOTO_VER so the viewer busts its image cache (only if photos changed).
  let bumped = null;
  if(res.written > 0){
    try{
      const rvPath = path.join(ROOT, "js", "ranking.js");
      let rv = fs.readFileSync(rvPath, "utf8");
      const m = rv.match(/const PHOTO_VER\s*=\s*(\d+)\s*;/);
      if(m){ rv = rv.replace(m[0], "const PHOTO_VER = " + (parseInt(m[1], 10) + 1) + ";"); fs.writeFileSync(rvPath, rv, "utf8"); bumped = "js/ranking.js"; }
    }catch(e){}
  }

  // Commit + push (rebase-and-retry once if the remote moved on).
  try{
    for(const d of dirs){ await git(["add", "--", path.relative(ROOT, d).replace(/\\/g, "/")]); }
    if(bumped) await git(["add", "--", bumped]);
    if(songRel) await git(["add", "--", songRel]);
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

// Miniatura del ÁLBUM (album-thumb.html) -> PNG 1280x720.
ipcMain.handle("export-album-thumb", async (evt, args) => {
  args = args || {};
  const album = args.album || "";
  const base = (args.name || "album");
  const def = path.join(app.getPath("pictures") || ROOT, base + "_albumthumb.png");
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Guardar miniatura del álbum", defaultPath: def,
    filters: [{ name: "Imagen PNG", extensions: ["png"] }]
  });
  if(canceled || !filePath) return { ok: false, canceled: true };
  let win;
  try{
    win = new BrowserWindow({ width: 1280, height: 720, show: false, useContentSize: true,
      webPreferences: { webSecurity: false, preload: path.join(__dirname, "preload.js") } });
    await win.loadFile(path.join(ROOT, "album-thumb.html"), { search: "album=" + album + "&export=1" });
    await new Promise(r => setTimeout(r, 1600));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 720 });
    fs.writeFileSync(filePath, img.toPNG());
    return { ok: true, out: filePath };
  }catch(e){ return { ok: false, error: e.message }; }
  finally{ if(win) win.destroy(); }
});

// =========================================================================
// Transcriptor: YouTube -> audio (yt-dlp) -> Whisper.cpp (traduce a inglés) ->
// texto limpio SIN tiempos, listo para copiar. Todo con binarios portátiles en
// tools/ (sin instalar Python). Streamea progreso a la ventana.
// =========================================================================
const TOOLS   = path.join(ROOT, "tools");
const YTDLP   = path.join(TOOLS, "yt-dlp.exe");

// Lanza un proceso; envía cada línea de salida a `onLine`; resuelve con el código.
function spawnStream(exe, args, onLine, opts){
  return new Promise((resolve, reject) => {
    let child;
    try{ child = spawn(exe, args, Object.assign({ windowsHide: true }, opts || {})); }
    catch(e){ return reject(e); }
    let out = "";
    const feed = buf => { const s = buf.toString(); out += s;
      s.split(/\r?\n/).forEach(l => { l = l.trim(); if(l && onLine) onLine(l); }); };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", reject);
    child.on("close", code => resolve({ code, out }));
  });
}

// Limpia un .srt/.vtt -> solo texto, sin números ni tiempos, sin repes seguidas.
function parseSubs(raw){
  const out = [];
  for(let l of String(raw).split(/\r?\n/)){
    l = l.trim();
    if(!l) continue;
    if(/^\d+$/.test(l)) continue;                 // índice de cue (SRT)
    if(l.includes("-->")) continue;               // línea de tiempos
    if(/^(WEBVTT|Kind:|Language:|NOTE\b)/i.test(l)) continue;
    l = l.replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").trim(); // quitar etiquetas
    if(l) out.push(l);
  }
  const dedup = [];
  for(const l of out){ if(dedup[dedup.length - 1] !== l) dedup.push(l); }  // auto-subs repiten líneas
  return dedup.join("\n");
}

ipcMain.handle("transcribe-url", async (evt, args) => {
  args = args || {};
  const url = String(args.url || "").trim();
  const subLang = String(args.subLang || "en").trim() || "en";
  const send = msg => { try{ evt.sender.send("transcribe-progress", msg); }catch(e){} };
  if(!url) return { ok: false, error: "Pega un enlace de YouTube." };
  if(!fs.existsSync(YTDLP)) return { ok: false, error: "Falta tools/yt-dlp.exe" };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ld-trans-"));
  try{
    send("⬇️ Buscando subtítulos del vídeo (" + subLang + ")…");
    await spawnStream(YTDLP,
      ["--skip-download", "--write-subs", "--write-auto-subs",
       "--sub-langs", subLang, "--convert-subs", "srt", "--no-playlist",
       "-o", path.join(tmp, "subs"), url],
      line => { if(/\[info\]|Writing|Deleting|ERROR|no subtitles|There are no subtitles/i.test(line)) send(line); });
    const srts = fs.readdirSync(tmp).filter(f => /\.srt$/i.test(f));
    if(!srts.length) throw new Error("El vídeo no tiene subtítulos en '" + subLang + "'. Prueba otro idioma (p.ej. ko, en, es, ja).");
    const clean = parseSubs(fs.readFileSync(path.join(tmp, srts[0]), "utf8"));
    if(!clean) throw new Error("Los subtítulos venían vacíos.");
    send("✅ Listo");
    return { ok: true, text: clean };
  }catch(e){
    return { ok: false, error: e.message };
  }finally{
    try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){}
  }
});

app.whenReady().then(async () => {
  // Limpia la caché al arrancar -> cada reinicio carga el HTML/JS/CSS nuevo
  // (evita que la app siga usando versiones viejas del editor/fotos/etc.).
  try{ await session.defaultSession.clearCache(); }catch(e){}
  if(EXPORT_OUT) exportHeadless().catch(e => { console.error("EXPORT_ERR " + e.message); app.exit(1); });
  else createWindow();
});
app.on("window-all-closed", () => app.quit());
