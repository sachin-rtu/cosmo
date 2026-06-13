const yt = require('youtube-ext');

async function run() {
    try {
        const info = await yt.videoInfo('82-jTNka3uc');
        const format = info.format.find(f => f.hasAudio && !f.hasVideo);
        console.log("Stream URL:", format ? format.url : "No format");
    } catch(e) {
        console.error("Error:", e.message);
    }
}
run();
