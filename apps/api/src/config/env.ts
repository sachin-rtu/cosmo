/**
 * Environment variable validation.
 * Imported immediately after 'dotenv/config' in server.ts — before any module
 * that reads process.env at import time.
 *
 * Throws a single error listing every missing required variable.
 * Never logs values.
 */

const REQUIRED_VARS = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'REDIS_WORKER_URL',
] as const;

const missing: string[] = [];

for (const name of REQUIRED_VARS) {
    if (!process.env[name]) {
        missing.push(name);
    }
}

// REDIS_WORKER_URL must be a TCP Redis URL, not the Upstash REST URL
const redisWorkerUrl = process.env.REDIS_WORKER_URL;
if (redisWorkerUrl && !redisWorkerUrl.startsWith('redis://') && !redisWorkerUrl.startsWith('rediss://')) {
    missing.push('REDIS_WORKER_URL (must start with redis:// or rediss://)');
}

if (missing.length > 0) {
    throw new Error(
        `Missing or invalid environment variables:\n  - ${missing.join('\n  - ')}`
    );
}

// SENTRY_DSN is optional — Sentry init is skipped when unset
