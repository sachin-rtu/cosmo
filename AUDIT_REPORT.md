# Cosmo — Full Repo Audit Report

> **Audit date:** 2026-10-18  
> **Scope:** `apps/api`, `apps/mobile`, repo root  
> **Context:** API migrating from Railway (expired) → Render free tier; BullMQ moving to Upstash Redis TCP; mobile ships as release APK.

---

## 1. DEPLOYMENT BLOCKERS (API)

### 1.1 Port and Host Binding

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| ✅ OK | server.ts | 105–106 | Port reads `process.env.PORT` with fallback `8080`; host is `0.0.0.0` — both are correct for Render. | No action needed. |

### 1.2 Environment Variable Inventory

Every `process.env.X` reference in `apps/api/src/`:

| Variable | File(s) | In `.env.example`? | Status |
|----------|---------|---------------------|--------|
| `SENTRY_DSN` | server.ts:37 | ✅ Yes | OK |
| `NODE_ENV` | server.ts:55 | ❌ No | Low — standard, but add to `.env.example` for clarity |
| `PORT` | server.ts:105 | ✅ Yes | OK |
| `REDIS_WORKER_URL` | queue.ts:25, contextWorker.ts:14 | ✅ Yes | ⚠️ See §1.2.1 |
| `UPSTASH_REDIS_REST_URL` | cache.ts:20, contextWorker.ts:9 | ✅ Yes | OK |
| `UPSTASH_REDIS_REST_TOKEN` | cache.ts:21, contextWorker.ts:10 | ✅ Yes | OK |
| `SUPABASE_URL` | supabase.ts:3 | ✅ Yes | OK |
| `SUPABASE_SERVICE_ROLE_KEY` | supabase.ts:4 | ✅ Yes | OK |
| `GEMINI_API_KEY` | geminiService.ts:4 | ✅ Yes | OK |
| `SUPABASE_ANON_KEY` | — | Listed in `.env.example` | ⚠️ Declared but never referenced in code — dead entry |

#### 1.2.1 render.yaml env var mismatch

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **Blocker** | render.yaml | 9–17 | `render.yaml` declares only 4 env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `REDIS_URL`. Missing: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_WORKER_URL`, `SENTRY_DSN`, `PORT`. Also names the Redis var `REDIS_URL` but code reads `REDIS_WORKER_URL` — **name mismatch will crash on startup** (`new URL(undefined)` throws). | Update `render.yaml` to list all 8 vars with correct names, or set them via Render dashboard. |

### 1.3 Runtime Dependencies

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **Blocker** | package.json | 26–29 | `tsx` and `typescript` are in `devDependencies`. The start command is `npx tsx src/server.ts`. **Render runs `npm install --production` by default** — `tsx` will not be installed, server cannot start. | Move `tsx` to `dependencies`, or set the Render env var `NPM_CONFIG_PRODUCTION=false`, or change start command to pre-compile with `tsc` and run `node dist/server.js`. |
| Medium | package.json | 26–29 | `pino` and `fastify-plugin` are imported directly (logger.ts:1, queue.ts:1, cache.ts:1) but are only transitive deps of `fastify` and `@fastify/cors`. A major version bump could break the implicit resolution. | Add `pino` and `fastify-plugin` to `dependencies` explicitly. |

### 1.4 External Binary / Runtime Requirements

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **Blocker** | streamServices.ts | 36–50 | Strategy 1 (`getStreamUrlWithYtDlp`) requires a `yt-dlp` binary. Code checks for `yt-dlp_linux` in the project dir or `which yt-dlp`. **Render free tier does not provide Python or `yt-dlp`**. The `render.yaml` buildCommand runs `pip install yt-dlp` but Render's Node environment may not have `pip` available. The `nixpacks.toml` is a Railway artifact — Render does not use nixpacks. | Ensure `yt-dlp` is installed via Render's build command (`pip install yt-dlp` requires Python runtime). Alternatively, rely on the fallback strategies (youtubei.js, Piped, Cobalt, play-dl) and remove the yt-dlp dependency entirely. |
| **Blocker** | yt-dlp_linux | — | A **36 MB** standalone Linux binary is committed to git. This bloats the repo, slows clones, and is platform-specific. | Remove from git (`git rm`), add `yt-dlp_linux` to `.gitignore`, install at build time via `pip install yt-dlp` or download in the Render build command. |
| Medium | streamServices.ts | 3 | `youtube-dl-exec` npm package is listed as a dependency — this downloads a bundled `yt-dlp` binary on `npm install`. May or may not work on Render. | Test whether `youtube-dl-exec` auto-downloads a working binary on Render's environment. If not, remove the dependency. |

**What the server environment needs:** Node.js 18+, npm, and optionally Python 3 + `yt-dlp` (for Strategy 1). No cookies, `po_token`, or other auth files are required — `youtubei.js` uses `generate_session_locally: true`.

### 1.5 Deployment Config Files

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Low | nixpacks.toml (root) | — | Railway-specific config — Render ignores it. Harmless but confusing. | Delete or document as legacy. |
| Low | nixpacks.toml (api) | — | Same — duplicate Railway artifact inside `apps/api`. | Delete. |
| Low | Procfile | 1 | `web: npm start` — Heroku/Railway format. Render uses `render.yaml` or dashboard config. Harmless. | Can keep, but don't rely on it for Render. |

### 1.6 Large / Generated Files Committed to Git

| Severity | File | Size | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **Blocker** | `apps/api/yt-dlp_linux` | 36 MB | Binary committed to git; bloats repo permanently (even after removal, stays in history). | `git rm apps/api/yt-dlp_linux`, add to `.gitignore`, consider `git filter-branch` or BFG to purge from history. |
| Medium | `apps/api/yt-dlp` | 0 B | Empty file tracked in git — likely a leftover. | `git rm apps/api/yt-dlp`. |
| Medium | `apps/api/test-*.js` (10 files) | ~5 KB total | Scratch test scripts committed to git. Root `.gitignore` has `test*.ts` but **not `test*.js`** — the JS files slip through. | Add `test-*.js` to `apps/api/.gitignore`, then `git rm` them. |

### 1.7 Cold Start / Sleep Resilience

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **High** | streamServices.ts | 20–33 | `innertubePromise` is an in-memory singleton. When Render free tier sleeps after 15 min of inactivity, the process is killed. On cold start, InnerTube must re-initialize (~2–5 sec). First stream request will be slow. | Acceptable but document the expected latency. Consider a `/health` endpoint that pre-warms InnerTube. |
| **High** | contextWorker.ts | 13–48 | The BullMQ Worker establishes a persistent TCP connection to Redis. When Render sleeps, the connection dies. On wake-up, the worker must reconnect — but there is **no reconnect strategy** configured for the Worker (unlike the Queue in queue.ts:35 which has `retryStrategy`). | Add `retryStrategy` to the Worker's connection options. |
| Medium | streamServices.ts | 116–118 | `cachedPipedInstances` (in-memory) is lost on sleep. Next request re-fetches the instance list. Minor latency impact. | Acceptable — the fetch has a 5-second timeout. |

---

## 2. REDIS / BULLMQ

### 2.1 Redis Usage Map

| Module | Redis Client | Connection Type | Config |
|--------|-------------|----------------|--------|
| Cache plugin (cache.ts) | `@upstash/redis` | HTTP REST | `UPSTASH_REDIS_REST_URL` + token — ✅ Correct |
| Context worker cache (contextWorker.ts:8-11) | `@upstash/redis` | HTTP REST | Same as above — ✅ Correct |
| BullMQ Queue (queue.ts) | `ioredis` (via BullMQ) | TCP | `REDIS_WORKER_URL` — ✅ Has `maxRetriesPerRequest: null` |
| BullMQ Worker (contextWorker.ts:38-47) | `ioredis` (via BullMQ) | TCP | `REDIS_WORKER_URL` — ✅ Has `maxRetriesPerRequest: null` |

### 2.2 TLS for Upstash TCP (rediss://)

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **Blocker** | queue.ts, contextWorker.ts | 25–32, 14–47 | Upstash Redis TCP URLs use `rediss://` (TLS). The code parses hostname/port/password from the URL but **never sets `tls: {}`** in the ioredis connection options. BullMQ/ioredis will attempt a plain TCP connection to a TLS-only endpoint and fail with `ECONNRESET` or a handshake error. | Add `tls: {}` to the connection options when the URL protocol is `rediss://`, e.g. `tls: redisUrl.protocol === 'rediss:' ? {} : undefined`. |

### 2.3 Polling / Command Limits

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Medium | contextWorker.ts | — | BullMQ Worker uses `BRPOPLPUSH`/`XREADGROUP` to poll for jobs — this is a blocking command that counts as 1 command per timeout cycle. With Upstash free tier (10K commands/day), an idle worker polling every 5 seconds = ~17K commands/day just from polling. **Exceeds free tier.** | Reduce worker concurrency to 1, increase `drainDelay` / `stalledInterval`, or upgrade Upstash plan. Consider only starting the worker when a job is enqueued (unlikely to work with BullMQ architecture). |
| Low | Cache plugin | — | Each API request makes 1–2 Upstash REST calls (GET + optional SET). At moderate traffic this is fine for free tier (10K/day). | Monitor usage. |

---

## 3. SECURITY

### 3.1 Hardcoded Keys / Secrets

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Medium | innertubeService.ts (mobile) | 77 | `INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'` hardcoded. This is YouTube's **public** InnerTube API key (same for all clients), not a private secret. However, it could be rotated by Google. | Acceptable — this is a well-known public key. Consider extracting to a constant with a comment. |
| ✅ OK | `.env` files | — | No `.env` files are tracked in git. The committed `.env` and `.env.example` in `apps/api` contain blank values. `apps/mobile/.env` has placeholder values. | Verify `apps/mobile/.env` is not committed with real Supabase keys. |

### 3.2 CORS / Auth / Validation / Rate Limiting

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **High** | server.ts | 67 | `cors: { origin: '*' }` — allows any origin. Fine for a mobile-only API, but if the API is publicly accessible, anyone can call it. | Restrict to the mobile app's domain or keep `*` but add rate limiting. |
| **High** | Multiple routes | — | The following routes have **no auth middleware**: `/stream/search`, `/stream/:videoId`, `/trending`, `/ai/recommendations`, `/ai/playlist`, `/ai/voice-search`, `/lyrics`, `/context/:videoId` (GET and POST), `/health`. Any client can call these without a token. | Add `requireAuth` preHandler to routes that should be protected (at minimum: `/ai/*`, `/context/*`). |
| **High** | All routes | — | **No rate limiting** is configured. Anyone can hammer `/stream/:videoId` or `/ai/recommendations` and burn through Gemini API quota or get the server's IP banned by YouTube. | Add `@fastify/rate-limit` with reasonable per-IP limits (e.g., 30 req/min for stream, 10 req/min for AI). |
| Medium | auth.ts | 8 | `request.body as any` — no input validation. Email/password are checked for presence but not format. | Use Fastify JSON schema validation or `zod`. |
| Medium | streamServices.ts | 12–14 | `Platform.shim.eval = async (data) => new Function(data.output)()` — executes arbitrary JavaScript from YouTube's player script. This is required for signature deciphering but is a code-execution risk if YouTube's response is tampered with (MITM). | Acceptable trade-off for youtubei.js functionality. Document the risk. |

### 3.3 Supabase RLS / Service Role Key

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **High** | supabase.ts (api) | 4 | The API uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) for **all** database operations — likes, playlists, profiles. If any route has insufficient auth checks, data from other users can be accessed or modified. The service role key should only be used for admin operations (e.g., signup profile creation). | Create a second Supabase client with `SUPABASE_ANON_KEY` + the user's JWT for user-scoped queries. This lets RLS enforce row-level access. |

---

## 4. BUGS AND CRASH RISKS

### 4.1 Unhandled Errors

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **High** | queue.ts | 25 | `new URL(process.env.REDIS_WORKER_URL!)` — if the env var is unset or empty, this throws `TypeError: Invalid URL` at plugin registration time, crashing the server with no useful error message. | Guard with `if (!process.env.REDIS_WORKER_URL) throw new Error('REDIS_WORKER_URL is required')`. |
| **High** | supabase.ts (api) | 3–4 | `process.env.SUPABASE_URL!` and `process.env.SUPABASE_SERVICE_ROLE_KEY!` — non-null assertions. If unset, `createClient` receives `undefined` and may throw cryptic errors later. | Validate at startup. |
| **High** | geminiService.ts | 4 | `process.env.GEMINI_API_KEY!` — same issue. If unset, every AI call fails. | Validate at startup. |
| Medium | stream.ts (route) | 14 | `searchTracks(q)` is called without `try/catch` — if InnerTube throws, the global error handler returns 500. Should return a friendlier error. | Wrap in try/catch, return 502 with "Search temporarily unavailable". |
| Medium | stream.ts (route) | 45–48 | Cache invalidation endpoint uses key pattern `stream:${videoId}` but the stream route caches with `stream:${quality}:${videoId}`. The DELETE endpoint will **never invalidate the actual cached key**. | Use `stream:high:${videoId}` and `stream:low:${videoId}`, or invalidate both. |
| Medium | lyrics.ts | 3 | `import { Client } from 'lrclib-api'` but the type declaration (lrclib-api.d.ts) exports `LrcLib`, not `Client`. The `@ts-ignore` hides potential runtime errors. | Fix the type declaration to match the actual export. |

### 4.2 Timers Without Cleanup

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Low | crossfadeService.ts | 4–34 | Module-level `crossfadeInterval` — properly managed with `startCrossfade`/`stopCrossfade`. | ✅ OK |
| ✅ OK | NowPlayingScreen.tsx | 110–126 | Sleep timer polling interval has `return () => clearInterval(interval)` cleanup. | ✅ OK |

### 4.3 TypeScript Compilation

| App | Result |
|-----|--------|
| `apps/api` | ✅ `npx tsc --noEmit` — **0 errors** |
| `apps/mobile` | ✅ `npx tsc --noEmit` — **0 errors** |

### 4.4 Logger Violation

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Low | streamServices.ts, geminiService.ts, trendingService.ts | Multiple | Services use a standalone `logger` (pino) instead of `fastify.log`. This bypasses Fastify's request-scoped logging and Sentry integration. | Pass `fastify.log` to services, or use the standalone logger consistently (current approach works but loses request context). |

---

## 5. MOBILE RELEASE RISKS

### 5.1 API URL Configuration

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **Blocker** | apps/mobile/.env | 1 | `EXPO_PUBLIC_API_URL=https://cosmo-production-943a.up.railway.app` — points to the **expired Railway deployment**. All API calls will fail. | Update to the new Render URL before building the release APK. |
| Medium | apps/mobile/.env | 2–3 | `EXPO_PUBLIC_SUPABASE_URL=your_supabase_url` and `EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key` — placeholder values. Auth and data will not work. | Set real values. |

### 5.2 Direct InnerTube Calls from Mobile

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **High** | innertubeService.ts (mobile) | All | The mobile app calls YouTube's InnerTube API **directly from the device** as its primary stream resolution strategy. This violates the AGENTS.md rule "NEVER call InnerTube from the mobile app — always via Fastify backend." However, the rationale is documented: residential IPs bypass bot detection better than datacenter IPs. | Architectural decision — intentional deviation from original rule. Document the trade-off. If YouTube starts blocking mobile IPs, the server fallback exists in playerStore.ts:26. |

### 5.3 Release Build Config

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Medium | apps/mobile/android/ | — | The `android/` directory does **not exist** in the repo. It must be generated via `npx expo prebuild` before building. This is normal for Expo managed workflow but means gradle.properties, signing config, and newArchEnabled settings cannot be audited. | Run `npx expo prebuild` and verify `gradle.properties` has `newArchEnabled=false`, and a signing config is set up for release builds. |
| Low | app.json | 22–26 | Permissions include `RECORD_AUDIO` (for voice search) and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. These are correct and expected. | ✅ OK |

### 5.4 Anti-Pattern Violations

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Medium | NowPlayingScreen.tsx | 5, 810 | Uses `FlatList` from `react-native` instead of `FlashList`. | Replace with `FlashList` + `estimatedItemSize`. |
| Low | supabase.ts (mobile) | 2 | Uses `AsyncStorage` for Supabase auth session persistence. AGENTS.md says to avoid AsyncStorage, but this is the Supabase SDK's required storage adapter — no MMKV adapter exists. | Acceptable — only used for auth session, not high-frequency writes. |
| Low | navigation/index.tsx | 6 | Uses `Feather` icons from `@expo/vector-icons/Feather` instead of `Ionicons`. AGENTS.md specifies Ionicons. Some screens use Feather, others use Ionicons — inconsistent. | Standardize on Ionicons. |

### 5.5 API Timeout / Cold Start Behavior

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| **High** | api.ts (mobile) | 6 | Axios `timeout: 15000` (15 sec). Render free tier cold start can take 30–60 seconds. First API call after sleep will **always time out** and show an error. | Increase timeout to 60s, or add retry logic with exponential backoff, or implement a "waking up server" loading state. |
| Medium | playerStore.ts | 209–212 | When stream resolution fails, user sees `Alert.alert("Playback Error", ...)` — a blocking dialog. If the API is cold-starting, every tap results in an intrusive alert. | Show a non-blocking toast or inline error instead. Consider automatic retry. |

---

## 6. DEMO READINESS

### 6.1 First Launch / Fresh User Experience

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Medium | HomeScreen.tsx | 47–72 | On first launch: "Recently Played" section is empty (expected), "For You" calls `/ai/recommendations` with hardcoded fallback artists `['Taylor Swift', 'The Weeknd', 'Arijit Singh']` — this works but shows generic results. "Trending" fetches from API — will fail if API is cold/down. | Add skeleton loaders (✅ already have `TrackCardSkeleton`) and empty states for when trending fails. |
| Medium | — | — | The Onboarding screen collects preferred artists, then the home screen uses them. If the user skips or picks obscure artists, recommendations may be poor. | Acceptable — Gemini fallback queries handle this. |
| Low | — | — | No offline / no-network fallback. If the device has no internet, the app shows loading spinners forever or error alerts. | Add a network status banner and offline empty states. |

### 6.2 Visual Issues

| Severity | File | Line | What is wrong | Suggested fix |
|----------|------|------|---------------|---------------|
| Low | NowPlayingScreen.tsx | — | At 1445 lines / 54 KB, this is a very large single component. Not a visual issue per se, but increases risk of render performance issues. | Consider splitting into sub-components. |

---

## Top 10 Prioritized Fixes

> Ordered by what blocks deployment first.

| # | Severity | Area | Fix |
|---|----------|------|-----|
| **1** | **Blocker** | API Deploy | Move `tsx` from `devDependencies` → `dependencies` in `apps/api/package.json` (or set `NPM_CONFIG_PRODUCTION=false` on Render). Without this, the server cannot start. |
| **2** | **Blocker** | API Deploy | Add **TLS config** (`tls: {}`) to BullMQ connection options in `queue.ts` and `contextWorker.ts` for Upstash `rediss://` URLs. Without this, BullMQ cannot connect. |
| **3** | **Blocker** | API Deploy | Fix `render.yaml` env var names — rename `REDIS_URL` → `REDIS_WORKER_URL` and add all missing vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`). |
| **4** | **Blocker** | Mobile | Update `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` from expired Railway URL to new Render URL. Set real Supabase values. |
| **5** | **Blocker** | Repo Size | Remove `yt-dlp_linux` (36 MB binary) from git. Add to `.gitignore`. Purge from history with BFG or `git filter-repo`. |
| **6** | **High** | API Stability | Add startup validation for all required env vars (`REDIS_WORKER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`). Fail fast with clear messages. |
| **7** | **High** | Security | Add `@fastify/rate-limit` to protect `/stream/*`, `/ai/*`, and `/auth/*` routes from abuse. |
| **8** | **High** | Mobile UX | Increase Axios timeout from 15s → 60s to survive Render free-tier cold starts. Add retry logic or "server is waking up" UI state. |
| **9** | **High** | Cold Start | Add `retryStrategy` to the BullMQ Worker connection in `contextWorker.ts` to handle reconnection after Render sleep. |
| **10** | **High** | Bug | Fix cache key mismatch in `stream.ts`: DELETE endpoint invalidates `stream:${videoId}` but GET caches as `stream:${quality}:${videoId}`. Invalidation is silently ineffective. |
