import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import authRoutes from './routes/auth';
import cachePlugin from './plugins/cache';
import { streamRoutes } from './routes/stream';
import { trendingRoutes } from './routes/trending';
import { recommendationRoutes } from './routes/recommendations';
import { likesRoutes } from './routes/likes';
import { playlistsRoutes } from './routes/playlists';
import queuePlugin from './plugins/queue'
import contextRoutes from './routes/context'
import { startContextWorker } from './workers/contextWorker'

// Intialize Sentry 
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
});

const app = Fastify({
    logger: true,
});

// Register Plugins 
app.register(cachePlugin);
app.register(queuePlugin);
app.register(cors, { origin: '*' });

// Base Routes 
app.get('/health', async (request, reply) => {
    return { status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() };
});

// Register Auth Routes
app.register(authRoutes);

app.register(streamRoutes, { prefix: '/stream' });
app.register(trendingRoutes, { prefix: '/trending' });
app.register(recommendationRoutes, { prefix: '/ai' });
app.register(likesRoutes, { prefix: '/likes' });
app.register(playlistsRoutes, { prefix: '/playlists' });

app.register(contextRoutes, { prefix: '/context' });

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
