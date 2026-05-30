import type { FastifyInstance } from 'fastify'
import { getOrSet } from '../plugins/cacheHelpers'
import { getRecommendations, buildRecsCacheKey, getMoodPlaylist, getVoiceSearchResults } from '../services/recommendationService'

export async function recommendationRoutes(fastify: FastifyInstance) {

    fastify.post('/recommendations', async (request, reply) => {
        const { topArtists, peakHourLabel } = request.body as {
            topArtists?: string[]
            peakHourLabel?: string
        }

        const artists = Array.isArray(topArtists) ? topArtists : []
        const hour = typeof peakHourLabel === 'string' ? peakHourLabel : '12 PM'

        const cacheKey = buildRecsCacheKey(artists, hour)

        const tracks = await getOrSet(
            fastify,
            cacheKey,
            () => getRecommendations(artists, hour),
            { ttlSeconds: 14400 } // 4 hours
        )

        return reply.send(tracks)
    })

    fastify.post('/playlist', async (request, reply) => {
        const { mood } = request.body as { mood?: string }
        if (!mood || typeof mood !== 'string' || mood.trim().length === 0) {
            return reply.status(400).send({ error: 'Valid mood string is required' })
        }

        const tracks = await getMoodPlaylist(mood)
        return reply.send(tracks)
    })

    fastify.post('/voice-search', async (request, reply) => {
        const { audioBase64, mimeType } = request.body as { audioBase64?: string; mimeType?: string }
        if (!audioBase64 || !mimeType) {
            return reply.status(400).send({ error: 'audioBase64 and mimeType are required' })
        }

        try {
            const result = await getVoiceSearchResults(audioBase64, mimeType)
            return reply.send(result)
        } catch (error: any) {
            fastify.log.error(error)
            return reply.status(500).send({ error: 'Failed to process voice search' })
        }
    })
}
