import { Worker } from 'bullmq'
import { Redis } from '@upstash/redis'
import { generateContextCard } from '../services/geminiService'
import { JOB_NAMES, type ContextJobData } from '../plugins/queue'
// Later move to separate railway service

const upstash = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export function startContextWorker() {
    const redisUrl = new URL(process.env.REDIS_WORKER_URL!)

    console.log(`[contextWorker] Connecting to Redis at ${redisUrl.hostname}:${redisUrl.port}`)

    const worker = new Worker(
        'cosmo-jobs',
        async (job) => {

            // FUTURE — download jobs, notification jobs will share this queue
            if (job.name !== JOB_NAMES.CONTEXT_CARD) return

            const { videoId, title, artist } = job.data as ContextJobData

            console.log(`[contextWorker] Processing context for: ${title} by ${artist}`)

            const contextCard = await generateContextCard(title, artist)

            const cacheKey = `context:${videoId}`
            await upstash.set(cacheKey, contextCard, { ex: 604800 })

            console.log(`[contextWorker] ✅ Completed — Context card cached for videoId: ${videoId}`)

            return { success: true, videoId }
        },
        {
            connection: {
                host: redisUrl.hostname,
                port: parseInt(redisUrl.port),
                password: redisUrl.password,
                username: redisUrl.username || undefined,
                maxRetriesPerRequest: null,
            },
            concurrency: 5,
        }
    )

    worker.on('ready', () => {
        console.log('[contextWorker] Worker is READY and listening for jobs')
    })

    worker.on('active', (job) => {
        console.log(`[contextWorker] Job ${job.id} is now active`)
    })

    worker.on('completed', (job) => {
        console.log(`[contextWorker] Job ${job.id} completed`)
    })

    worker.on('failed', (job, err) => {
        console.log(`[contextWorker] Job ${job?.id} failed:`, err.message)
    })

    worker.on('error', (err) => {
        console.error(`[contextWorker] Worker error:`, err.message)
    })

    // Attempt to confirm connection
    worker.waitUntilReady().then(() => {
        console.log('[contextWorker] Redis connection confirmed — worker is online')
    }).catch((err) => {
        console.error('[contextWorker] Failed to connect to Redis:', err.message)
    })

    return worker
}