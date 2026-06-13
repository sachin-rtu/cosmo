const youtubedl = require('youtube-dl-exec');

async function run() {
    try {
        const info = await youtubedl('https://www.youtube.com/watch?v=82-jTNka3uc', {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            ]
        });
        const audioFormat = info.formats.find(f => f.acodec !== 'none' && f.vcodec === 'none');
        console.log("YT-DLP URL:", audioFormat ? audioFormat.url : "No audio format");
    } catch (e) {
        console.error("Error:", e.message);
    }
}
run();
