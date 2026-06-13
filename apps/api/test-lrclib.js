const { LrcLib } = require('lrclib-api')

async function test() {
    const lrclib = new LrcLib()
    const result = await lrclib.search('shape of you', 'ed sheeran')
    console.log(result)
}
test()
