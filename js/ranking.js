/* ========================================= */
/*             RANKING.JS                    */
/* ========================================= */

const Ranking = {

    members: [],

    load(song){

        this.members = song.members.map(member => ({

            ...member,

            seconds:0,

            percentage:0,

            active:false,

            lastUpdate:0

        }));

        this.render();

    },


render() {

    UI.elements.ranking.innerHTML = "";

    this.members.forEach(member => {

        const card = document.createElement("div");

        card.className = "member fade-in";

        if (member.active) {

            card.classList.add("active");

        }

        card.innerHTML = `

            <div class="member-top">

                <div class="member-left">

                    <img
                        class="member-photo"
                        src="${member.image}"
                        alt="${member.name}"
                    >

                    <span class="member-name">

                        ${member.name}

                    </span>

                </div>

                <span class="member-time">

                    ${member.seconds.toFixed(2)} s

                </span>

            </div>

            <div class="member-bar">

                <div
                    class="member-progress"
                    style="
                        width:${member.percentage}%;
                        background:${member.color};
                    ">
                </div>

            </div>

        `;

        // 🔥 Guardamos referencias a los elementos
        member.element = card;

        member.timeElement = card.querySelector(".member-time");

        member.progressElement = card.querySelector(".member-progress");

        UI.elements.ranking.appendChild(card);

    });

},

        updateVisuals() {

    this.members.forEach(member => {

        if (member.timeElement) {

            member.timeElement.textContent =
                member.seconds.toFixed(2) + " s";

        }

        if (member.progressElement) {

            member.progressElement.style.width =
                member.percentage + "%";

        }

        if (member.element) {

            member.element.classList.toggle(
                "active",
                member.active
            );

        }

    });

},
    
    updateMember(name,seconds,totalDuration){

        const member=this.members.find(

            m=>m.name===name

        );

        if(!member) return;

        member.seconds=seconds;

        member.percentage=(seconds/totalDuration)*100;

    },

    setActive(name){

        this.members.forEach(member=>{

            member.active=member.name===name;

        });

    },

     addTime(name, delta){

    const member = this.members.find(

        m => m.name === name

    );

    if(!member) return;

    member.seconds += delta;

},

    sort(){

        this.members.sort(

            (a,b)=>b.seconds-a.seconds

        );

    },

    refresh(totalDuration){

        this.members.forEach(member=>{

            member.percentage=

                (member.seconds/totalDuration)*100;

        });

        this.sort();

        this.updateVisuals();

    }

};
