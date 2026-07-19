/*
=========================================
Engine  v3
=========================================
*/

const Engine = {

    previousTime:0,
    previousCentisecond:0,
    lyricLead:.30,

    /*
       Which members' VOICE is sounding at time t? Returns an array (may be empty).
        - "voice": [[s,e],[s,e]]        -> segments credit the line's members.
        - "voice": [[s,e,"JENO"], ...]  -> a segment can name its OWN member(s)
          (3rd item, string or array) — for shared lines where one member only
          sings a fragment (e.g. JAEMIN singing just "let's go").
        - "voiceStart"/"voiceEnd"       -> a single segment, credits line members.
        - none                          -> falls back to start/end, line members.
    */
    creditedMembers(t){
        const out = [];
        const add = names => { for(const n of names) if(!out.includes(n)) out.push(n); };

        for(const line of SONG.lyrics){
            if(Array.isArray(line.voice)){
                for(const seg of line.voice){
                    if(t >= seg[0] && t < seg[1]){
                        const m = seg[2];
                        add(m ? (Array.isArray(m) ? m : [m]) : line.members);
                    }
                }
            } else {
                const voiceStart = line.voiceStart ?? line.start;
                const voiceEnd   = line.voiceEnd   ?? line.end;
                if(t >= voiceStart && t < voiceEnd) add(line.members);
            }
        }
        return out;
    },

    /* Light up the cards of whoever's VOICE is sounding right now (not just
       whoever's lyric is on screen), so a card turns off during a silence
       even if the line's text stays visible. */
    updateActive(time){
        Ranking.setActive(this.creditedMembers(time));
        Ranking.markDone(time);   // dim the card of anyone who won't sing again
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
            // Group lines (e.g. "NCT DREAM") resolve to no real member -> no time added.
            const sampleTime = centisecond / 100 - .005;
            const who = this.creditedMembers(sampleTime);
            if(who.length) Ranking.queueTime(who);
        }

        this.previousCentisecond = currentCentisecond;
    }
};
