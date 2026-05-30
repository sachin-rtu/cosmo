import { create } from 'zustand'
import api from '../services/api'
import { useAuthStore } from './authStore'

export interface Playlist {
    id: string
    user_id: string
    name: string
    created_at: string
}

export interface PlaylistTrack {
    playlist_id: string
    video_id: string
    title: string
    artist: string
    thumbnail: string
    duration_ms: number
    added_at: string
}

interface PlaylistStore {
    playlists: Playlist[]
    loading: boolean
    error: string | null
    fetchPlaylists: () => Promise<void>
    createPlaylist: (name: string) => Promise<Playlist | null>
    
    // Tracks map keyed by playlist id
    tracksByPlaylist: Record<string, PlaylistTrack[]>
    fetchTracks: (playlistId: string) => Promise<void>
    addTrack: (playlistId: string, track: Omit<PlaylistTrack, 'playlist_id' | 'added_at'>) => Promise<void>
    removeTrack: (playlistId: string, videoId: string) => Promise<void>
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
    playlists: [],
    loading: false,
    error: null,
    tracksByPlaylist: {},

    fetchPlaylists: async () => {
        const session = useAuthStore.getState().session
        if (!session) return

        set({ loading: true, error: null })
        try {
            const { data } = await api.get('/playlists')
            set({ playlists: data })
        } catch (err: any) {
            set({ error: err.message })
        } finally {
            set({ loading: false })
        }
    },

    createPlaylist: async (name: string) => {
        const session = useAuthStore.getState().session
        if (!session) return null

        try {
            const { data } = await api.post('/playlists', { name })
            set((state) => ({
                playlists: [data, ...state.playlists]
            }))
            return data
        } catch (err: any) {
            console.error('Failed to create playlist:', err)
            return null
        }
    },

    fetchTracks: async (playlistId: string) => {
        const session = useAuthStore.getState().session
        if (!session) return

        try {
            const { data } = await api.get(`/playlists/${playlistId}/tracks`)
            set((state) => ({
                tracksByPlaylist: {
                    ...state.tracksByPlaylist,
                    [playlistId]: data
                }
            }))
        } catch (err: any) {
            console.error('Failed to fetch tracks:', err)
        }
    },

    addTrack: async (playlistId: string, track) => {
        const session = useAuthStore.getState().session
        if (!session) return

        // Optimistic update
        const newTrack: PlaylistTrack = {
            ...track,
            playlist_id: playlistId,
            added_at: new Date().toISOString()
        }

        set((state) => {
            const existing = state.tracksByPlaylist[playlistId] || []
            // Prevent duplicates in UI
            if (existing.some(t => t.video_id === track.video_id)) return state
            
            return {
                tracksByPlaylist: {
                    ...state.tracksByPlaylist,
                    [playlistId]: [newTrack, ...existing]
                }
            }
        })

        try {
            await api.post(`/playlists/${playlistId}/tracks`, {
                videoId: track.video_id,
                title: track.title,
                artist: track.artist,
                thumbnail: track.thumbnail,
                durationMs: track.duration_ms
            })
        } catch (err) {
            console.error('Failed to add track API call:', err)
            // Revert on failure
            get().fetchTracks(playlistId)
        }
    },

    removeTrack: async (playlistId: string, videoId: string) => {
        const session = useAuthStore.getState().session
        if (!session) return

        // Optimistic update
        set((state) => {
            const existing = state.tracksByPlaylist[playlistId] || []
            return {
                tracksByPlaylist: {
                    ...state.tracksByPlaylist,
                    [playlistId]: existing.filter(t => t.video_id !== videoId)
                }
            }
        })

        try {
            await api.delete(`/playlists/${playlistId}/tracks/${videoId}`)
        } catch (err) {
            console.error('Failed to remove track API call:', err)
            // Revert on failure
            get().fetchTracks(playlistId)
        }
    }
}))
