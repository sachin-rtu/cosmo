import { Innertube, Platform } from 'youtubei.js'
import youtubedl from 'youtube-dl-exec'


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
        const info = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            ]
        }) as any;
        
        if (info.is_live) {
            const manifestUrl = info.formats.find((f: any) => f.format_id === '91' || f.format_id === '92' || f.format_id === '93' || f.format_id === '94' || f.format_id === '95' || f.format_id === '96' || f.url?.includes('m3u8'))?.url || info.url;
            if (!manifestUrl) {
                throw new Error(`No HLS manifest found for live stream: ${videoId}`)
            }
            return { type: 'live', url: manifestUrl, expiresAt: null }
        }

        const format = info.formats.find((f: any) => f.acodec !== 'none' && f.vcodec === 'none') || info.formats.find((f: any) => f.acodec !== 'none');
        
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
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('Error getting stream URL with youtube-dl-exec:', errorMessage)
        throw new Error(`Failed to get stream url: ${errorMessage}`)
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