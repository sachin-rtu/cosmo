import { create } from 'zustand'
import TrackPlayer, { RepeatMode } from '@rntp/player'
import api from '../services/api'
import { recordPlay } from './insightsStore'

// Track type 
export interface CosmoTrack {
    videoId: string
    mediaId: string
    title: string
    artist: string
    artwork: string
    duration: number
    url: string
    expiresAt?: number
}

// Store shape 
interface PlayerStore {
    // State
    queue: CosmoTrack[]
    originalQueue: CosmoTrack[]
    currentIndex: number
    isPlaying: boolean
    favorites: string[]  // videoIds
    isShuffled: boolean
    repeatMode: 'off' | 'all' | 'one'

    prefetchedUrls: Record<string, { url: string; expiresAt: number }>

    // Actions 
    playQueue: (tracks: CosmoTrack[], startIndex?: number) => Promise<void>
    addToQueue: (track: CosmoTrack) => Promise<void>
    removeFromQueue: (index: number) => void
    reorderQueue: (fromIndex: number, toIndex: number) => void
    toggleFavorite: (videoId: string) => void
    toggleShuffle: () => void
    toggleRepeat: () => void
    skipToNext: () => Promise<void>
    skipToPrev: () => Promise<void>
    resolveAndPlay: (track: CosmoTrack, index: number) => Promise<void>
    prefetchNext: () => Promise<void>
}

// Helper: build a single RNTP media item
function buildMediaItem(track: CosmoTrack, streamUrl: string) {
    return {
        mediaId: track.videoId,
        url: streamUrl,
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artwork,
    }
}

// The Store 
export const usePlayerStore = create<PlayerStore>((set, get) => ({
    queue: [],
    originalQueue: [],
    currentIndex: 0,
    isPlaying: false,
    favorites: [],
    isShuffled: false,
    repeatMode: 'off',
    prefetchedUrls: {},

    toggleFavorite: (videoId) => {
        set(state => ({
            favorites: state.favorites.includes(videoId)
                ? state.favorites.filter(id => id !== videoId)
                : [...state.favorites, videoId]
        }))
    },

    toggleShuffle: () => {
        const { isShuffled, queue, originalQueue, currentIndex } = get()
        if (isShuffled) {
            // Revert to original queue
            const currentTrack = queue[currentIndex]
            const newIndex = Math.max(0, originalQueue.findIndex(t => t.videoId === currentTrack?.videoId))
            set({ isShuffled: false, queue: originalQueue, currentIndex: newIndex })
            get().prefetchNext()
        } else {
            // Shuffle remaining tracks
            const currentTrack = queue[currentIndex]
            const remaining = queue.filter((_, i) => i !== currentIndex)
            // Fisher-Yates shuffle
            for (let i = remaining.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [remaining[i], remaining[j]] = [remaining[j], remaining[i]]
            }
            set({ isShuffled: true, originalQueue: queue, queue: [currentTrack, ...remaining], currentIndex: 0 })
            get().prefetchNext()
        }
    },

    toggleRepeat: () => {
        const { repeatMode } = get()
        const nextMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off'
        set({ repeatMode: nextMode })
        if (nextMode === 'one') {
            TrackPlayer.setRepeatMode(RepeatMode.One)
        } else {
            TrackPlayer.setRepeatMode(RepeatMode.Off)
        }
    },

    // playQueue — initial setup
    playQueue: async (tracks, startIndex = 0) => {
        set({ queue: tracks, originalQueue: tracks, currentIndex: startIndex, prefetchedUrls: {}, isShuffled: false })
        await get().resolveAndPlay(tracks[startIndex], startIndex)
    },

    // resolveAndPlay 
    resolveAndPlay: async (track, index) => {
        const { prefetchedUrls, queue, currentIndex } = get()
        const now = Math.floor(Date.now() / 1000)

        let streamUrl: string
        const prefetched = prefetchedUrls[track.videoId]
        const isStillValid = prefetched && prefetched.expiresAt > now + 3600

        if (isStillValid) {
            streamUrl = prefetched.url
        } else {
            try {
                const response = await api.get(`/stream/${track.videoId}`)
                streamUrl = response.data.url

                set(state => ({
                    prefetchedUrls: {
                        ...state.prefetchedUrls,
                        [track.videoId]: {
                            url: streamUrl,
                            expiresAt: response.data.expiresAt,
                        }
                    }
                }))
            } catch (error) {
                console.error("Failed to resolve stream for", track.title)
                return // skip if we can't get a URL
            }
        }

        // If we are skipping to the very next track, and it was already added to the native queue
        // by prefetchNext, we can just smoothly skip to it!
        if (index === currentIndex + 1) {
            const nativeQueue = await TrackPlayer.getQueue()
            // Check if the next item is in the native queue
            if (nativeQueue.length > 1 && nativeQueue[1]?.mediaId === track.videoId) {
                TrackPlayer.skipToNext()
                TrackPlayer.play()
                set({ currentIndex: index, isPlaying: true })
                recordPlay(track)
                get().prefetchNext()
                return
            }
        }

        // Otherwise, reset the native queue with just this track
        TrackPlayer.setMediaItems([{
            mediaId: track.videoId,
            url: streamUrl,
            title: track.title,
            artist: track.artist,
            artworkUrl: track.artwork,
        }])
        TrackPlayer.play()
        set({ currentIndex: index, isPlaying: true })
        recordPlay(track)

        // Prefetch next track's URL in background
        get().prefetchNext()
    },

    // prefetchNext — fetches URL and appends the next item to RNTP queue for gapless playback
    prefetchNext: async () => {
        const { queue, currentIndex, prefetchedUrls } = get()
        const nextIndex = currentIndex + 1
        const nextTrack = queue[nextIndex]
        if (!nextTrack) return

        const now = Math.floor(Date.now() / 1000)
        let streamUrl = ''

        const already = prefetchedUrls[nextTrack.videoId]
        if (already && already.expiresAt > now + 3600) {
            streamUrl = already.url
        } else {
            try {
                const response = await api.get(`/stream/${nextTrack.videoId}`)
                streamUrl = response.data.url

                set(state => ({
                    prefetchedUrls: {
                        ...state.prefetchedUrls,
                        [nextTrack.videoId]: {
                            url: streamUrl,
                            expiresAt: response.data.expiresAt,
                        }
                    }
                }))
            } catch {
                return // silent fail on prefetch
            }
        }

        // Add to native queue so ExoPlayer can prebuffer it
        const nativeQueue = await TrackPlayer.getQueue()
        // Ensure we don't add duplicates if it's already there
        if (!nativeQueue.some(t => t.mediaId === nextTrack.videoId)) {
            await TrackPlayer.addMediaItem({
                mediaId: nextTrack.videoId,
                url: streamUrl,
                title: nextTrack.title,
                artist: nextTrack.artist,
                artworkUrl: nextTrack.artwork,
            })
        }
    },

    // skipToNext 
    skipToNext: async () => {
        const { queue, currentIndex, repeatMode } = get()
        let nextIndex = currentIndex + 1

        if (nextIndex >= queue.length) {
            if (repeatMode === 'all') {
                nextIndex = 0
            } else {
                return // stop at end of queue
            }
        }

        await get().resolveAndPlay(queue[nextIndex], nextIndex)
    },

    // skipToPrev
    skipToPrev: async () => {
        const { queue, currentIndex, repeatMode } = get()
        let prevIndex = currentIndex - 1
        
        if (prevIndex < 0) {
            if (repeatMode === 'all') {
                prevIndex = queue.length - 1
            } else {
                return // stop at start of queue
            }
        }

        await get().resolveAndPlay(queue[prevIndex], prevIndex)
    },

    // addToQueue — append a track to the end of the queue
    addToQueue: async (track) => {
        const { queue } = get()

        // Don't add duplicates
        if (queue.some(t => t.videoId === track.videoId)) return

        const newQueue = [...queue, track]
        set({ queue: newQueue })

        // Add to native player queue
        TrackPlayer.addMediaItem(buildMediaItem(track, ''))

        // Prefetch the stream URL for this track in the background
        try {
            const response = await api.get(`/stream/${track.videoId}`)
            const streamUrl = response.data.url

            set(state => ({
                prefetchedUrls: {
                    ...state.prefetchedUrls,
                    [track.videoId]: {
                        url: streamUrl,
                        expiresAt: response.data.expiresAt,
                    }
                }
            }))

            // Update the native queue item with the resolved URL
            const idx = get().queue.findIndex(t => t.videoId === track.videoId)
            if (idx >= 0) {
                TrackPlayer.replaceMediaItem(idx, buildMediaItem(track, streamUrl))
            }
        } catch {
            // Silent fail — URL will be resolved when the track plays
        }
    },

    // removeFromQueue — remove a track by index (cannot remove currently playing)
    removeFromQueue: (index) => {
        const { queue, currentIndex } = get()
        if (index === currentIndex || index < 0 || index >= queue.length) return

        const newQueue = queue.filter((_, i) => i !== index)
        let newIndex = currentIndex

        // If we removed a track before the current one, shift index back
        if (index < currentIndex) {
            newIndex = currentIndex - 1
        }

        set({ queue: newQueue, currentIndex: newIndex })
        get().prefetchNext()
    },

    // reorderQueue — move a track from one position to another
    reorderQueue: (fromIndex, toIndex) => {
        const { queue, currentIndex } = get()
        if (fromIndex === toIndex) return
        if (fromIndex < 0 || fromIndex >= queue.length) return
        if (toIndex < 0 || toIndex >= queue.length) return

        const newQueue = [...queue]
        const [moved] = newQueue.splice(fromIndex, 1)
        newQueue.splice(toIndex, 0, moved)

        // Adjust currentIndex to follow the currently playing track
        let newIndex = currentIndex
        if (fromIndex === currentIndex) {
            // We moved the currently playing track
            newIndex = toIndex
        } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
            // Moved a track from before current to after — current shifts back
            newIndex = currentIndex - 1
        } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
            // Moved a track from after current to before — current shifts forward
            newIndex = currentIndex + 1
        }

        set({ queue: newQueue, currentIndex: newIndex })
        get().prefetchNext()
    },
}))