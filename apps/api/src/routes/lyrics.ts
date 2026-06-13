import type { FastifyInstance } from 'fastify'
import { LrcLib } from 'lrclib-api'
import { getOrSet } from '../plugins/cacheHelpers'

const lrclib = new LrcLib()

export async function lyricsRoutes(fastify: FastifyInstance) {
    fastify.get('/', async (request, reply) => {
        const { title, artist } = request.query as { title: string; artist: string }

        if (!title || !artist) {
            return reply.status(400).send({ error: 'Title and artist are required' })
        }

        const cacheKey = `lyrics:${title}:${artist}`

        const result = await getOrSet(
            fastify,
            cacheKey,
            async () => {
                try {
                    // lrclib-api get() or search() might return { syncedLyrics, plainLyrics } 
                    // But based on instructions, we call getSynced() 
                    const syncedRaw = await lrclib.get(title, artist).catch(() => null)
                    let synced: { time: number; text: string }[] | null = null
                    let plain: string | null = null

                    if (syncedRaw && syncedRaw.syncedLyrics) {
                        synced = parseLrc(syncedRaw.syncedLyrics)
                    } else if (syncedRaw && syncedRaw.plainLyrics) {
                        plain = syncedRaw.plainLyrics
                    }

                    if (!synced && typeof (lrclib as any).getSynced === 'function') {
                        const s = await (lrclib as any).getSynced(title, artist).catch(() => null)
                        if (typeof s === 'string') synced = parseLrc(s)
                        else if (Array.isArray(s)) synced = s
                    }

                    if (!synced && !plain && typeof (lrclib as any).getUnsynced === 'function') {
                        plain = await (lrclib as any).getUnsynced(title, artist).catch(() => null)
                    }

                    return { synced: synced || null, plain: plain || null }
                } catch (err: any) {
                    fastify.log.error(`Failed to fetch lyrics for ${title} by ${artist}: ${err.message}`)
                    return { synced: null, plain: null }
                }
            },
            { ttlSeconds: 604800 } // 7 days
        )

        return reply.send(result)
    })
}

function parseLrc(lrc: string) {
    const lines = lrc.split('\n')
    const parsed: { time: number; text: string }[] = []
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/

    for (const line of lines) {
        const match = timeRegex.exec(line)
        if (match) {
            const minutes = parseInt(match[1], 10)
            const seconds = parseInt(match[2], 10)
            const milliseconds = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10)
            const time = minutes * 60 + seconds + milliseconds / 1000
            const text = line.replace(timeRegex, '').trim()
            if (text) {
                parsed.push({ time, text })
            }
        }
    }
    return parsed
}
