const { Innertube, Platform } = require('youtubei.js');
Platform.shim.eval = async (data) => new Function(data.output)();
(async () => {
  try {
    const yt = await Innertube.create({ retrieve_player: true });
    const info = await yt.getInfo('vrY1THC_NQE');
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    console.log(format ? format.url : 'No format');
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
