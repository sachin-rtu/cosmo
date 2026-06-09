import { Innertube, Platform } from 'youtubei.js'
import youtubedl, { create as createYtdl } from 'youtube-dl-exec'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'


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
            generate_session_locally: true
        })
    }
    return innertube
}

// Resolve the yt-dlp binary path (standalone linux binary or system)
let customYtDlpPath: string | null = null
try {
    const localPath = path.join(__dirname, '..', '..', 'yt-dlp_linux')
    const localPath2 = path.join(process.cwd(), 'yt-dlp_linux')
    
    if (fs.existsSync(localPath)) {
        customYtDlpPath = localPath
    } else if (fs.existsSync(localPath2)) {
        customYtDlpPath = localPath2
    } else {
        customYtDlpPath = execSync('which yt-dlp', { encoding: 'utf-8' }).trim()
    }
} catch {
    // yt-dlp not available
}

const ytdlOptions = {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    'extractor-args': 'youtube:player_client=android,ios',
    addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    ]
} as const;
const ytdlOpts = { ...ytdlOptions, addHeader: [...ytdlOptions.addHeader] } as any

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

// Strategy 1: use yt-dlp via youtube-dl-exec
async function getStreamUrlWithYtDlp(videoId: string): Promise<streamResult> {
    const url = `https://www.youtube.com/watch?v=${videoId}`

    // Use standalone binary if available, otherwise try the bundled one
    const ytdl = customYtDlpPath ? createYtdl(customYtDlpPath) : youtubedl

    const info = await ytdl(url, ytdlOpts) as any
    return parseYtDlpResult(info, videoId)
}

async function getStreamUrlWithYti(videoId: string): Promise<streamResult> {
    const yt = await getInnertube()
    const info = await yt.getInfo(videoId)
    const format = info.chooseFormat({ type: 'audio', quality: 'best' })
    if (!format || !format.url) {
        throw new Error(`No audio format found for video: ${videoId}`)
    }
    return {
        type: 'vod',
        url: format.url,
        expiresAt: Math.floor(Date.now() / 1000) + (4 * 60 * 60)
    }
}

export async function getStreamUrl(videoId: string): Promise<streamResult> {
    try {
        return await getStreamUrlWithYtDlp(videoId)
    } catch (ytdlError) {
        const ytdlMsg = ytdlError instanceof Error ? ytdlError.message : String(ytdlError)
        console.error('yt-dlp failed for', videoId, ytdlMsg)
        
        console.log('Falling back to youtubei.js for', videoId)
        try {
            return await getStreamUrlWithYti(videoId)
        } catch (ytiError) {
            console.error('youtubei.js failed for', videoId, ytiError)
            throw new Error(`Failed to get stream url: yt-dlp error: ${ytdlMsg}, youtubei error: ${ytiError instanceof Error ? ytiError.message : String(ytiError)}`)
        }
    }
}

export async function searchTracks(query: string) {
    const yt = await getInnertube()
    const results = await yt.search(query, { type: 'video' })

    return results.videos
        .slice(0, 10)
        .map((video: any) => {
            let thumbUrl = video.thumbnails?.[0]?.url;
            if (thumbUrl && thumbUrl.startsWith('//')) {
                thumbUrl = 'https:' + thumbUrl;
            }
            return {
                videoId: video.id,
                title: video.title.text ?? 'Unknown',
                artist: video.author?.name ?? 'Unknown',
                durationMs: (video.duration?.seconds ?? 0) * 1000,
                thumbnail: thumbUrl || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
            };
        })
}