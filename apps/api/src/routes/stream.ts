import type { FastifyInstance } from 'fastify'
import { getOrSet, invalidate } from '../plugins/cacheHelpers'
import { getStreamUrl } from '../services/streamServices'

export async function streamRoutes(fastify: FastifyInstance) {

    fastify.get('/:videoId', async (request, reply) => {

        const { videoId } = request.params as { videoId: string }

        const { forceRefresh } = request.query as { forceRefresh?: string }
        const shouldForceRefresh = forceRefresh === 'true'

        const cacheKey = `stream:${videoId}`

        const result = await getOrSet(
            fastify,
            cacheKey,
            () => getStreamUrl(videoId),
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