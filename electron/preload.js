/*
Exposes a tiny, safe API to the app so the in-app button can trigger the
frame-by-frame 4K export in the main process (only present in the desktop app).
*/
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  exportVideo: (args) => ipcRenderer.invoke("export-video", args || {}),
  onProgress: (cb) => ipcRenderer.on("export-progress", (_e, p) => cb(p)),
  listSongs: () => ipcRenderer.invoke("list-songs")
});
