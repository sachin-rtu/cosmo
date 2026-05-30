import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
        responseMimeType: 'application/json',
    },
})

export interface ContextCard {
    genre: string,
    mood_tags: string[],
    similar_artists: string[],
    fun_fact: string,
    language: string,
    energy_level: 1 | 2 | 3
}

function buildContextPrompt(title: string, artist: string): string {
    return `
        You are a music expert. Analyze this track and return JSON object.

        Track: "${title}"
        Artist: "${artist}"

        Return ONLY this JSON structure, no other text:
        {
            "genre": "string (be specific, e.g. 'Bollywood Pop' not just 'Pop')",
            "mood_tags": ["array", "of", "3-5", "mood", "words"],
            "similar_artists": ["array", "of", "3", "similar", "artists"],
            "fun_fact": "one interesting sentence",
            "language": "string (e.g. 'English', 'Hindi')",
            "energy_level": 1 | 2 | 3
        }
    `
}

export async function generateContextCard(title: string, artist: string): Promise<ContextCard> {
    const prompt = buildContextPrompt(title, artist)

    try {
        const result = await model.generateContent(prompt)
        const text = result.response.text()

        const parsed = JSON.parse(text) as ContextCard
        return parsed
    } catch (err) {
        console.error(`[gemini] Failed to generate context for "${title}" by "${artist}":`, (err as Error).message)
        return {
            genre: 'Unknown',
            mood_tags: [],
            similar_artists: [],
            fun_fact: '',
            language: 'Unknown',
            energy_level: 2,
        }
    }
}

// ── AI Recommendations ──────────────────────────────────────────────────────

const FALLBACK_QUERIES = [
    'Top Hindi Hits 2025',
    'Trending Pop India',
    'Best Bollywood Songs',
    'Chill Lofi Hindi',
    'Punjabi Hits 2025',
]

function buildRecommendationPrompt(topArtists: string[], peakHourLabel: string): string {
    return `
You are a music discovery assistant. A user's listening profile is:

Top artists: ${topArtists.join(', ')}
Peak listening time: ${peakHourLabel}

Suggest exactly 5 short YouTube search queries (max 6 words each) to help them discover similar music they'd love. Mix it up — include some queries for the artists' style, some for the mood/time-of-day, and one wildcard discovery.

Return ONLY a JSON array of 5 strings. Example:
["chill R&B night vibes", "artists like Drake", "lo-fi beats study", "trending hip hop 2025", "smooth jazz evening"]
    `
}

export async function generateSearchQueries(
    topArtists: string[],
    peakHourLabel: string
): Promise<string[]> {
    if (!topArtists.length) {
        return FALLBACK_QUERIES.slice(0, 5)
    }

    try {
        const prompt = buildRecommendationPrompt(topArtists, peakHourLabel)
        const result = await model.generateContent(prompt)
        const text = result.response.text()

        const parsed = JSON.parse(text) as string[]

        if (!Array.isArray(parsed) || parsed.length === 0) {
            return FALLBACK_QUERIES
        }

        return parsed.slice(0, 5)
    } catch (err) {
        console.error('[gemini] Failed to generate search queries:', (err as Error).message)
        return FALLBACK_QUERIES
    }
}

// ── Mood Playlist Generator ──────────────────────────────────────────────────

function buildMoodPrompt(mood: string): string {
    return `
You are an expert music curator. A user provided this mood or activity: "${mood}".

Suggest exactly 3 highly relevant YouTube search queries (max 5 words each) to find music that perfectly matches this vibe.
Make the queries distinct from each other to provide variety (e.g., if the mood is "studying", suggest one lo-fi query, one classical/instrumental query, and one ambient query).

Return ONLY a JSON array of 3 strings. Example:
["lofi chill relax", "calm acoustic vibes", "soothing instrumental piano"]
    `
}

export async function generateMoodQueries(mood: string): Promise<string[]> {
    try {
        const prompt = buildMoodPrompt(mood)
        const result = await model.generateContent(prompt)
        const text = result.response.text()

        const parsed = JSON.parse(text) as string[]

        if (!Array.isArray(parsed) || parsed.length === 0) {
            return ['trending music', 'chill vibes', 'popular hits']
        }

        return parsed.slice(0, 3)
    } catch (err) {
        console.error('[gemini] Failed to generate mood queries:', (err as Error).message)
        return ['trending music', 'chill vibes', 'popular hits']
    }
}

// ── Voice Search ─────────────────────────────────────────────────────────────

export async function transcribeVoiceSearch(
    audioBase64: string,
    mimeType: string
): Promise<{ transcript: string; query: string }> {
    const prompt = `
You are an AI assistant for a music app. 
Listen to the user's voice (it might be in Hindi, English, or a mix/Hinglish). 
1. Transcribe what they said exactly.
2. Formulate the best short YouTube search query for the music they want to hear.

Return ONLY a JSON object: { "transcript": "what they said", "query": "the search query" }.
    `

    try {
        const result = await model.generateContent([
            {
                inlineData: {
                    data: audioBase64,
                    mimeType,
                },
            },
            { text: prompt },
        ])
        
        const text = result.response.text()
        const parsed = JSON.parse(text) as { transcript: string; query: string }

        return {
            transcript: parsed.transcript || '',
            query: parsed.query || parsed.transcript || '',
        }
    } catch (err) {
        console.error('[gemini] Failed to transcribe audio:', (err as Error).message)
        throw new Error('Failed to process voice search')
    }
}