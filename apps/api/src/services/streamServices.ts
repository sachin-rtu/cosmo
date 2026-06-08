import { Innertube, Platform } from 'youtubei.js'
import youtubedl, { create as createYtdl } from 'youtube-dl-exec'
import { execSync } from 'child_process'
import playdl from 'play-dl'


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

// Strategy 1: use yt-dlp via youtube-dl-exec (needs python3)
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

// Strategy 2: use play-dl (pure JavaScript, no external binaries needed)
async function getStreamUrlWithPlayDl(videoId: string): Promise<streamResult> {
    const url = `https://www.youtube.com/watch?v=${videoId}`
    const info = await playdl.video_info(url)

    if (info.LiveStreamData?.isLive) {
        const hlsUrl = info.LiveStreamData.hlsManifestUrl
        if (!hlsUrl) {
            throw new Error(`No HLS manifest found for live stream (play-dl): ${videoId}`)
        }
        return { type: 'live', url: hlsUrl, expiresAt: null }
    }

    // Get audio-only formats, sorted by bitrate (highest first)
    const formats = info.format
        .filter((f: any) => f.mimeType?.startsWith('audio/') && f.url)
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))

    if (formats.length > 0) {
        const expiresAt = Math.floor(Date.now() / 1000) + (4 * 60 * 60)
        return { type: 'vod', url: formats[0].url!, expiresAt }
    }

    // Fall back to any format with a URL
    const anyFormat = info.format.find((f: any) => f.url)
    if (anyFormat?.url) {
        const expiresAt = Math.floor(Date.now() / 1000) + (4 * 60 * 60)
        return { type: 'vod', url: anyFormat.url, expiresAt }
    }

    throw new Error(`No playable format found (play-dl): ${videoId}`)
}

export async function getStreamUrl(videoId: string): Promise<streamResult> {
    // Try yt-dlp first (best quality, but needs python3)
    // Then play-dl (pure JS, works everywhere)
    try {
        return await getStreamUrlWithYtDlp(videoId)
    } catch (ytdlError) {
        const ytdlMsg = ytdlError instanceof Error ? ytdlError.message : String(ytdlError)
        console.warn('yt-dlp failed, trying play-dl fallback:', ytdlMsg)

        try {
            return await getStreamUrlWithPlayDl(videoId)
        } catch (playDlError) {
            const playDlMsg = playDlError instanceof Error ? playDlError.message : String(playDlError)
            console.error('Both yt-dlp and play-dl failed for', videoId)
            console.error('  yt-dlp error:', ytdlMsg)
            console.error('  play-dl error:', playDlMsg)
            throw new Error(`Failed to get stream url: ${ytdlMsg} | play-dl: ${playDlMsg}`)
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