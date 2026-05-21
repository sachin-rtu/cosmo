import fp from 'fastify-plugin'
import { Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'

export interface ContextJobData {
    videoId: string,
    title: string,
    artist: string
}

export const JOB_NAMES = {
    CONTEXT_CARD: 'context-card',
    DOWNLOAD: 'download',
    NOTIF: 'notification',
} as const

// Extend FastifyInstance to include the queue
declare module 'fastify' {
    interface FastifyInstance {
        queue: Queue
    }
}

export default fp(async (fastify: FastifyInstance) => {
    const redisUrl = new URL(process.env.REDIS_WORKER_URL!)

    const queue = new Queue('cosmo-jobs', {
        connection: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port),
            password: redisUrl.password,
            username: redisUrl.username || undefined,
            maxRetriesPerRequest: null,
            lazyConnect: true,
            retryStrategy: (times: number) => {
                if (times > 5) {
                    fastify.log.warn(`BullMQ: giving up reconnect after ${times} attempts`)
                    return null // stop retrying
                }
                return Math.min(times * 1000, 10000)
            },
        },
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    })

    // Suppress noisy ioredis connection errors
    queue.on('error', (err) => {
        fastify.log.warn({ err: err.message }, 'BullMQ queue error (non-fatal)')
    })

    fastify.decorate('queue', queue)

    fastify.addHook('onClose', async () => {
        await queue.close()
        fastify.log.info('BullMQ queue connection closed')
    })

    fastify.log.info('BullMQ queue plugin registered')
}, { name: 'queue-plugin' })