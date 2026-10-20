
(function () {
  const SONG_URL = new URLSearchParams(location.search).get("song")
    || "data/nctdream/moonlight.json";

  const HOLD = 3.0;
  const FADE = 0.9;

  fetch(SONG_URL)
    .then(r => {
      if (!r.ok) throw new Error("No se pudo cargar la canción");
      return r.json();
    })
    .then(song => {
      const isCoded = song.layout === "coded";

      document.body.classList.toggle(
        "theme-light",
        song.theme === "light"
      );

      const style = document.createElement("style");

      style.textContent = `
        #intro-title {
          position: fixed;
          inset: 0;
          z-index: 9999;
          pointer-events: none;
          opacity: 1;
          overflow: hidden;
          font-family: var(--app-font, "Segoe UI", Arial, sans-serif);
        }

        /* INTRO ORIGINAL: se conserva para el formato clásico */
        #intro-title.classic {
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          background:
            radial-gradient(120% 90% at 50% 38%, #17172a 0%, transparent 60%),
            radial-gradient(120% 90% at 50% 100%, #1a1330 0%, transparent 55%),
            #0b0b11;
          color: #f4f4f8;
        }

        #intro-title.classic .it-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.2vh;
        }

        #intro-title.classic .it-grp {
          font-size: 2.6vh;
          font-weight: 800;
          letter-spacing: .7vh;
          text-transform: uppercase;
          color: #e9e9f2;
        }

        #intro-title.classic .it-sng {
          font-size: 9.2vh;
          font-weight: 900;
          line-height: 1;
          text-shadow: 0 2vh 6vh rgba(0,0,0,.6);
        }

        #intro-title.classic .it-sub {
          margin-top: .6vh;
          font-size: 2.4vh;
          font-weight: 800;
          letter-spacing: .85vh;
          text-transform: uppercase;
          color: #cfcfe0;
        }

        body.theme-light #intro-title.classic {
          background:
            radial-gradient(120% 90% at 50% 38%, #fff 0%, transparent 60%),
            radial-gradient(120% 90% at 50% 100%, #eceef4 0%, transparent 55%),
            #f4f5f9;
          color: #14151c;
        }

        body.theme-light #intro-title.classic .it-grp {
          color: #3a3d49;
        }

        body.theme-light #intro-title.classic .it-sub {
          color: #5a5f6c;
        }

        /* NUEVA INTRO: Color Coded Lyrics, estilo miniatura */
        #intro-title.coded {
          display: flex;
          flex-direction: column;
          background: #fff;
          color: #171717;
        }

        #intro-title .thumb-members {
          display: flex;
          flex: 0 0 53%;
          width: 100%;
          min-height: 0;
          overflow: hidden;
          background: #111;
        }

        #intro-title .thumb-member {
          position: relative;
          flex: 1 1 0;
          min-width: 0;
          overflow: hidden;
          background: #222;
        }

        #intro-title .thumb-member img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 45%;
        }

        #intro-title .thumb-member-name {
          position: absolute;
          left: 3px;
          right: 3px;
          bottom: 2.5%;
          overflow: hidden;
          text-align: center;
          white-space: nowrap;
          text-overflow: ellipsis;
          color: #fff;
          font-size: clamp(12px, 2.5vw, 42px);
          font-weight: 900;
          text-shadow:
            0 2px 5px #000,
            0 0 12px #000;
        }

        #intro-title .thumb-bottom {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 2.5vh 4vw;
          text-align: center;
          background: #fff;
          color: #171717;
          box-sizing: border-box;
        }

        #intro-title .thumb-group {
          margin-bottom: 1.2vh;
          font-size: clamp(16px, 3vh, 42px);
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        #intro-title .thumb-song {
          max-width: 100%;
          font-size: clamp(30px, 7.5vh, 100px);
          font-weight: 950;
          line-height: 1.08;
          overflow-wrap: anywhere;
        }

        #intro-title .thumb-subtitle {
          margin-top: 2vh;
          font-size: clamp(12px, 2.2vh, 28px);
          font-weight: 800;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: #555;
        }

        @media (max-width: 900px) {
          #intro-title.classic .it-sng {
            font-size: 9vw;
          }

          #intro-title.classic .it-grp {
            font-size: 3.4vw;
            letter-spacing: 1vw;
          }

          #intro-title.classic .it-sub {
            font-size: 3vw;
            letter-spacing: 1vw;
          }

          #intro-title .thumb-members {
            flex-basis: 48%;
          }

          #intro-title .thumb-song {
            font-size: clamp(28px, 7vw, 64px);
          }
        }
      `;

      document.head.appendChild(style);

      const el = document.createElement("div");
      el.id = "intro-title";
      el.className = isCoded ? "coded" : "classic";

      if (isCoded) {
        const members = (song.members || [])
          .map(member => `
            <div class="thumb-member">
              ${member.image
                ? `<img src="${member.image}" alt="">`
                : ""}
              <div class="thumb-member-name"></div>
            </div>
          `)
          .join("");

        el.innerHTML = `
          <div class="thumb-members">${members}</div>
          <div class="thumb-bottom">
            <div class="thumb-group"></div>
            <div class="thumb-song"></div>
            <div class="thumb-subtitle">Color Coded Lyrics</div>
          </div>
        `;

        el.querySelectorAll(".thumb-member-name")
          .forEach((node, i) => {
            node.textContent = song.members[i].name || "";
          });

        el.querySelector(".thumb-group").textContent =
          song.group || "";

        el.querySelector(".thumb-song").textContent =
          song.song || "";
      } else {
        el.innerHTML = `
          <div class="it-inner">
            <div class="it-grp"></div>
            <div class="it-sng"></div>
            <div class="it-sub">Lyrics + Line Distribution</div>
          </div>
        `;

        el.querySelector(".it-grp").textContent =
          song.group || "";

        el.querySelector(".it-sng").textContent =
          song.song || "";
      }

      document.body.appendChild(el);

      const video = document.getElementById("video");
      const cur = () =>
        video && isFinite(video.currentTime) ? video.currentTime : 0;

      const nowMs = () => performance.now();
      const liveStart = nowMs();

      let done = false;

      function tick() {
        if (done) return;

        let t;

        if (window.__DET_ANIM) {
          t = cur();
        } else if (cur() > 0.03) {
          t = cur();
        } else {
          t = (nowMs() - liveStart) / 1000;
        }

        if (t >= HOLD + FADE) {
          done = true;
          el.remove();
          style.remove();
          return;
        }

        const op = t <= HOLD
          ? 1
          : 1 - (t - HOLD) / FADE;

        const eased = op <= 0
          ? 0
          : op >= 1
            ? 1
            : op < 0.5
              ? 2 * op * op
              : 1 - Math.pow(-2 * op + 2, 2) / 2;

        el.style.opacity = eased.toFixed(3);
        el.style.visibility =
          eased > 0.002 ? "visible" : "hidden";

        el.style.transform =
          `translateY(${(-(1 - eased) * 2.4).toFixed(2)}vh)`;

        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    })
    .catch(error => {
      console.error("Error al cargar la intro:", error);
    });
})();
