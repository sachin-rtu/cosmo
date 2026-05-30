import { generateSearchQueries, generateMoodQueries, transcribeVoiceSearch } from './geminiService'
import { searchTracks } from './streamServices'

export interface RecommendedTrack {
    videoId: string
    title: string
    artist: string
    thumbnail: string | null
    durationMs: number
}

/**
 * Generate 10 mixed recommendations by:
 * 1. Asking Gemini for 5 search queries based on listening profile
 * 2. Fanning out all 5 queries to InnerTube concurrently
 * 3. Deduplicating by videoId
 * 4. Round-robin mixing to ensure variety across queries
 */
export async function getRecommendations(
    topArtists: string[],
    peakHourLabel: string
): Promise<RecommendedTrack[]> {
    // Step 1: Get search queries from Gemini (or fallback)
    const queries = await generateSearchQueries(topArtists, peakHourLabel)

    // Step 2: Fan out — run all searches concurrently
    const searchResults = await Promise.allSettled(
        queries.map(q => searchTracks(q))
    )

    // Collect fulfilled results into per-query buckets
    const buckets: RecommendedTrack[][] = []

    for (const result of searchResults) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
            buckets.push(
                result.value.map(t => ({
                    videoId: t.videoId,
                    title: t.title,
                    artist: t.artist,
                    thumbnail: t.thumbnail,
                    durationMs: t.durationMs,
                }))
            )
        }
    }

    if (buckets.length === 0) {
        return []
    }

    // Step 3: Round-robin mix + dedup
    const seen = new Set<string>()
    const mixed: RecommendedTrack[] = []
    const maxPerBucket = Math.ceil(10 / buckets.length)

    // Track how many we've taken from each bucket
    const indices = new Array(buckets.length).fill(0)

    // Round-robin: take one from each bucket in turn until we have 10
    let round = 0
    while (mixed.length < 10 && round < maxPerBucket) {
        for (let b = 0; b < buckets.length && mixed.length < 10; b++) {
            const idx = indices[b]
            if (idx >= buckets[b].length) continue

            const track = buckets[b][idx]
            indices[b]++

            if (!seen.has(track.videoId)) {
                seen.add(track.videoId)
                mixed.push(track)
            } else {
                // Skip duplicate but try next from same bucket
                while (indices[b] < buckets[b].length) {
                    const next = buckets[b][indices[b]]
                    indices[b]++
                    if (!seen.has(next.videoId)) {
                        seen.add(next.videoId)
                        mixed.push(next)
                        break
                    }
                }
            }
        }
        round++
    }

    return mixed
}

/**
 * Build a stable cache key from the listening profile.
 * Sorting artist names ensures same artists in different order hit the same cache.
 */
export function buildRecsCacheKey(topArtists: string[], peakHourLabel: string): string {
    const artistKey = topArtists
        .map(a => a.toLowerCase().trim())
        .sort()
        .join('|')

    // Simple hash to keep the key short
    let hash = 0
    for (let i = 0; i < artistKey.length; i++) {
        const ch = artistKey.charCodeAt(i)
        hash = ((hash << 5) - hash) + ch
        hash |= 0 // Convert to 32-bit int
    }

    return `recs:${Math.abs(hash).toString(36)}:${peakHourLabel.replace(/\s/g, '')}`
}

/**
 * Generate a playlist based on a natural language mood string.
 */
export async function getMoodPlaylist(mood: string): Promise<RecommendedTrack[]> {
    // 1. Ask Gemini for queries
    const queries = await generateMoodQueries(mood)

    // 2. Fan out searches
    const searchResults = await Promise.allSettled(
        queries.map(q => searchTracks(q))
    )

    const buckets: RecommendedTrack[][] = []
    for (const result of searchResults) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
            buckets.push(
                result.value.map(t => ({
                    videoId: t.videoId,
                    title: t.title,
                    artist: t.artist,
                    thumbnail: t.thumbnail,
                    durationMs: t.durationMs,
                }))
            )
        }
    }

    if (buckets.length === 0) return []

    // 3. Round-robin mix up to 15 tracks
    const seen = new Set<string>()
    const mixed: RecommendedTrack[] = []
    const maxPerBucket = Math.ceil(15 / buckets.length)
    const indices = new Array(buckets.length).fill(0)

    let round = 0
    while (mixed.length < 15 && round < maxPerBucket) {
        for (let b = 0; b < buckets.length && mixed.length < 15; b++) {
            const idx = indices[b]
            if (idx >= buckets[b].length) continue

            const track = buckets[b][idx]
            indices[b]++

            if (!seen.has(track.videoId)) {
                seen.add(track.videoId)
                mixed.push(track)
            } else {
                // Skip duplicate but try next from same bucket
                while (indices[b] < buckets[b].length) {
                    const next = buckets[b][indices[b]]
                    indices[b]++
                    if (!seen.has(next.videoId)) {
                        seen.add(next.videoId)
                        mixed.push(next)
                        break
                    }
                }
            }
        }
        round++
    }

    return mixed
}

/**
 * Handle a voice search payload.
 */
export async function getVoiceSearchResults(
    audioBase64: string,
    mimeType: string
): Promise<{ transcript: string; tracks: RecommendedTrack[] }> {
    // 1. Ask Gemini to transcribe and extract the optimal search query
    const { transcript, query } = await transcribeVoiceSearch(audioBase64, mimeType)

    // 2. Perform the YouTube search using the extracted query
    const searchResults = await searchTracks(query)

    const tracks = searchResults.map(t => ({
        videoId: t.videoId,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail,
        durationMs: t.durationMs,
    }))

    return {
        transcript,
        tracks
    }
}
