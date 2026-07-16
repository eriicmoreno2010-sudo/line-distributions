/*
=========================================
Engine  v3
=========================================
*/

const Engine = {

    previousTime:0,
    previousCentisecond:0,
    lyricLead:.12,

    /*
       Is the VOICE of this line sounding at time t?
        - "voice": [[s,e],[s,e]]  -> several segments (silences in between
          don't count) while the text stays shown for the whole line.
        - "voiceStart"/"voiceEnd" -> a single voice segment.
        - neither                 -> falls back to start/end.
    */
    voiceActiveAt(line, t){
        if(Array.isArray(line.voice)){
            return line.voice.some(([s, e]) => t >= s && t < e);
        }
        const voiceStart = line.voiceStart ?? line.start;
        const voiceEnd   = line.voiceEnd   ?? line.end;
        return t >= voiceStart && t < voiceEnd;
    },

    /* Light up the cards of whoever's VOICE is sounding right now (not just
       whoever's lyric is on screen), so a card turns off during a silence
       even if the line's text stays visible. */
    updateActive(time){
        const active = [];
        for(const line of SONG.lyrics){
            if(this.voiceActiveAt(line, time)){
                for(const name of line.members){
                    if(!active.includes(name)) active.push(name);
                }
            }
        }
        Ranking.setActive(active);
        Ranking.updateVisuals();
    },

    update(time){

        const delta = time - this.previousTime;
        this.previousTime = time;

        Lyrics.update(Math.min(time + this.lyricLead, SONG.duration));
        Timeline.update(time);
        this.updateActive(time);

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

            // Group lines (e.g. "NCT DREAM") resolve to no real member, so they
            // never add time — the counter stays per singer.
            const current = SONG.lyrics.find(line => this.voiceActiveAt(line, sampleTime));
            if(current) Ranking.queueTime(current.members);
        }

        this.previousCentisecond = currentCentisecond;
    }
};
