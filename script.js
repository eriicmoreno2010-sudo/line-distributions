async function loadSong() {

    const response = await fetch("data/moonlight.json");

    const song = await response.json();

    // Grupo y canción
    document.getElementById("group-name").textContent = song.group;
    document.getElementById("song-name").textContent = song.song;

    // Vídeo
    const video = document.getElementById("video");
    video.src = song.video;

    // Ranking
    const ranking = document.getElementById("ranking");

    ranking.innerHTML = "";

    song.members.forEach(member => {

        ranking.innerHTML += `

            <div class="member">

                <div class="member-left">

                    <img src="${member.image}" alt="${member.name}">

                    <span>${member.name}</span>

                </div>

                <span class="member-time">0.0</span>

            </div>

        `;

    });

}

loadSong();
