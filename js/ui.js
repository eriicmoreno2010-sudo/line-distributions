/* ========================================= */
/*                UI.JS                       */
/* ========================================= */

const UI = {

    elements: {

        groupName: document.getElementById("group-name"),

        songName: document.getElementById("song-name"),

        video: document.getElementById("video"),

        ranking: document.getElementById("ranking"),

        currentMember: document.getElementById("current-member"),

        hangul: document.getElementById("hangul"),

        romanized: document.getElementById("romanized"),

        english: document.getElementById("english"),

        adlibs: document.getElementById("adlibs"),

        timeline: document.getElementById("timeline-progress")

    },

    setGroup(name){

        this.elements.groupName.textContent = name;

    },

    setSong(name){

        this.elements.songName.textContent = name;

    },

    setCurrentMember(name,color){

        this.elements.currentMember.textContent = name;

        this.elements.currentMember.style.color = color;

    },

    setLyrics(hangul,romanized,english){

        this.elements.hangul.textContent = hangul || "";

        this.elements.romanized.textContent = romanized || "";

        this.elements.english.textContent = english || "";

    },

    clearLyrics(){

        this.setLyrics("","","");

    },

    updateTimeline(percent){

        this.elements.timeline.style.width = percent + "%";

    },

    clearAdlibs(){

        this.elements.adlibs.innerHTML = "";

    },

    addAdlib(member,color,lines){

        const card = document.createElement("div");

        card.className = "adlib-card";

        card.style.borderColor = color;

        card.style.background = color + "22";

        let html = `<h4>${member}</h4>`;

        lines.forEach(line=>{

            html += `<p>${line}</p>`;

        });

        card.innerHTML = html;

        this.elements.adlibs.appendChild(card);

    }

};
