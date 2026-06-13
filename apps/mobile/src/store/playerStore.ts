import { create } from 'zustand'
import TrackPlayer, { RepeatMode } from '@rntp/player'
import { createMMKV } from 'react-native-mmkv'
import { Alert } from 'react-native'

const playerStorage = createMMKV({ id: 'cosmo-player-settings' })
import api from '../services/api'
import { recordPlay } from './insightsStore'
import { resolveStreamClientSide } from '../services/innertubeService'
import { stopCrossfade } from '../services/crossfadeService'
import { getLocalFileUri } from '../services/downloadService'

// Helper: resolve stream URL with client-side first, server fallback
async function resolveStreamUrl(videoId: string, quality: 'high' | 'low'): Promise<{ url: string; expiresAt: number }> {
    // Strategy 1: Client-side InnerTube (from phone's residential IP — most reliable)
    try {
        const result = await resolveStreamClientSide(videoId, quality)
        console.log(`[Stream] Client-side resolved ${videoId}`)
        return { url: result.url, expiresAt: result.expiresAt }
    } catch (clientErr: any) {
        console.warn(`[Stream] Client-side failed for ${videoId}:`, clientErr.message)
    }

    // Strategy 2: Server API fallback (Railway — may work via Piped/LBRY cache)
    try {
        const response = await api.get(`/stream/${videoId}?quality=${quality}`)
        console.log(`[Stream] Server resolved ${videoId} (quality: ${quality})`)
        return { url: response.data.url, expiresAt: response.data.expiresAt }
    } catch (serverErr: any) {
        console.error(`[Stream] Server also failed for ${videoId}:`, serverErr.message)
    }

    throw new Error(`All stream strategies failed for ${videoId}`)
}

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

    crossfadeEnabled: boolean
    crossfadeDuration: number

    audioQuality: 'high' | 'low'

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
    
    setCrossfadeEnabled: (enabled: boolean) => void
    setCrossfadeDuration: (duration: number) => void

    setAudioQuality: (quality: 'high' | 'low') => void
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

    crossfadeEnabled: playerStorage.getBoolean('crossfade-enabled') ?? false,
    crossfadeDuration: playerStorage.getNumber('crossfade-duration') ?? 5,
    audioQuality: (playerStorage.getString('audio-quality') as 'high' | 'low') || 'high',

    setCrossfadeEnabled: (enabled) => {
        playerStorage.set('crossfade-enabled', enabled)
        set({ crossfadeEnabled: enabled })
    },
    setCrossfadeDuration: (duration) => {
        playerStorage.set('crossfade-duration', duration)
        set({ crossfadeDuration: duration })
    },
    setAudioQuality: (quality) => {
        playerStorage.set('audio-quality', quality)
        set({ audioQuality: quality })
    },

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
        // Stop any active crossfade interval if user skipped manually
        await stopCrossfade()

        // Immediately update UI so transitions feel instant
        set({ currentIndex: index, isPlaying: true })
        TrackPlayer.pause() // Stop old audio from bleeding while fetching stream

        const { prefetchedUrls, queue } = get()
        const now = Math.floor(Date.now() / 1000)

        let streamUrl: string
        const prefetched = prefetchedUrls[track.videoId]
        const isStillValid = prefetched && prefetched.expiresAt > now + 3600
        const localUri = getLocalFileUri(track.videoId)

        if (localUri) {
            // True Local Download (Offline)
            streamUrl = localUri
            console.log(`[Stream] Playing local file for ${track.videoId}`)
        } else if (isStillValid) {
            streamUrl = prefetched.url
        } else {
            try {
                const { audioQuality } = get()
                const resolved = await resolveStreamUrl(track.videoId, audioQuality)
                streamUrl = resolved.url

                set(state => ({
                    prefetchedUrls: {
                        ...state.prefetchedUrls,
                        [track.videoId]: {
                            url: streamUrl,
                            expiresAt: resolved.expiresAt,
                        }
                    }
                }))
            } catch (error: any) {
                console.error(`Failed to resolve stream for ${track.videoId}:`, error.message)
                Alert.alert("Playback Error", `Could not play ${track.title}.\n\nError: ${error.message}`)
                return // skip if we can't get a URL anywhere
            }
        }

        // If the track was already prefetched into native queue, skip to it directly
        const nativeQueue = await TrackPlayer.getQueue()
        const nativeIdx = nativeQueue.findIndex(t => t.mediaId === track.videoId)
        if (nativeIdx >= 0) {
            await TrackPlayer.skipToIndex(nativeIdx)
            TrackPlayer.play()
            recordPlay(track)
            get().prefetchNext()
            return
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
        recordPlay(track)

        // Prefetch next track's URL in background
        get().prefetchNext()
    },

    // prefetchNext — fetches URL and appends the next item to RNTP queue for gapless playback
    prefetchNext: async () => {
        const { queue, currentIndex, prefetchedUrls } = get()
        const nextIndex = currentIndex + 1
        let nextTrack = queue[nextIndex]

        if (!nextTrack) {
            // Reached the end of the user's queue. Fetch an autoplay recommendation!
            try {
                const currentTrack = queue[currentIndex]
                if (!currentTrack) return;
                
                // Fetch a recommendation based on current song
                const response = await api.post('/ai/recommendations', {
                    topArtists: [currentTrack.artist],
                    peakHourLabel: '12 PM', 
                })
                
                if (response.data && response.data.length > 0) {
                    const rec = response.data[0]
                    nextTrack = {
                        videoId: rec.videoId,
                        mediaId: rec.videoId,
                        title: rec.title,
                        artist: rec.artist,
                        artwork: rec.thumbnail ?? '',
                        duration: rec.durationMs,
                        url: '',
                    }
                    
                    // Add it to our store's queue
                    const newQueue = [...queue, nextTrack]
                    set({ queue: newQueue, originalQueue: newQueue })
                } else {
                    return; // No recommendations found
                }
            } catch (err) {
                console.error('Failed to fetch autoplay recommendation:', err)
                return;
            }
        }

        const now = Math.floor(Date.now() / 1000)
        let streamUrl = ''

        const already = prefetchedUrls[nextTrack.videoId]
        const localUri = getLocalFileUri(nextTrack.videoId)

        if (localUri) {
            streamUrl = localUri
            console.log(`[Stream] Prefetch skipped - playing local file for ${nextTrack.videoId}`)
        } else if (already && already.expiresAt > now + 3600) {
            streamUrl = already.url
        } else {
            try {
                const { audioQuality } = get()
                const resolved = await resolveStreamUrl(nextTrack.videoId, audioQuality)
                streamUrl = resolved.url

                set(state => ({
                    prefetchedUrls: {
                        ...state.prefetchedUrls,
                        [nextTrack.videoId]: {
                            url: streamUrl,
                            expiresAt: resolved.expiresAt,
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
            const { audioQuality } = get()
            const resolved = await resolveStreamUrl(track.videoId, audioQuality)

            set(state => ({
                prefetchedUrls: {
                    ...state.prefetchedUrls,
                    [track.videoId]: {
                        url: resolved.url,
                        expiresAt: resolved.expiresAt,
                    }
                }
            }))

            // Update the native queue item with the resolved URL
            const idx = get().queue.findIndex(t => t.videoId === track.videoId)
            if (idx >= 0) {
                TrackPlayer.replaceMediaItem(idx, buildMediaItem(track, resolved.url))
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