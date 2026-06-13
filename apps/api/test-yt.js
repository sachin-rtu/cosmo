const { Innertube, Platform } = require('youtubei.js');
Platform.shim.eval = async (data) => new Function(data.output)();

async function run() {
    try {
        const yt = await Innertube.create({ generate_session_locally: true });
        const info = await yt.getInfo('82-jTNka3uc', 'TV_EMBEDDED');
        const format = info.chooseFormat({ type: 'audio', quality: 'best' });
        console.log("TV_EMBEDDED URL:", format.url);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
run();
