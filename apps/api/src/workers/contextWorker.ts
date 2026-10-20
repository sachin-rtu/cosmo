import { logger } from '../utils/logger'
import { Worker } from 'bullmq'
import { Redis } from '@upstash/redis'
import { generateContextCard } from '../services/geminiService'
import { JOB_NAMES, type ContextJobData } from '../plugins/queue'
import { getBullConnection } from '../config/redis'
// Later move to separate service

const upstash = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export function startContextWorker() {
    logger.info('[contextWorker] Starting worker')

    const worker = new Worker(
        'cosmo-jobs',
        async (job) => {

            // FUTURE — download jobs, notification jobs will share this queue
            if (job.name !== JOB_NAMES.CONTEXT_CARD) return

            const { videoId, title, artist } = job.data as ContextJobData

            logger.info(`[contextWorker] Processing context for: ${title} by ${artist}`)

            const contextCard = await generateContextCard(title, artist)

            const cacheKey = `context:${videoId}`
            await upstash.set(cacheKey, contextCard, { ex: 604800 })

            logger.info(`[contextWorker] ✅ Completed — Context card cached for videoId: ${videoId}`)

            return { success: true, videoId }
        },
        {
            connection: getBullConnection(),
            concurrency: 5,
            drainDelay: 30,
            stalledInterval: 120000,
        }
    )

    worker.on('ready', () => {
        logger.info('[contextWorker] Worker is READY and listening for jobs')
    })

    worker.on('active', (job) => {
        logger.info(`[contextWorker] Job ${job.id} is now active`)
    })

    worker.on('completed', (job) => {
        logger.info(`[contextWorker] Job ${job.id} completed`)
    })

    worker.on('failed', (job, err) => {
        logger.info(`[contextWorker] Job ${job?.id} failed:`, err.message)
    })

    // Never crash on Redis errors
    worker.on('error', (err) => {
        logger.error(`[contextWorker] Worker error:`, err.message)
    })

    // Attempt to confirm connection
    worker.waitUntilReady().then(() => {
        logger.info('[contextWorker] Redis connection confirmed — worker is online')
    }).catch((err) => {
        logger.error('[contextWorker] Failed to connect to Redis:', err.message)
    })

    return worker
}