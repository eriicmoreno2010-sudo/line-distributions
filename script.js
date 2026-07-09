let membersData = [];

async function loadSong() {

    const response = await fetch("data/moonlight.json");
    const song = await response.json();

    document.getElementById("group-name").textContent = song.group;
    document.getElementById("song-name").textContent = song.song;

    membersData = song.members.map(member => ({
        ...member,
        seconds: 0
    }));

    renderRanking();

    startDemo();

}

function renderRanking(){

    const ranking = document.getElementById("ranking");

    ranking.innerHTML="";

    membersData.forEach(member=>{

        ranking.innerHTML += `

        <div class="member">

            <div class="member-top">

                <div class="member-left">

                    <img src="${member.image}">

                    <span>${member.name}</span>

                </div>

                <span class="member-time">${member.seconds.toFixed(1)} s</span>

            </div>

            <div class="member-bar">

                <div
                    class="member-progress"
                    style="
                        width:${member.seconds*4}%;
                        background:${member.color};
                    ">
                </div>

            </div>

        </div>

        `;

    });

}

function startDemo(){

    let current = 0;

    setInterval(()=>{

        membersData[current].seconds += 0.1;

        if(membersData[current].seconds>8){

            current++;

            if(current>=membersData.length){

                current=0;

            }

        }

        renderRanking();

    },100);

}

loadSong();
