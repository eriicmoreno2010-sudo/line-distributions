async function loadSong() {

    const response = await fetch("data/moonlight.json");
    const song = await response.json();

    // Grupo y canción
    document.getElementById("group-name").textContent = song.group;
    document.getElementById("song-name").textContent = song.song;

    // Vídeo
    const video = document.getElementById("video");

    if(song.video){
        video.src = song.video;
    }else{
        video.style.display = "none";
        document.querySelector(".video-section").innerHTML = `
            <div class="no-video">
                <h2>VIDEO</h2>
                <p>Añade un vídeo para esta canción</p>
            </div>
        `;
    }

    // Ranking
    const ranking = document.getElementById("ranking");
    ranking.innerHTML = "";

    song.members.forEach(member => {

        ranking.innerHTML += `

        <div class="member">

            <div class="member-top">

                <div class="member-left">

                    <img src="${member.image}" alt="${member.name}">

                    <span>${member.name}</span>

                </div>

                <span class="member-time">0.0 s</span>

            </div>

            <div class="member-bar">

                <div class="member-progress"
                     style="background:${member.color}; width:0%;">
                </div>

            </div>

        </div>

        `;

    });

}

loadSong();
