import * as FileSystem from 'expo-file-system'
import { CosmoTrack } from '../store/playerStore'
import { useDownloadStore } from '../store/downloadStore'
import { resolveStreamClientSide } from './innertubeService'
import api from './api'
import { Alert } from 'react-native'

// @ts-expect-error - documentDirectory is a valid property but types are missing in this expo-file-system version
const DOWNLOADS_DIR = `${FileSystem.documentDirectory}downloads/`

async function ensureDirExists() {
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR)
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true })
    }
}

export async function downloadTrack(track: CosmoTrack) {
    const { setDownloadProgress, setDownloadStatus, addDownload } = useDownloadStore.getState()
    
    try {
        setDownloadStatus(track.videoId, 'downloading')
        await ensureDirExists()

        let streamUrl: string
        try {
            const result = await resolveStreamClientSide(track.videoId)
            streamUrl = result.url
        } catch (e: any) {
            const res = await api.get(`/stream/${track.videoId}`)
            streamUrl = res.data.url
        }

        if (!streamUrl) throw new Error("Could not resolve stream URL")

        const filename = `${track.videoId}.m4a`
        const localUri = `${DOWNLOADS_DIR}${filename}`

        const downloadResumable = FileSystem.createDownloadResumable(
            streamUrl,
            localUri,
            {},
            (downloadProgress) => {
                const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
                setDownloadProgress(track.videoId, progress)
            }
        )

        const result = await downloadResumable.downloadAsync()

        if (!result || result.status !== 200) {
            throw new Error(`Download failed with status ${result?.status}`)
        }

        addDownload({
            ...track,
            downloadedAt: Date.now(),
            localFilename: filename
        })
        
        setDownloadStatus(track.videoId, 'completed')

    } catch (error: any) {
        console.error(`Download error for ${track.videoId}:`, error)
        setDownloadStatus(track.videoId, 'error')
        Alert.alert('Download Failed', error.message)
    }
}

export async function removeLocalDownload(videoId: string) {
    const { removeDownload, downloads } = useDownloadStore.getState()
    const track = downloads[videoId]
    if (track) {
        const localUri = `${DOWNLOADS_DIR}${track.localFilename}`
        try {
            await FileSystem.deleteAsync(localUri, { idempotent: true })
        } catch (e) {}
        removeDownload(videoId)
    }
}

export function getLocalFileUri(videoId: string): string | null {
    const { downloads } = useDownloadStore.getState()
    const track = downloads[videoId]
    if (track) {
        return `${DOWNLOADS_DIR}${track.localFilename}`
    }
    return null
}
