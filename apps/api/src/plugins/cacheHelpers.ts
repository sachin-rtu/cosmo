import type { FastifyInstance } from "fastify"

interface CacheOptions {
    ttlSeconds: number,
    forceRefresh?: boolean
}

export async function getOrSet<T>(
    fastify: FastifyInstance,
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
): Promise<T> {
    if (!options.forceRefresh) {
        try {
            const cached = await fastify.cache.get<T>(key)

            if (cached !== null) {
                fastify.log.debug({ key }, 'cache hit')
                return cached
            }
        } catch (e) {
            fastify.log.warn({ key, err: e }, 'cache get failed, falling back to fetch')
        }
    }

    let fresh: T;
    try {
        fastify.log.debug({ key }, 'cache miss - fetching')
        fresh = await fetcher()
    } catch (fetchErr: any) {
        fastify.log.error({ key, err: fetchErr }, 'fetcher failed to retrieve fresh data');
        const error = new Error(fetchErr.message || 'Upstream service temporarily unavailable') as any;
        error.statusCode = 502; // Bad Gateway
        throw error;
    }

    try {
        await fastify.cache.set(key, fresh, { ex: options.ttlSeconds })
        fastify.log.debug({ key, ttlSeconds: options.ttlSeconds }, 'cache fresh value')
    } catch (e) {
        fastify.log.warn({ key, err: e }, 'cache set failed')
    }

    return fresh
}

export async function invalidate(
    fastify: FastifyInstance,
    key: string,
): Promise<void> {
    await fastify.cache.del(key)
    fastify.log.debug({ key }, 'cache invalidated')
}