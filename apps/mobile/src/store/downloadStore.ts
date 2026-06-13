import { create } from 'zustand'
import { createMMKV } from 'react-native-mmkv'
import { CosmoTrack } from './playerStore'

const downloadStorage = createMMKV({ id: 'cosmo-downloads' })

export type DownloadStatus = 'downloading' | 'completed' | 'error'

export interface DownloadedTrack extends CosmoTrack {
    downloadedAt: number
    localFilename: string
}

interface DownloadStore {
    downloads: Record<string, DownloadedTrack>
    activeDownloads: Record<string, { progress: number; status: DownloadStatus }>
    
    addDownload: (track: DownloadedTrack) => void
    removeDownload: (videoId: string) => void
    setDownloadProgress: (videoId: string, progress: number) => void
    setDownloadStatus: (videoId: string, status: DownloadStatus) => void
    isDownloaded: (videoId: string) => boolean
}

const getInitialDownloads = () => {
    const data = downloadStorage.getString('downloads')
    if (data) {
        try {
            return JSON.parse(data)
        } catch (e) {
            return {}
        }
    }
    return {}
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
    downloads: getInitialDownloads(),
    activeDownloads: {},

    addDownload: (track) => {
        set(state => {
            const next = { ...state.downloads, [track.videoId]: track }
            downloadStorage.set('downloads', JSON.stringify(next))
            return { downloads: next }
        })
    },

    removeDownload: (videoId) => {
        set(state => {
            const next = { ...state.downloads }
            delete next[videoId]
            downloadStorage.set('downloads', JSON.stringify(next))
            return { downloads: next }
        })
    },

    setDownloadProgress: (videoId, progress) => {
        set(state => ({
            activeDownloads: {
                ...state.activeDownloads,
                [videoId]: { ...state.activeDownloads[videoId], progress, status: 'downloading' }
            }
        }))
    },

    setDownloadStatus: (videoId, status) => {
        set(state => {
            const current = state.activeDownloads[videoId] || { progress: 0 }
            if (status === 'completed' || status === 'error') {
                const next = { ...state.activeDownloads }
                delete next[videoId]
                return { activeDownloads: next }
            }
            return {
                activeDownloads: {
                    ...state.activeDownloads,
                    [videoId]: { ...current, status }
                }
            }
        })
    },

    isDownloaded: (videoId) => {
        return !!get().downloads[videoId]
    }
}))
