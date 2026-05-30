import { Innertube, Platform } from 'youtubei.js'

// Provide a custom JavaScript evaluator for deciphering YouTube's
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
    const yt = await getInnertube()
    const info = await yt.getInfo(videoId)

    // Live streams 
    if (info.basic_info.is_live) {
        const manifestUrl = info.streaming_data?.hls_manifest_url
        if (!manifestUrl) {
            throw new Error(`No HLS manifest found for live stream: ${videoId}`)
        }

        return { type: 'live', url: manifestUrl, expiresAt: null }
    }

    // Try adaptive audio-only formats first, then fall back to muxed
    let streamUrl: string | undefined

    // 1. Try adaptive audio format (best quality audio-only)
    const audioFormat = info.streaming_data?.adaptive_formats
        ?.filter(f => f.has_audio && !f.has_video)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]

    if (audioFormat) {
        streamUrl = audioFormat.url
        if (!streamUrl && (audioFormat.signature_cipher || audioFormat.cipher)) {
            streamUrl = await audioFormat.decipher(yt.session.player)
        }
    }

    // 2. Fall back to muxed format (audio+video, but has cipher data)
    if (!streamUrl) {
        const muxedFormat = info.streaming_data?.formats
            ?.filter(f => f.has_audio)
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]

        if (muxedFormat) {
            streamUrl = muxedFormat.url
            if (!streamUrl && (muxedFormat.signature_cipher || muxedFormat.cipher)) {
                streamUrl = await muxedFormat.decipher(yt.session.player)
            }
        }
    }

    if (!streamUrl) {
        throw new Error(`No audio format found for video: ${videoId}`)
    }

    const expiresAt = Math.floor(Date.now() / 1000) + (4 * 60 * 60)

    return {
        type: 'vod',
        url: streamUrl,
        expiresAt,
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