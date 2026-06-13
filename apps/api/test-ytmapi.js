const YTMusic = require('ytmusic-api').default;

async function run() {
    const ytmusic = new YTMusic();
    await ytmusic.initialize();
    
    console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(ytmusic)));
}
run();
