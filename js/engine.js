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

            // The counter follows the VOICE, not how long the lyric is shown.
            //  - "voice": [[s,e],[s,e]]  -> counts several segments (silences in
            //    between are NOT counted) while the text stays shown the whole line.
            //  - "voiceStart"/"voiceEnd" -> a single voice segment.
            //  - neither                 -> falls back to start/end.
            const current = SONG.lyrics.find(line => {
                if(Array.isArray(line.voice)){
                    return line.voice.some(
                        ([s, e]) => sampleTime >= s && sampleTime < e
                    );
                }
                const voiceStart = line.voiceStart ?? line.start;
                const voiceEnd   = line.voiceEnd   ?? line.end;
                return sampleTime >= voiceStart && sampleTime < voiceEnd;
            });

            // Group lines (e.g. "NCT DREAM") resolve to no real member, so they
            // never add time — the counter stays per singer.
            if(current) Ranking.queueTime(current.members);
        }

        this.previousCentisecond = currentCentisecond;
    }
};
