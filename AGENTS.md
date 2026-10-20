# Cosmo — Agent Instructions

## Project Overview
Cosmo is an AI-powered music streaming app that streams audio via YouTube/InnerTube, abstracted from the user. It features native mobile controls, real-time AI context generation, and on-device analytics.

---

## Monorepo Structure
```
Cosmo/
  apps/
    api/        ← Fastify + TypeScript backend (Node.js)
    mobile/     ← React Native + Expo (Android-first)
  packages/
    types/      ← Shared TypeScript interfaces
  AGENTS.md
  README.md
```

---

## Apps Overview

### apps/api — Backend
- **Runtime:** Node.js + TypeScript
- **Framework:** Fastify (NOT Express)
- **Logger:** Pino (already configured, use `fastify.log` not `console.log`)
- **Error tracking:** Sentry (already wired, do not remove)
- **Entry point:** `src/server.ts`

#### Folder structure
```
src/
  config/        ← Runtime configuration (env.ts)
  plugins/       ← Fastify plugins (cache.ts, queue.ts, supabase.ts)
  routes/        ← HTTP route handlers
  services/      ← Business logic (no HTTP knowledge here)
  workers/       ← BullMQ background job processors
```

#### Rules for api/
- Never put business logic inside route handlers — delegate to `services/`
- Never call `console.log` — always use `fastify.log.info/debug/error`
- Every new route file must be registered in `server.ts` with a prefix
- Every Fastify plugin must use `fastify-plugin` (`fp()`) wrapper
- New env vars must be added to `.env.example` with blank values
- TypeScript strict mode is on — no `any` types without a comment explaining why

#### Environment variables (apps/api/.env)
```
NODE_ENV
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
REDIS_WORKER_URL          ← Upstash Redis TCP URL (rediss://) for BullMQ (NOT the REST URL)
GEMINI_API_KEY
SENTRY_DSN                ← optional; Sentry init is skipped when unset
SENTRY_TRACES_SAMPLE_RATE ← optional; defaults 0.1 prod, 1.0 dev
SENTRY_PROFILES_SAMPLE_RATE ← optional; defaults 0.1 prod, 1.0 dev
```

#### Critical architectural rules
- **NEVER** store YouTube stream URLs (`.googlevideo.com`, `.m3u8`) in Supabase
- The mobile app resolves stream URLs **on-device** via InnerTube first (residential IPs avoid bot checks). `GET /stream/:videoId` is the **server fallback**. Do not remove or refactor the on-device path.
- **ALWAYS** use `REDIS_WORKER_URL` (Upstash Redis TCP, `rediss://`) for BullMQ
- **ALWAYS** use `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (HTTP) for caching via `@upstash/redis` — never for BullMQ
- Cache keys follow pattern: `stream:{quality}:{videoId}`, `context:{videoId}`, `lyrics:{title}:{artist}`
- Stream URL TTL: 14400 seconds (4 hours)
- Context card TTL: 604800 seconds (7 days)
- Lyrics TTL: 604800 seconds (7 days)
- Trending TTL: 3600 seconds (1 hour)

---

### apps/mobile — React Native App
- **Framework:** Expo (bare workflow, NOT Expo Go)
- **Language:** TypeScript
- **Audio:** react-native-track-player (RNTP)
- **State:** Zustand (`src/store/playerStore.ts`)
- **Server state:** TanStack React Query
- **Local storage:** react-native-mmkv (NOT AsyncStorage for high-frequency writes)
- **HTTP client:** Axios with JWT interceptor (`src/services/api.ts`)
- **Lists:** FlashList from @shopify/flash-list (NOT FlatList)
- **Images:** expo-image (NOT React Native Image)
- **Icons:** Ionicons from @expo/vector-icons (NOT emojis or unicode)
- **Haptics:** expo-haptics on all key interactions
- **Animations:** react-native-reanimated (NOT Animated from react-native)
- **New Architecture:** DISABLED (`newArchEnabled=false` in gradle.properties)

#### Folder structure
```
src/
  screens/       ← Full screen components
  components/    ← Reusable UI components
  store/         ← Zustand stores
  services/      ← API client, stream resolver, crossfade
  hooks/         ← Custom React hooks
  navigation/    ← React Navigation stack
```

#### Rules for mobile/
- Never use `FlatList` — always `FlashList` with `estimatedItemSize`
- Never use `Image` from react-native — always `expo-image`
- Never use emojis or unicode as icons — always `Ionicons`
- Never use `AsyncStorage` for play events or settings — use `react-native-mmkv`
- Never store stream URLs in AsyncStorage or MMKV — they expire, keep in memory only
- Always add haptic feedback to interactive elements
- Always use `Reanimated` for animations, never `Animated` from react-native
- `EXPO_PUBLIC_` prefix is required on all env vars exposed to the app
- API URL must point to Render deployment URL, never localhost in release builds

#### Environment variables (apps/mobile/.env)
```
EXPO_PUBLIC_API_URL        ← Render URL, no trailing slash
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

#### Critical stream resolution flow (on-device first)
```
User taps play
  → check in-memory prefetchedUrls (Zustand) first
  → if miss → resolve on-device via InnerTube (residential IP, most reliable)
  → if on-device fails → GET /stream/:videoId from Fastify (server fallback)
  → Fastify checks Upstash Redis
  → if miss → fetch from InnerTube via youtubei.js
  → cache in Redis 4 hours
  → return to app
  → inject into RNTP via updateMetadataForActiveTrack
  → prefetch next track in background
```

---

## Shared Knowledge

### Tech stack at a glance
| Layer | Technology |
|---|---|
| Mobile | React Native + Expo |
| API | Fastify + TypeScript |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (JWT) |
| Cache | Upstash Redis (HTTP REST client) |
| Queue | BullMQ on Upstash Redis (TCP, `rediss://`) |
| AI | Gemini 2.0 Flash |
| Audio source | YouTube InnerTube via youtubei.js (server) / direct InnerTube API (mobile) |
| Monitoring | Sentry |
| Deployment | Render free tier (API) — service sleeps after ~15 min idle |

### Database schema (Supabase)
```
profiles          → links to auth.users
tracks            → video_id, title, artist, duration_ms, thumbnail_url,
                    offline_storage_path (nullable), offline_codec (nullable)
user_downloads    → user_id, track_id, status, downloaded_at
user_likes        → user_id, track_id, created_at
playlists         → id, user_id, name, created_at
playlist_tracks   → playlist_id, track_id, position
```

### BullMQ job types
```
context-card   → calls Gemini Flash, caches result in Upstash
download       → ffmpeg audio extraction, uploads to Supabase Storage
notification   → push notifications
```

### API routes
```
GET  /health
GET  /stream/:videoId          ← server fallback stream fetch
GET  /stream/search?q=         ← InnerTube search
DELETE /stream/:videoId/cache  ← invalidate cached URL
POST /context/:videoId         ← trigger context card job
GET  /context/:videoId         ← poll for context card
GET  /trending                 ← trending tracks India
POST /ai/recommendations       ← Gemini recommendations
POST /ai/playlist              ← mood playlist generation
POST /ai/voice-search          ← Hindi/English voice transcription
GET  /lyrics?title=&artist=    ← LRCLIB synced lyrics
POST /auth/signup
POST /auth/login
POST /likes/:videoId
DELETE /likes/:videoId
```

---

## How to run locally

### API
```bash
cd apps/api
npm install
cp .env.example .env   # fill in values
npx tsx src/server.ts
```

### Mobile
```bash
cd apps/mobile
npm install
# ensure EXPO_PUBLIC_API_URL points to your local IP:8080
npx expo start --host lan
# on phone: open Cosmo dev build, tap server from list
```

### Build release APK
```bash
cd apps/mobile
mkdir -p android/app/src/main/assets
npx react-native bundle --platform android --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
cd android
./gradlew clean
./gradlew assembleRelease
```

---

## Agent behaviour rules

### When modifying existing files
- Read the full file before making changes
- Do not remove existing comments or log statements
- Do not change unrelated code in the same file
- Preserve all existing imports unless explicitly replacing them

### When adding new features
- Follow the existing folder structure strictly
- Add new routes to existing route files if they belong to same domain
- Create new service files for new external API integrations
- Register all new Fastify plugins and routes in `server.ts`
- Add new env vars to both `.env.example` and Render dashboard

### When fixing bugs
- Identify the root cause before changing code
- Fix the specific issue, do not refactor surrounding code
- Confirm the fix with a log statement or test case

### Code style
- Use `async/await` not `.then()` chains
- Use `const` over `let` wherever possible
- TypeScript interfaces over `type` aliases for object shapes
- Explicit return types on all exported functions
- No `eslint-disable` comments without explanation

### Never do these
- Never commit `.env` files
- Never hardcode API keys, tokens, or secrets
- Never store YouTube stream URLs in any database
- Never remove or refactor the mobile on-device InnerTube resolution path
- Never use `FlatList`, `Image` from react-native, or emojis as icons in mobile
- Never use Upstash Redis REST URL for BullMQ connections — use the TCP `rediss://` URL
- Never enable `newArchEnabled=true` until RNTP officially supports it
- Never use `console.log` in the API — use `fastify.log`
