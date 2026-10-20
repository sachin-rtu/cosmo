import type { FastifyInstance } from 'fastify'
import { getOrSet } from '../plugins/cacheHelpers'
import { getTrendingTracks } from '../services/trendingService'

export async function trendingRoutes(fastify: FastifyInstance) {

    fastify.get('/', async (_request, reply) => {
        const cacheKey = 'trending:IN:v2'

        try {
            const tracks = await getOrSet(
                fastify,
                cacheKey,
                () => getTrendingTracks(),
                { ttlSeconds: 3600 } // 1 hour
            )

            return reply.send(tracks)
        } catch (err) {
            fastify.log.error({ err }, 'trending: fetch failed')
            return reply.status(502).send({ error: 'Trending data temporarily unavailable' })
        }
    })
}
