import type { FastifyInstance } from 'fastify'
import { getOrSet, invalidate } from '../plugins/cacheHelpers'
import { getStreamUrl, searchTracks } from '../services/streamServices'

export async function streamRoutes(fastify: FastifyInstance) {

    fastify.get('/search', async (request, reply) => {
        const { q } = request.query as { q: string }

        if (!q?.trim()) {
            return reply.status(400).send({ error: 'Query is required' })
        }

        const results = await searchTracks(q)
        return reply.send(results)
    })

    fastify.get('/:videoId', async (request, reply) => {

        const { videoId } = request.params as { videoId: string }

        const { forceRefresh, quality } = request.query as { forceRefresh?: string, quality?: 'high' | 'low' }
        const shouldForceRefresh = forceRefresh === 'true'
        const streamQuality = quality === 'low' ? 'low' : 'high'

        const cacheKey = `stream:${streamQuality}:${videoId}`

        const result = await getOrSet(
            fastify,
            cacheKey,
            () => getStreamUrl(videoId, streamQuality),
            {
                ttlSeconds: 14400,
                forceRefresh: shouldForceRefresh,
            }
        )

        if (shouldForceRefresh) {
            fastify.log.info({ videoId }, 'stream:force-refreshed')
        }

        return reply.send(result)
    })

    fastify.delete('/:videoId/cache', async (request, reply) => {
        const { videoId } = request.params as { videoId: string }
        await invalidate(fastify, `stream:${videoId}`)
        return reply.send({ success: true, message: `Cache cleared for ${videoId}` })
    })
}