const ytdl = require('@distube/ytdl-core');

async function run() {
    try {
        const info = await ytdl.getInfo('82-jTNka3uc');
        console.log("Formats available:", info.formats.length);
        const audioOnly = info.formats.filter(f => !f.hasVideo && f.hasAudio);
        console.log("Audio only formats:", audioOnly.length);
        
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
        console.log("Fallback URL:", format.url);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
run();
