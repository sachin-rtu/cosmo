import 'dotenv/config';
import './config/env';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

// Intercept noisy youtubei.js logs to prevent rate limiting
const originalWarn = console.warn;
console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('[YOUTUBEJS]')) return;
    originalWarn(...args);
};

const originalInfo = console.info;
console.info = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('[YOUTUBEJS]')) return;
    originalInfo(...args);
};

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import authRoutes from './routes/auth';
import cachePlugin from './plugins/cache';
import { streamRoutes } from './routes/stream';
import { trendingRoutes } from './routes/trending';
import { recommendationRoutes } from './routes/recommendations';
import { likesRoutes } from './routes/likes';
import { playlistsRoutes } from './routes/playlists';
import { lyricsRoutes } from './routes/lyrics';
import queuePlugin from './plugins/queue'
import contextRoutes from './routes/context'
import { startContextWorker } from './workers/contextWorker'

// Intialize Sentry (skipped when SENTRY_DSN is unset)
const isProd = process.env.NODE_ENV === 'production';
const defaultSampleRate = isProd ? 0.1 : 1.0;

if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [nodeProfilingIntegration()],
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '') || defaultSampleRate,
        profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '') || defaultSampleRate,
    });
}

const app = Fastify({
    logger: process.env.NODE_ENV !== 'production'
        ? { transport: { target: 'pino-pretty' } }
        : true,
    trustProxy: true,
});

// Global Error Handler
app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    Sentry.captureException(error);
    
    // Don't leak stack traces to client in production
    reply.status(500).send({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
});

// Global Not Found Handler
app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: 'Not Found', status: 404 });
});

// Register Plugins 
app.register(cachePlugin);
app.register(queuePlugin);
app.register(cors, { origin: '*' });
app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health',
});

// Base Routes 
app.get('/health', async (request, reply) => {
    return { status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() };
});

// Register Auth Routes (tighter rate limit to prevent brute-force)
app.register(authRoutes, {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
});

app.register(streamRoutes, { prefix: '/stream' });
app.register(trendingRoutes, { prefix: '/trending' });
app.register(recommendationRoutes, { prefix: '/ai' });
app.register(likesRoutes, { prefix: '/likes' });
app.register(playlistsRoutes, { prefix: '/playlists' });
app.register(lyricsRoutes, { prefix: '/lyrics' });

app.register(contextRoutes, { prefix: '/context' });

// Graceful Shutdown Handlers
const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Shutting down gracefully...`);
    try {
        await app.close();
        app.log.info('Closed out remaining connections.');
        process.exit(0);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start server function 
const start = async () => {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
        await app.listen({ port, host: '0.0.0.0' });
        app.log.info(`Cosmo API is running!`);

        try {
            const pong = await app.cache.ping()
            app.log.info(`Redis connection test ${pong}`);
        } catch (cacheErr) {
            app.log.warn(`Redis connection test failed (Cache might be down): ${(cacheErr as Error).message}`);
        }

        // Start the BullMQ worker
        startContextWorker();
        app.log.info('Context worker started');

    } catch (err) {
        app.log.error(err);
        Sentry.captureException(err);
        process.exit(1);
    }
};

start();
