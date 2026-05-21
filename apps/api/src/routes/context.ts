import type { FastifyInstance } from "fastify"
import { JOB_NAMES, type ContextJobData } from '../plugins/queue'

const CONTEXT_CARD_TTL = 604800

export default async function contextRoutes(fastify: FastifyInstance) {
    fastify.post('/:videoId', async (request, reply) => {
        const { videoId } = request.params as { videoId: string }
        const { title, artist } = request.body as {
            title: string,
            artist: string
        }

        if (!title || !artist) {
            return reply.status(400).send({
                error: 'Both "title" and "artist" are required in the request body',
            })
        }

        // Check cache (non-fatal if Redis is down)
        try {
            const cacheKey = `context:${videoId}`
            const cached = await fastify.cache.get(cacheKey)

            if (cached) {
                fastify.log.info({ videoId }, 'context:cache-hit')
                return reply.send({ status: 'ready', data: cached })
            }
        } catch (cacheErr) {
            fastify.log.warn({ videoId, err: cacheErr }, 'context: cache lookup failed, continuing without cache')
        }

        // Enqueue background job
        try {
            const jobData: ContextJobData = { videoId, title, artist }
            await fastify.queue.add(JOB_NAMES.CONTEXT_CARD, jobData)

            fastify.log.info({ videoId }, 'context: job-enqueued')

            return reply.status(202).send({
                status: 'processing',
                message: 'Context card is being generated'
            })
        } catch (queueErr) {
            fastify.log.error({ videoId, err: queueErr }, 'context: failed to enqueue job')
            return reply.status(503).send({
                status: 'error',
                message: 'Job queue is unavailable. Please try again later.',
            })
        }
    })

    // GET /context/:videoId
    fastify.get('/:videoId', async (request, reply) => {
        const { videoId } = request.params as { videoId: string }

        // Check cache (non-fatal if Redis is down)
        try {
            const cacheKey = `context:${videoId}`
            const cached = await fastify.cache.get(cacheKey)

            if (cached) {
                fastify.log.info({ videoId }, 'context:cache-hit')
                return reply.send({ status: 'ready', data: cached })
            }
        } catch (cacheErr) {
            fastify.log.warn({ videoId, err: cacheErr }, 'context: cache lookup failed')
        }

        return reply.status(202).send({ status: 'processing' })
    })
}