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

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    try {
        const parsed = JSON.parse(text) as ContextCard
        return parsed
    } catch (err) {
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