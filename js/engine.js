/* ========================================= */
/*              ENGINE.JS                    */
/* ========================================= */

const Engine = {

    song: null,

    currentLine: -1,

    load(song){

        this.song = song;

    },

    update(currentTime){

        if(!this.song) return;

        const lyrics = this.song.lyrics;

        const line = lyrics.findIndex(item => {

            return currentTime >= item.start &&
                   currentTime < item.end;

        });

        if(line === this.currentLine) return;

        this.currentLine = line;

        if(line === -1){

            UI.clearLyrics();
            UI.clearAdlibs();

            return;

        }

        const lyric = lyrics[line];

        this.updateCurrentLine(lyric);

    },

    updateCurrentLine(lyric){

        const color = CONFIG.members[lyric.member].color;

        UI.setCurrentMember(

            lyric.member,

            color

        );

        if(lyric.type === "english"){

            UI.setLyrics(

                "",

                lyric.text,

                ""

            );

        }

        else{

            UI.setLyrics(

                lyric.hangul,

                lyric.romanized,

                lyric.english

            );

        }

        UI.clearAdlibs();

        if(lyric.adlibs){

            lyric.adlibs.forEach(adlib=>{

                const lines=[];

                if(adlib.type==="english"){

                    lines.push(adlib.text);

                }

                else{

                    lines.push(adlib.hangul);

                    lines.push(adlib.romanized);

                    lines.push(adlib.english);

                }

                UI.addAdlib(

                    adlib.member,

                    CONFIG.members[adlib.member].color,

                    lines

                );

            });

        }

        Ranking.setActive(

            lyric.member

        );

    }

};
