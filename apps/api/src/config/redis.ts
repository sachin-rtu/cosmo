/**
 * Shared BullMQ / ioredis connection config.
 *
 * Parses REDIS_WORKER_URL once and returns ioredis-compatible options.
 * Enables TLS when the URL uses the rediss:// scheme (Upstash TCP).
 *
 * Used by plugins/queue.ts (Queue) and workers/contextWorker.ts (Worker).
 * Never logs the URL or password.
 */

import type { RedisOptions } from 'bullmq';

export function getBullConnection(): RedisOptions {
    const url = new URL(process.env.REDIS_WORKER_URL!);

    return {
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
        username: url.username || undefined,
        password: url.password || undefined,
        maxRetriesPerRequest: null,
        tls: url.protocol === 'rediss:' ? {} : undefined,
        retryStrategy: (times: number) => Math.min(times * 500, 10000),
    };
}
