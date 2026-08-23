/*
Exposes a tiny, safe API to the app so the in-app button can trigger the
frame-by-frame 4K export in the main process (only present in the desktop app).
*/
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  exportVideo: (args) => ipcRenderer.invoke("export-video", args || {}),
  onProgress: (cb) => ipcRenderer.on("export-progress", (_e, p) => cb(p)),
  listSongs: () => ipcRenderer.invoke("list-songs"),
  createSong: (args) => ipcRenderer.invoke("create-song", args || {}),
  pickVideo: (args) => ipcRenderer.invoke("pick-video", args || {}),
  importPhoto: (args) => ipcRenderer.invoke("import-photo", args || {}),
  loadSong: (relPath) => ipcRenderer.invoke("load-song", relPath),
  saveSong: (relPath, data) => ipcRenderer.invoke("save-song", { path: relPath, data }),
  photoSources: (paths) => ipcRenderer.invoke("photo-sources", paths),
  savePhotos: (args) => ipcRenderer.invoke("save-photos", args),
  exportThumb: (args) => ipcRenderer.invoke("export-thumb", args),
  transcribeUrl: (args) => ipcRenderer.invoke("transcribe-url", args || {}),
  transcribeListModels: () => ipcRenderer.invoke("transcribe-list-models"),
  onTranscribeProgress: (cb) => ipcRenderer.on("transcribe-progress", (_e, m) => cb(m))
});
