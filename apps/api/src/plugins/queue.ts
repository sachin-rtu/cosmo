import fp from 'fastify-plugin'
import { Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { getBullConnection } from '../config/redis'

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
    const queue = new Queue('cosmo-jobs', {
        connection: {
            ...getBullConnection(),
            lazyConnect: true,
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

    // Log once when the connection is live
    queue.on('ioredis:close', () => {
        fastify.log.warn('BullMQ queue: Redis connection closed')
    })

    // Suppress noisy ioredis connection errors — never crash
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