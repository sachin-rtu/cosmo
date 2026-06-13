/**
 * Client-side InnerTube stream resolver.
 *
 * Requests go directly from the user's phone (residential IP) to YouTube,
 * bypassing datacenter IP bot-detection that blocks our Railway server.
 *
 * Multi-client fallback: IOS → ANDROID_MUSIC → WEB_REMIX → ANDROID_VR
 */

import { createMMKV } from 'react-native-mmkv'

const innertubeStorage = createMMKV({ id: 'cosmo-innertube' })

// ─── Client Definitions ───────────────────────────────────────────────

interface InnerTubeClient {
    clientName: string
    clientVersion: string
    clientId: string
    userAgent: string
    osName?: string
    osVersion?: string
    deviceMake?: string
    deviceModel?: string
    androidSdkVersion?: number
    platform?: string
}

const CLIENTS: InnerTubeClient[] = [
    // 1. iOS — currently least blocked by YouTube
    {
        clientName: 'IOS',
        clientVersion: '20.10.4',
        clientId: '5',
        userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
        osName: 'iOS',
        osVersion: '18.3.2',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        platform: 'MOBILE',
    },
    // 2. Android Music — YouTube Music app identity, returns audio-focused formats
    {
        clientName: 'ANDROID_MUSIC',
        clientVersion: '7.27.52',
        clientId: '21',
        userAgent: 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14; Pixel 8 Build/UQ1A.240105.002) gzip',
        osName: 'Android',
        osVersion: '14',
        deviceMake: 'Google',
        deviceModel: 'Pixel 8',
        androidSdkVersion: 34,
        platform: 'MOBILE',
    },
    // 3. WEB_REMIX — YouTube Music web (same as Velune uses for browsing)
    {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20260114.00.00',
        clientId: '67',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        platform: 'DESKTOP',
    },
    // 4. Android VR — legacy fallback, may return limited formats
    {
        clientName: 'ANDROID_VR',
        clientVersion: '1.65.10',
        clientId: '28',
        userAgent: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        osName: 'Android',
        osVersion: '12L',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        androidSdkVersion: 32,
    },
]

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`

// ─── Visitor Data ─────────────────────────────────────────────────────

function getOrCreateVisitorData(): string {
    const stored = innertubeStorage.getString('visitor-data')
    if (stored) return stored

    // Generate a plausible visitor data string (base64-encoded random bytes)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    let result = 'CgtV'
    for (let i = 0; i < 22; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    result += '%3D%3D'
    innertubeStorage.set('visitor-data', result)
    return result
}

// Generate a client playback nonce (16 hex chars)
function generateCPN(): string {
    const chars = '0123456789abcdef'
    let cpn = ''
    for (let i = 0; i < 16; i++) {
        cpn += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return cpn
}

// ─── Audio Format Selection ───────────────────────────────────────────

interface StreamFormat {
    itag: number
    url?: string
    signatureCipher?: string
    mimeType: string
    bitrate: number
    audioQuality?: string
    audioSampleRate?: string
    contentLength?: string
    approxDurationMs?: string
}

function selectBestAudioFormat(formats: StreamFormat[], quality: 'high' | 'low' = 'high'): StreamFormat | null {
    // Only consider formats that have a direct URL (no cipher)
    const audioFormats = formats.filter(
        (f) => f.mimeType?.includes('audio/') && f.url && !f.signatureCipher
    )

    if (audioFormats.length === 0) return null

    // If high quality: Prefer opus/webm > mp4a/aac, then highest bitrate
    // If low quality (Data Saver): Lowest bitrate
    const sorted = audioFormats.sort((a, b) => {
        if (quality === 'low') {
            return (a.bitrate || 0) - (b.bitrate || 0)
        } else {
            const aIsOpus = a.mimeType.includes('opus') ? 1 : 0
            const bIsOpus = b.mimeType.includes('opus') ? 1 : 0
            if (aIsOpus !== bIsOpus) return bIsOpus - aIsOpus
            return (b.bitrate || 0) - (a.bitrate || 0)
        }
    })

    return sorted[0]
}

// ─── Core: Fetch stream with a specific client ────────────────────────

async function fetchWithClient(
    videoId: string,
    client: InnerTubeClient,
    quality: 'high' | 'low' = 'high'
): Promise<string> {
    const visitorData = getOrCreateVisitorData()
    const cpn = generateCPN()

    const body: Record<string, any> = {
        videoId,
        cpn,
        context: {
            client: {
                clientName: client.clientName,
                clientVersion: client.clientVersion,
                hl: 'en',
                gl: 'US',
                visitorData,
                ...(client.osName && { osName: client.osName }),
                ...(client.osVersion && { osVersion: client.osVersion }),
                ...(client.deviceMake && { deviceMake: client.deviceMake }),
                ...(client.deviceModel && { deviceModel: client.deviceModel }),
                ...(client.androidSdkVersion && { androidSdkVersion: client.androidSdkVersion }),
                ...(client.platform && { platform: client.platform }),
            },
        },
        playbackContext: {
            contentPlaybackContext: {
                signatureTimestamp: 20073,
            },
        },
        contentCheckOk: true,
        racyCheckOk: true,
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': client.userAgent,
        'X-Goog-Api-Format-Version': '2',
        'X-YouTube-Client-Name': client.clientId,
        'X-YouTube-Client-Version': client.clientVersion,
    }

    // WEB_REMIX needs origin/referer headers
    if (client.clientName === 'WEB_REMIX') {
        headers['Origin'] = 'https://music.youtube.com'
        headers['Referer'] = 'https://music.youtube.com/'
    }

    const res = await fetch(PLAYER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        throw new Error(`InnerTube HTTP ${res.status} with ${client.clientName}`)
    }

    const data = await res.json()

    // Check playability
    const status = data.playabilityStatus?.status
    if (status === 'UNPLAYABLE') {
        // Video genuinely unavailable — no point trying other clients
        throw new UnplayableError(
            data.playabilityStatus?.reason || 'Video is unplayable'
        )
    }
    if (status === 'LOGIN_REQUIRED' || status === 'ERROR') {
        throw new Error(
            `${client.clientName} blocked: ${data.playabilityStatus?.reason || status}`
        )
    }
    if (status !== 'OK') {
        throw new Error(
            `${client.clientName} unexpected status: ${status}`
        )
    }

    // Extract audio formats
    const adaptiveFormats: StreamFormat[] =
        data.streamingData?.adaptiveFormats || []
    const regularFormats: StreamFormat[] =
        data.streamingData?.formats || []

    // Try adaptive (audio-only) first, then regular (muxed)
    let bestAudio = selectBestAudioFormat(adaptiveFormats)
    if (!bestAudio) {
        // Fallback: muxed format that has audio
        bestAudio = selectBestAudioFormat(regularFormats)
    }

    if (!bestAudio?.url) {
        throw new Error(`No playable audio formats from ${client.clientName}`)
    }

    console.log(
        `[InnerTube] ${client.clientName} resolved audio for ${videoId}: ` +
        `${bestAudio.mimeType} @ ${Math.round(bestAudio.bitrate / 1000)}kbps`
    )

    return bestAudio.url
}

// ─── Custom error for genuinely unplayable videos ─────────────────────

class UnplayableError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'UnplayableError'
    }
}

// ─── Public API: Resolve stream with multi-client fallback ────────────

export interface ClientStreamResult {
    url: string
    expiresAt: number
    source: 'client'
}

/**
 * Resolve a YouTube audio stream URL directly from the device.
 * Tries multiple InnerTube client identities in order.
 * Throws if all clients fail or the video is genuinely unplayable.
 */
export async function resolveStreamClientSide(
    videoId: string,
    quality: 'high' | 'low' = 'high'
): Promise<ClientStreamResult> {
    let lastError: Error | null = null

    for (const client of CLIENTS) {
        try {
            const url = await fetchWithClient(videoId, client, quality)
            return {
                url,
                // YouTube stream URLs typically expire in ~6 hours,
                // we use 4h to be safe
                expiresAt: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
                source: 'client',
            }
        } catch (err) {
            if (err instanceof UnplayableError) {
                // Video is genuinely unplayable, don't try other clients
                throw err
            }
            lastError = err instanceof Error ? err : new Error(String(err))
            console.warn(
                `[InnerTube] ${client.clientName} failed for ${videoId}:`,
                lastError.message
            )
        }
    }

    throw lastError || new Error(`All InnerTube clients failed for ${videoId}`)
}
