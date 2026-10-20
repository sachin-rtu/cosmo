import { logger } from '../utils/logger'
import { Innertube, Platform } from 'youtubei.js'
import { execSync, execFileSync } from 'child_process'
import play from 'play-dl'
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
        }).catch(err => {
            innertubePromise = null
            throw err
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
    // yt-dlp not available — strategy will skip silently
}

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

// Strategy 1: use yt-dlp binary directly (skips silently when no binary exists)
async function getStreamUrlWithYtDlp(videoId: string): Promise<streamResult> {
    if (!customYtDlpPath) {
        logger.info('yt-dlp binary not found, skipping strategy')
        throw new Error('yt-dlp not available')
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`

    const output = execFileSync(customYtDlpPath, [
        '--dump-single-json',
        '--no-check-certificates',
        '--no-warnings',
        '--prefer-free-formats',
        '--extractor-args', 'youtube:player_client=android,ios',
        '--add-header', 'referer:youtube.com',
        '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        url,
    ], { encoding: 'utf-8', timeout: 30000 })

    const info = JSON.parse(output)
    return parseYtDlpResult(info, videoId)
}

async function getStreamUrlWithYti(videoId: string, quality: 'high' | 'low'): Promise<streamResult> {
    const yt = await getInnertube()
    const info = await yt.getInfo(videoId)
    const format = info.chooseFormat({ type: 'audio', quality: quality === 'low' ? 'lowest' : 'best' })
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
            logger.info(`Piped: loaded ${urls.length} instances from registry`)
            return urls
        }
    } catch (err) {
        logger.warn('Piped: failed to fetch instance registry:', (err as Error).message)
    }

    return FALLBACK_PIPED_INSTANCES
}

async function getStreamUrlWithPiped(videoId: string, quality: 'high' | 'low'): Promise<streamResult> {
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
                const sorted = audioWithUrl.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))
                const best = quality === 'low' ? sorted[sorted.length - 1] : sorted[0]
                logger.info(`Piped (${instance}) resolved audio stream for ${videoId}`)
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
                logger.info(`Piped (${instance}) resolved video+audio stream for ${videoId} (quality: ${pick.quality})`)
                return {
                    type: 'vod',
                    url: pick.url,
                    expiresAt: Math.floor(Date.now() / 1000) + (4 * 60 * 60),
                }
            }

            throw new Error('No audio or combined streams from Piped')
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
            logger.warn(`Piped instance ${instance} failed for ${videoId}:`, lastError.message)
        }
    }

    throw lastError || new Error('All Piped instances failed')
}

// Strategy 4: Cobalt Tools API
async function getStreamUrlWithCobalt(videoId: string): Promise<streamResult> {
    const url = `https://www.youtube.com/watch?v=${videoId}`
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)

        const res = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                url,
                downloadMode: 'audio',
                youtubeBetterAudio: true
            }),
            signal: controller.signal
        })
        clearTimeout(timeout)

        if (!res.ok) {
            throw new Error(`Cobalt returned ${res.status}`)
        }

        const data = await res.json() as any
        
        if (data.status === 'stream' || data.status === 'redirect') {
            return {
                type: 'vod',
                url: data.url,
                expiresAt: Math.floor(Date.now() / 1000) + (4 * 60 * 60)
            }
        }
        
        throw new Error('Cobalt failed to return a stream URL: ' + JSON.stringify(data))
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn(`Cobalt API failed for ${videoId}:`, msg)
        throw new Error(`Cobalt failed: ${msg}`)
    }
}

export async function getStreamUrl(videoId: string, quality: 'high' | 'low' = 'high'): Promise<streamResult> {
    // Strategy 1: yt-dlp
    try {
        return await getStreamUrlWithYtDlp(videoId)
    } catch (ytdlError) {
        const ytdlMsg = ytdlError instanceof Error ? ytdlError.message : String(ytdlError)
        logger.error('yt-dlp failed for', videoId, ytdlMsg)
    }

    // Strategy 2: youtubei.js
    try {
        logger.info('Falling back to youtubei.js for', videoId)
        return await getStreamUrlWithYti(videoId, quality)
    } catch (ytiError) {
        const ytiMsg = ytiError instanceof Error ? ytiError.message : String(ytiError)
        logger.error('youtubei.js failed for', videoId, ytiMsg)
    }

    // Strategy 3: Piped API (external IPs, bypasses Railway bot detection)
    try {
        logger.info('Falling back to Piped API for', videoId)
        return await getStreamUrlWithPiped(videoId, quality)
    } catch (pipedError) {
        const pipedMsg = pipedError instanceof Error ? pipedError.message : String(pipedError)
        logger.error('Piped API failed for', videoId, pipedMsg)
    }
    
    // Strategy 4: Cobalt API
    try {
        logger.info('Falling back to Cobalt API for', videoId)
        return await getStreamUrlWithCobalt(videoId)
    } catch (cobaltError) {
        const cobaltMsg = cobaltError instanceof Error ? cobaltError.message : String(cobaltError)
        logger.error('Cobalt API failed for', videoId, cobaltMsg)
    }

    // Strategy 5: play-dl (Very reliable for Discord bots, handles bot checks internally)
    try {
        logger.info('Falling back to play-dl for', videoId)
        const info = await play.video_info(`https://www.youtube.com/watch?v=${videoId}`)
        const format = info.format.find((f: any) => f.hasAudio && !f.hasVideo) || info.format.find((f: any) => f.hasAudio)
        
        if (format && format.url) {
            logger.info('play-dl resolved stream for', videoId)
            return {
                type: 'vod',
                url: format.url,
                expiresAt: Math.floor(Date.now() / 1000) + (4 * 60 * 60)
            }
        }
        throw new Error('play-dl returned no audio formats')
    } catch (playDlError) {
        const playDlMsg = playDlError instanceof Error ? playDlError.message : String(playDlError)
        logger.error('play-dl failed for', videoId, playDlMsg)
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