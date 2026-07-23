/* Desktop app only: a "back to library" button in the viewer. */
(function(){
  if(!(window.desktop && window.desktop.isDesktop)) return;
  const p = new URLSearchParams(location.search);
  if(p.get("render") || p.get("rec")) return;   // not during export/capture

  function add(){
    const b = document.createElement("button");
    b.id = "lib-back";
    b.textContent = "←  Biblioteca";
    b.style.cssText =
      "position:fixed;top:14px;left:14px;z-index:2147483000;padding:9px 14px;" +
      "font:800 13px system-ui,sans-serif;border:1px solid #33334a;border-radius:10px;" +
      "background:#15151d;color:#cfcfe0;cursor:pointer";
    b.onmouseenter = () => b.style.background = "#232333";
    b.onmouseleave = () => b.style.background = "#15151d";
    b.onclick = () => { location.href = "library.html"; };
    document.body.appendChild(b);
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
  else add();
})();
