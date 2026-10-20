/*
  INTRO DE LA CANCION
  Color Coded Lyrics: miniatura con fotos y titulo.
  Otros formatos: intro original.
*/
(function () {
  const SONG_URL =
    new URLSearchParams(location.search).get("song") ||
    "data/nctdream/moonlight.json";

  const HOLD = 3.0;
  const FADE = 0.9;

  function animateIntro(el, inner) {
    const video = document.getElementById("video");
    const start = performance.now();
    let done = false;

    function tick() {
      if (done) return;

      const current =
        video && Number.isFinite(video.currentTime)
          ? video.currentTime
          : 0;

      const t = window.__DET_ANIM
        ? current
        : current > 0.03
          ? current
          : (performance.now() - start) / 1000;

      if (t >= HOLD + FADE) {
        done = true;
        el.remove();
        return;
      }

      const opacity = t <= HOLD ? 1 : 1 - (t - HOLD) / FADE;

      const eased =
        opacity <= 0
          ? 0
          : opacity >= 1
            ? 1
            : opacity < 0.5
              ? 2 * opacity * opacity
              : 1 - Math.pow(-2 * opacity + 2, 2) / 2;

      el.style.opacity = eased.toFixed(3);
      el.style.visibility = eased > 0.002 ? "visible" : "hidden";

      if (inner) {
        inner.style.transform =
          "translateY(" + (-(1 - eased) * 2.4).toFixed(2) + "vh)";
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // INTRO EXCLUSIVA DE COLOR CODED LYRICS
  function showCodedIntro(song) {
    const style = document.createElement("style");

    style.textContent = `
      #coded-intro {
        position: fixed;
        inset: 0;
        z-index: 9999;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: #fff;
        font-family: var(--app-font, "Segoe UI", Inter, Arial, sans-serif);
      }

      #coded-intro-photos {
        height: 43%;
        flex: none;
        display: flex;
        overflow: hidden;
        background: #111;
      }

      #coded-intro-photos .member {
        position: relative;
        flex: 1 1 0;
        min-width: 0;
        overflow: hidden;
        border-bottom: 5px solid var(--member-color, #888);
      }

      #coded-intro-photos img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center 42%;
      }

      #coded-intro-photos .member::after {
        content: "";
        position: absolute;
        inset: 45% 0 0;
        background: linear-gradient(transparent, rgba(0,0,0,.65));
      }

      #coded-intro-photos .member-name {
        position: absolute;
        z-index: 1;
        left: 3px;
        right: 3px;
        bottom: 5px;
        color: #fff;
        text-align: center;
        font-size: clamp(9px, 1.5vw, 22px);
        font-weight: 800;
        text-shadow: 0 1px 4px #000;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #coded-intro-title {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 2vh 4vw 3vh;
        gap: 1.4vh;
        background: #fff;
      }

      #coded-intro-song {
        max-width: 94%;
        color: #173d3e;
        font-size: clamp(32px, 8.8vw, 13vh);
        line-height: .92;
        font-weight: 1000;
        letter-spacing: -.035em;
        text-transform: uppercase;
        overflow-wrap: anywhere;
      }

      #coded-intro-sub {
        color: #313b3b;
        font-size: clamp(9px, 1.3vw, 18px);
        font-weight: 800;
        letter-spacing: .18em;
        text-transform: uppercase;
      }

      #coded-intro-accent {
        height: 8px;
        flex: none;
        background: #ff347d;
      }

      @media (max-width: 600px) {
        #coded-intro-photos { height: 40%; }
        #coded-intro-title { gap: 1vh; }
        #coded-intro-song { font-size: clamp(28px, 9vw, 8vh); }
        #coded-intro-sub {
          font-size: clamp(8px, 2vw, 13px);
          letter-spacing: .12em;
        }
      }
    `;

    document.head.appendChild(style);

    // Evita que aparezca también la intro antigua.
    const oldIntroStyle = document.createElement("style");
    oldIntroStyle.textContent = "#intro-title { display: none !important; }";
    document.head.appendChild(oldIntroStyle);

    const overlay = document.createElement("div");
    overlay.id = "coded-intro";

    const photos = document.createElement("div");
    photos.id = "coded-intro-photos";

    (song.members || []).forEach(member => {
      const item = document.createElement("div");
      item.className = "member";
      item.style.setProperty(
        "--member-color",
        member.color || "#888"
      );

      const img = document.createElement("img");
      img.alt = member.name || "";
      img.src = member.image || "";
      img.onerror = () => {
        img.style.visibility = "hidden";
      };

      const name = document.createElement("div");
      name.className = "member-name";
      name.textContent = member.name || "";

      item.append(img, name);
      photos.appendChild(item);
    });

    const title = document.createElement("div");
    title.id = "coded-intro-title";

    const songTitle = document.createElement("div");
    songTitle.id = "coded-intro-song";
    songTitle.textContent = song.song || "";

    const subtitle = document.createElement("div");
    subtitle.id = "coded-intro-sub";
    subtitle.textContent = "Color Coded Lyrics · Line Distribution";

    title.append(songTitle, subtitle);

    const accent = document.createElement("div");
    accent.id = "coded-intro-accent";

    const firstMember = (song.members || []).find(m => m.color);
    if (firstMember) {
      accent.style.background = firstMember.color;
    }

    overlay.append(photos, title, accent);
    document.body.appendChild(overlay);

    animateIntro(overlay, title);
  }

  // INTRO ORIGINAL PARA EL OTRO FORMATO
  function showOriginalIntro(song) {
    const style = document.createElement("style");

    style.textContent = `
      #intro-title {
        position: fixed;
        inset: 0;
        z-index: 250;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        background:
          radial-gradient(120% 90% at 50% 38%, #17172a 0%, transparent 60%),
          radial-gradient(120% 90% at 50% 100%, #1a1330 0%, transparent 55%),
          #0b0b11;
        color: #f4f4f8;
        font-family: var(--app-font, "Segoe UI", Inter, Arial, sans-serif);
        opacity: 1;
      }

      #intro-title .it-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.2vh;
      }

      #intro-title .it-grp {
        font-size: 2.6vh;
        font-weight: 800;
        letter-spacing: .7vh;
        text-transform: uppercase;
        color: #e9e9f2;
      }

      #intro-title .it-sng {
        font-size: 9.2vh;
        font-weight: 900;
        letter-spacing: .1vh;
        line-height: 1;
        text-shadow: 0 2vh 6vh rgba(0,0,0,.6);
      }

      #intro-title .it-sub {
        font-size: 2.4vh;
        font-weight: 800;
        letter-spacing: .85vh;
        text-transform: uppercase;
        color: #cfcfe0;
        margin-top: .6vh;
      }

      @media (max-width: 900px) {
        #intro-title .it-sng { font-size: 9vw; }
        #intro-title .it-grp {
          font-size: 3.4vw;
          letter-spacing: 1vw;
        }
        #intro-title .it-sub {
          font-size: 3vw;
          letter-spacing: 1vw;
        }
      }

      body.theme-light #intro-title {
        background:
          radial-gradient(120% 90% at 50% 38%, #fff 0%, transparent 60%),
          radial-gradient(120% 90% at 50% 100%, #eceef4 0%, transparent 55%),
          #f4f5f9;
        color: #14151c;
      }

      body.theme-light #intro-title .it-grp { color: #3a3d49; }
      body.theme-light #intro-title .it-sub { color: #5a5f6c; }

      body.theme-light #intro-title .it-sng {
        text-shadow: 0 2vh 6vh rgba(0,0,0,.12);
      }
    `;

    document.head.appendChild(style);

    const el = document.createElement("div");
    el.id = "intro-title";
    el.innerHTML = `
      <div class="it-inner">
        <div class="it-grp"></div>
        <div class="it-sng"></div>
        <div class="it-sub">Lyrics + Line Distribution</div>
      </div>
    `;

    document.body.appendChild(el);

    el.querySelector(".it-grp").textContent = song.group || "";
    el.querySelector(".it-sng").textContent = song.song || "";

    document.body.classList.toggle(
      "theme-light",
      song.theme === "light"
    );

    animateIntro(el, el.querySelector(".it-inner"));
  }

  fetch(SONG_URL)
    .then(response => {
      if (!response.ok) {
        throw new Error("No se pudo cargar el JSON de la canción");
      }
      return response.json();
    })
    .then(song => {
      if (song.layout === "coded") {
        showCodedIntro(song);
      } else {
        showOriginalIntro(song);
      }
    })
    .catch(error => {
      console.error("Error al mostrar la intro:", error);
    });
})();
