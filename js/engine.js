/*
=========================================
Engine  v4
Drives the lyric panel from the video clock.
The ranking (counter + card highlight) runs on its own time-exact loop
in Ranking.startClock(); the timeline cursor on Timeline.startCursor().
=========================================
*/

const Engine = {

    lyricLead:.30,   // show lyrics slightly early to offset the crossfade

    update(time){
        if(typeof SONG === "undefined" || !SONG) return;
        Lyrics.update(Math.min(time + this.lyricLead, SONG.duration));
    }
};
