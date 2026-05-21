import fp from 'fastify-plugin';
import { Redis } from '@upstash/redis';
import type { FastifyPluginAsync } from 'fastify';

// Extend FastifyInstance to include the cache property
declare module 'fastify' {
    interface FastifyInstance {
        cache: {
            get: <T>(key: string) => Promise<T | null>;
            set: <T>(key: string, value: T, options?: { ex?: number }) => Promise<void>;
            del: (key: string) => Promise<void>;
            ping: () => Promise<string>;
        }
    }
}

const cachePlugin: FastifyPluginAsync = async (fastify, options) => {
    // Upstash Redis instance
    const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL || '',
        token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });

    fastify.decorate('cache', {
        get: async <T>(key: string): Promise<T | null> => {
            return await redis.get<T>(key);
        },
        set: async <T>(key: string, value: T, options?: { ex?: number }): Promise<void> => {
            if (options?.ex) {
                await redis.set(key, value, { ex: options.ex });
            } else {
                await redis.set(key, value);
            }
        },
        del: async (key: string): Promise<void> => {
            await redis.del(key);
        },
        ping: async (): Promise<string> => {
            return await redis.ping();
        }
    });
};

export default fp(cachePlugin, { name: 'cache-plugin' });
