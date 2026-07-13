/*
=========================================
Engine  v3
=========================================
*/

const Engine = {

    previousTime:0,

    update(time){

        let delta = time - this.previousTime;
        this.previousTime = time;

        Lyrics.update(time);
        Timeline.update(time);

        // Ignore seeks / initial jumps so the ranking stays accurate
        if(delta < 0 || delta > 1) delta = 0;

        const current = SONG.lyrics.find(
            line => time >= line.start && time < line.end
        );

        if(current && delta > 0){
            Ranking.addTime(current.members[0], delta);
        }

        Ranking.refresh(SONG.duration);
    }
};
