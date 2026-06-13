const play = require('play-dl');

(async () => {
    try {
        const info = await play.video_info('vrY1THC_NQE');
        const format = info.format.find(f => f.hasAudio && !f.hasVideo) || info.format.find(f => f.hasAudio);
        console.log("Play-DL Success! URL:", format.url.substring(0, 100) + '...');
    } catch (err) {
        console.error("Play-DL Error:", err.message);
    }
})();
