import { create } from 'zustand'
import api from '../services/api'

export interface LikedTrack {
    video_id: string
    title: string
    artist: string
    artwork: string
    created_at: string
}

interface LikesStore {
    likedIds: Set<string>
    likedTracks: LikedTrack[]
    loading: boolean

    fetchLikes: () => Promise<void>
    toggleLike: (track: { videoId: string; title: string; artist: string; artwork: string }) => Promise<void>
    isLiked: (videoId: string) => boolean
}

export const useLikesStore = create<LikesStore>((set, get) => ({
    likedIds: new Set<string>(),
    likedTracks: [],
    loading: false,

    fetchLikes: async () => {
        set({ loading: true })
        try {
            const { data } = await api.get('/likes')
            const tracks = data as LikedTrack[]
            set({
                likedTracks: tracks,
                likedIds: new Set(tracks.map(t => t.video_id)),
                loading: false,
            })
        } catch {
            set({ loading: false })
        }
    },

    isLiked: (videoId: string) => {
        return get().likedIds.has(videoId)
    },

    toggleLike: async (track) => {
        const { likedIds, likedTracks } = get()
        const wasLiked = likedIds.has(track.videoId)

        // Optimistic update
        if (wasLiked) {
            const newIds = new Set(likedIds)
            newIds.delete(track.videoId)
            set({
                likedIds: newIds,
                likedTracks: likedTracks.filter(t => t.video_id !== track.videoId),
            })
        } else {
            const newIds = new Set(likedIds)
            newIds.add(track.videoId)
            const newTrack: LikedTrack = {
                video_id: track.videoId,
                title: track.title,
                artist: track.artist,
                artwork: track.artwork,
                created_at: new Date().toISOString(),
            }
            set({
                likedIds: newIds,
                likedTracks: [newTrack, ...likedTracks],
            })
        }

        // Sync with backend
        try {
            if (wasLiked) {
                await api.delete(`/likes/${track.videoId}`)
            } else {
                await api.post(`/likes/${track.videoId}`, {
                    title: track.title,
                    artist: track.artist,
                    artwork: track.artwork,
                })
            }
        } catch {
            // Revert on failure
            if (wasLiked) {
                // Re-add
                const revertIds = new Set(get().likedIds)
                revertIds.add(track.videoId)
                const revertTrack: LikedTrack = {
                    video_id: track.videoId,
                    title: track.title,
                    artist: track.artist,
                    artwork: track.artwork,
                    created_at: new Date().toISOString(),
                }
                set({
                    likedIds: revertIds,
                    likedTracks: [revertTrack, ...get().likedTracks],
                })
            } else {
                // Re-remove
                const revertIds = new Set(get().likedIds)
                revertIds.delete(track.videoId)
                set({
                    likedIds: revertIds,
                    likedTracks: get().likedTracks.filter(t => t.video_id !== track.videoId),
                })
            }
        }
    },
}))
