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

let innertubePromise: Promise<Innertube> | null = null

async function getInnertube(): Promise<Innertube> {
    if (!innertubePromise) {
        innertubePromise = Innertube.create({
            retrieve_player: true,
            generate_session_locally: true
        })
    }
    return innertubePromise
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

// Strategy 3: Piped API — runs on external IPs, bypasses Railway IP bans
// Dynamically fetch working Piped API instances, refresh every 30 minutes
let cachedPipedInstances: string[] = []
let pipedInstancesFetchedAt = 0
const PIPED_INSTANCES_TTL = 30 * 60 * 1000 // 30 min

const FALLBACK_PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
]

async function getPipedInstances(): Promise<string[]> {
    if (cachedPipedInstances.length > 0 && Date.now() - pipedInstancesFetchedAt < PIPED_INSTANCES_TTL) {
        return cachedPipedInstances
    }

    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch('https://piped-instances.kavin.rocks/', { signal: controller.signal })
        clearTimeout(timeout)

        if (!res.ok) throw new Error(`Registry returned ${res.status}`)
        const list = await res.json() as any[]

        const urls = list
            .filter((i: any) => i.api_url && i.uptime_24h > 90)
            .sort((a: any, b: any) => (b.uptime_24h || 0) - (a.uptime_24h || 0))
            .map((i: any) => i.api_url)

        if (urls.length > 0) {
            cachedPipedInstances = urls
            pipedInstancesFetchedAt = Date.now()
            console.log(`Piped: loaded ${urls.length} instances from registry`)
            return urls
        }
    } catch (err) {
        console.warn('Piped: failed to fetch instance registry:', (err as Error).message)
    }

    return FALLBACK_PIPED_INSTANCES
}

async function getStreamUrlWithPiped(videoId: string): Promise<streamResult> {
    const instances = await getPipedInstances()
    let lastError: Error | null = null

    for (const instance of instances) {
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 8000)

            const res = await fetch(`${instance}/streams/${videoId}`, {
                signal: controller.signal,
            })
            clearTimeout(timeout)

            if (!res.ok) {
                throw new Error(`Piped ${instance} returned ${res.status}`)
            }

            const data = await res.json() as any

            // Check if it's a live stream
            if (data.livestream) {
                const hlsUrl = data.hls
                if (!hlsUrl) throw new Error('No HLS URL for live stream from Piped')
                return { type: 'live', url: hlsUrl, expiresAt: null }
            }

            // Try audio-only streams first
            const audioStreams = data.audioStreams || []
            const audioWithUrl = audioStreams.filter((s: any) => s.url)
            if (audioWithUrl.length > 0) {
                const best = audioWithUrl.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0]
                console.log(`Piped (${instance}) resolved audio stream for ${videoId}`)
                return {
                    type: 'vod',
                    url: best.url,
                    expiresAt: Math.floor(Date.now() / 1000) + (4 * 60 * 60),
                }
            }

            // Fallback: use video streams that include audio (videoOnly=false)
            const videoStreams = data.videoStreams || []
            const withAudio = videoStreams.filter((s: any) => s.url && s.videoOnly === false)
            if (withAudio.length > 0) {
                // Prefer LBRY (Odysee CDN) or lowest quality video (saves bandwidth for audio-only use)
                const lbry = withAudio.find((s: any) => s.quality === 'LBRY')
                const pick = lbry || withAudio[withAudio.length - 1]
                console.log(`Piped (${instance}) resolved video+audio stream for ${videoId} (quality: ${pick.quality})`)
                return {
                    type: 'vod',
                    url: pick.url,
                    expiresAt: Math.floor(Date.now() / 1000) + (4 * 60 * 60),
                }
            }

            throw new Error('No audio or combined streams from Piped')
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
            console.warn(`Piped instance ${instance} failed for ${videoId}:`, lastError.message)
        }
    }

    throw lastError || new Error('All Piped instances failed')
}

export async function getStreamUrl(videoId: string): Promise<streamResult> {
    // Strategy 1: yt-dlp
    try {
        return await getStreamUrlWithYtDlp(videoId)
    } catch (ytdlError) {
        const ytdlMsg = ytdlError instanceof Error ? ytdlError.message : String(ytdlError)
        console.error('yt-dlp failed for', videoId, ytdlMsg)
    }

    // Strategy 2: youtubei.js
    try {
        console.log('Falling back to youtubei.js for', videoId)
        return await getStreamUrlWithYti(videoId)
    } catch (ytiError) {
        const ytiMsg = ytiError instanceof Error ? ytiError.message : String(ytiError)
        console.error('youtubei.js failed for', videoId, ytiMsg)
    }

    // Strategy 3: Piped API (external IPs, bypasses Railway bot detection)
    try {
        console.log('Falling back to Piped API for', videoId)
        return await getStreamUrlWithPiped(videoId)
    } catch (pipedError) {
        const pipedMsg = pipedError instanceof Error ? pipedError.message : String(pipedError)
        console.error('Piped API failed for', videoId, pipedMsg)
        throw new Error(`All stream strategies failed for ${videoId}`)
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