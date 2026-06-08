import { Innertube, Platform } from 'youtubei.js'
import youtubedl, { create as createYtdl } from 'youtube-dl-exec'
import { execSync } from 'child_process'


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

// Resolve the system yt-dlp binary path (from nix or pip install)
let systemYtDlpPath: string | null = null
try {
    systemYtDlpPath = execSync('which yt-dlp', { encoding: 'utf-8' }).trim()
} catch {
    // System yt-dlp not available
}

const ytdlOptions = {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    ]
} as const;
const ytdlOpts = { ...ytdlOptions, addHeader: [...ytdlOptions.addHeader] }

function parseYtDlpResult(info: any, videoId: string): streamResult {
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
}

// Primary: use yt-dlp via youtube-dl-exec
async function getStreamUrlWithYtDlp(videoId: string): Promise<streamResult> {
    const url = `https://www.youtube.com/watch?v=${videoId}`

    // Try bundled yt-dlp first
    try {
        const info = await youtubedl(url, ytdlOpts) as any
        return parseYtDlpResult(info, videoId)
    } catch (bundledError) {
        // If bundled fails and we have a system binary, try that
        if (systemYtDlpPath) {
            console.warn('Bundled yt-dlp failed, trying system binary:', systemYtDlpPath)
            const systemYtdl = createYtdl(systemYtDlpPath)
            const info = await systemYtdl(url, ytdlOpts) as any
            return parseYtDlpResult(info, videoId)
        }
        throw bundledError
    }
}

// Fallback: use youtubei.js (Innertube) directly
async function getStreamUrlWithInnertube(videoId: string): Promise<streamResult> {
    const yt = await getInnertube()
    const info = await yt.getBasicInfo(videoId)

    if (info.basic_info.is_live) {
        const hlsUrl = info.streaming_data?.hls_manifest_url
        if (!hlsUrl) {
            throw new Error(`No HLS manifest found for live stream (innertube): ${videoId}`)
        }
        return { type: 'live', url: hlsUrl, expiresAt: null }
    }

    // Prefer audio-only adaptive formats
    const adaptiveFormats = info.streaming_data?.adaptive_formats ?? []
    const audioFormat = adaptiveFormats.find(
        (f: any) => f.mime_type?.startsWith('audio/') && f.url
    )

    if (audioFormat?.url) {
        const expiresAt = Math.floor(Date.now() / 1000) + (4 * 60 * 60)
        return { type: 'vod', url: audioFormat.url, expiresAt }
    }

    // Fall back to any format with a URL
    const anyFormat = info.streaming_data?.formats?.find((f: any) => f.url)
    if (anyFormat?.url) {
        const expiresAt = Math.floor(Date.now() / 1000) + (4 * 60 * 60)
        return { type: 'vod', url: anyFormat.url, expiresAt }
    }

    throw new Error(`No playable format found (innertube): ${videoId}`)
}

export async function getStreamUrl(videoId: string): Promise<streamResult> {
    // Try yt-dlp first, fall back to youtubei.js
    try {
        return await getStreamUrlWithYtDlp(videoId)
    } catch (ytdlError) {
        const ytdlMsg = ytdlError instanceof Error ? ytdlError.message : String(ytdlError)
        console.warn('yt-dlp failed, trying innertube fallback:', ytdlMsg)

        try {
            return await getStreamUrlWithInnertube(videoId)
        } catch (innertubeError) {
            const innertubeMsg = innertubeError instanceof Error ? innertubeError.message : String(innertubeError)
            console.error('Both yt-dlp and innertube failed for', videoId)
            console.error('  yt-dlp error:', ytdlMsg)
            console.error('  innertube error:', innertubeMsg)
            throw new Error(`Failed to get stream url: ${ytdlMsg} | innertube: ${innertubeMsg}`)
        }
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