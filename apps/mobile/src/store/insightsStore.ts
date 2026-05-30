import { createMMKV } from 'react-native-mmkv'

const storage = createMMKV({ id: 'cosmo-insights' })

// PlayEvent 
export interface PlayEvent {
    videoId: string,
    title: string,
    artist: string,
    artwork: string,
    timestamp: number,
    dayOfWeek: number,
    hour: number,
    completed: boolean
}

// recordPlay 
export function recordPlay(track: {
    videoId: string,
    title: string,
    artist: string,
    artwork: string
}, completed = false) {
    const now = new Date()

    const event: PlayEvent = {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        timestamp: now.getTime(),
        dayOfWeek: now.getDay(),
        hour: now.getHours(),
        completed,
    }

    const existing = storage.getString('play-events')
    const events: PlayEvent[] = existing ? JSON.parse(existing) : []

    events.push(event)

    const trimmed = events.slice(-500)
    storage.set('play-events', JSON.stringify(trimmed))
}

// getInsights
export function getInsights() {
    const existing = storage.getString('play-events')
    const events: PlayEvent[] = existing ? JSON.parse(existing) : []

    if (events.length == 0) return null

    // Top artists
    const artistCounts: Record<string, number> = {}
    events.forEach(e => {
        artistCounts[e.artist] = (artistCounts[e.artist] ?? 0) + 1
    })
    const topArtists = Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([artist]) => artist)

    // Peak listening hour 
    const hourCounts: Record<number, number> = {}
    events.forEach(e => {
        hourCounts[e.hour] = (hourCounts[e.hour] ?? 0) + 1
    })
    const peakHour = Number(
        Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12
    )

    // Total tracks played 
    const totalPlays = events.length

    // Streak days
    const uniqueDays = new Set<string>()
    events.forEach(e => {
        uniqueDays.add(new Date(e.timestamp).toDateString())
    })
    
    const sortedDays = Array.from(uniqueDays).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    let streakDays = 0

    if (sortedDays.length > 0) {
        const today = new Date()
        today.setHours(0,0,0,0)
        
        const latestPlayDate = new Date(sortedDays[0])
        latestPlayDate.setHours(0,0,0,0)
        
        const diffDays = Math.floor((today.getTime() - latestPlayDate.getTime()) / 86400000)
        
        if (diffDays <= 1) {
            streakDays = 1
            let expectedDate = latestPlayDate
            
            for (let i = 1; i < sortedDays.length; i++) {
                expectedDate.setDate(expectedDate.getDate() - 1)
                const checkDate = new Date(sortedDays[i])
                checkDate.setHours(0,0,0,0)
                
                if (checkDate.getTime() === expectedDate.getTime()) {
                    streakDays++
                } else {
                    break
                }
            }
        }
    }

    return {
        topArtists,
        peakHour,
        totalPlays,
        peakHourLabel: `${peakHour % 12 || 12}${peakHour < 12 ? ' AM' : ' PM'}`,
        streakDays,
    }

}

// getRecentlyPlayed — last 20 unique tracks, most recent first
export function getRecentlyPlayed(): PlayEvent[] {
    const existing = storage.getString('play-events')
    const events: PlayEvent[] = existing ? JSON.parse(existing) : []

    // Walk backwards to keep only the most recent play per videoId
    const seen = new Set<string>()
    const unique: PlayEvent[] = []

    for (let i = events.length - 1; i >= 0; i--) {
        if (!seen.has(events[i].videoId)) {
            seen.add(events[i].videoId)
            unique.push(events[i])
        }
        if (unique.length >= 20) break
    }

    return unique // already in most-recent-first order
}