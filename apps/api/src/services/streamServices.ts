import { Innertube, Platform } from 'youtubei.js'
import ytdl from '@distube/ytdl-core'


// signature-protected stream URLs. Without this, the library cannot
// resolve URLs that use signature ciphers.
Platform.shim.eval = async (data: any) => {
    return new Function(data.output)()
}

export type streamResult =
    | { type: 'vod'; url: string; expiresAt: number }
    | { type: 'live'; url: string; expiresAt: null }

let innertube: Innertube | null = null

async function getInnertube(): Promise<Innertube> {
    if (!innertube) {
        innertube = await Innertube.create({
            retrieve_player: true,
        })
    }
    return innertube
}

export async function getStreamUrl(videoId: string): Promise<streamResult> {
    try {
        const info = await ytdl.getInfo(videoId)
        
        if (info.videoDetails.isLiveContent) {
            const manifestUrl = info.formats.find(f => f.isHLS)?.url
            if (!manifestUrl) {
                throw new Error(`No HLS manifest found for live stream: ${videoId}`)
            }
            return { type: 'live', url: manifestUrl, expiresAt: null }
        }

        const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
        
        if (!format || !format.url) {
            throw new Error(`No audio format found for video: ${videoId}`)
        }

        const expiresAt = Math.floor(Date.now() / 1000) + (4 * 60 * 60)

        return {
            type: 'vod',
            url: format.url,
            expiresAt,
        }
    } catch (error) {
        console.error('Error getting stream URL with ytdl-core:', error.message)
        throw new Error(`Failed to get stream url: ${error.message}`)
    }
}

export async function searchTracks(query: string) {
    const yt = await getInnertube()
    const results = await yt.search(query, { type: 'video' })

    return results.videos
        .slice(0, 10)
        .map((video: any) => ({
            videoId: video.id,
            title: video.title.text ?? 'Unknown',
            artist: video.author?.name ?? 'Unknown',
            durationMs: (video.duration?.seconds ?? 0) * 1000,
            thumbnail: video.thumbnails?.[0]?.url ?? null,
        }))
}