/* ========================================= */
/*                APP.JS                     */
/* ========================================= */

document.addEventListener("DOMContentLoaded", async () => {

    try{

        const response = await fetch("data/moonlight.json");

        const song = await response.json();

        UI.setGroup(song.group);

        UI.setSong(song.song);

        Ranking.load(song);

        Engine.load(song);

        Player.init();

        function loop(){

            const time = Player.getTime();

            Engine.update(time);

            Ranking.refresh(song.duration);

            requestAnimationFrame(loop);

        }

        requestAnimationFrame(loop);

    }

    catch(error){

        console.error(error);

    }

});
