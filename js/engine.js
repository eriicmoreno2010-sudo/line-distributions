/*
=========================================
Engine
=========================================
*/

const Engine = {

    previousTime:0,

    update(time){

        const delta =

            time - this.previousTime;

        this.previousTime = time;

        Lyrics.update(time);

        const current =

            SONG.lyrics.find(

                line =>

                time >= line.start &&

                time < line.end

            );

        if(current){

            Ranking.addTime(

                current.member,

                delta

            );

            Ranking.refresh(

                SONG.duration

            );

        }

    }

};
