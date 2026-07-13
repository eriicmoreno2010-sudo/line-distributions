/*
=========================================
Engine  v3
=========================================
*/

const Engine = {

    previousTime:0,
    previousCentisecond:0,
    lyricLead:.12,

    update(time){

        const delta = time - this.previousTime;
        this.previousTime = time;

        Lyrics.update(Math.min(time + this.lyricLead, SONG.duration));
        Timeline.update(time);

        // Ignore seeks / initial jumps so the ranking stays accurate
        if(delta < 0 || delta > 1){
            this.previousCentisecond = Math.floor(time * 100 + .0001);
            return;
        }

        const currentCentisecond = Math.floor(time * 100 + .0001);

        for(let centisecond = this.previousCentisecond + 1;
            centisecond <= currentCentisecond;
            centisecond++){

            // Sample the middle of each centisecond so line boundaries count correctly.
            const sampleTime = centisecond / 100 - .005;
            const current = SONG.lyrics.find(
                line => sampleTime >= line.start && sampleTime < line.end
            );

            if(current) Ranking.queueTime(current.members);
        }

        this.previousCentisecond = currentCentisecond;
    }
};
