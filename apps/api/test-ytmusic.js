const { Innertube, Platform } = require('youtubei.js');
Platform.shim.eval = async (data) => new Function(data.output)();

async function run() {
    const yt = await Innertube.create({ location: 'IN', lang: 'en' });
    const explore = await yt.music.getExplore();
    for (const section of explore.sections) {
        console.log("Section:", section.type);
        for (const item of section.contents.slice(0, 3)) {
            console.log("  Item:", item.type, "id:", item.id, "title:", item.title?.text || item.title);
            if (item.endpoint?.payload?.videoId) {
                console.log("    -> playable videoId:", item.endpoint.payload.videoId);
            }
        }
    }
}
run().catch(console.error);
