import TrackPlayer from '@rntp/player'
import { usePlayerStore } from '../store/playerStore'

let crossfadeInterval: NodeJS.Timeout | null = null

export const stopCrossfade = async () => {
    if (crossfadeInterval) {
        clearInterval(crossfadeInterval)
        crossfadeInterval = null
        await TrackPlayer.setVolume(1.0)
    }
}

export const startCrossfade = (durationSeconds: number = 5) => {
    if (crossfadeInterval) return // Already running

    const totalSteps = durationSeconds * 10 // 100ms intervals
    let currentStep = 0

    crossfadeInterval = setInterval(async () => {
        currentStep++
        const fadeProgress = currentStep / totalSteps
        
        // Lower the volume gradually
        await TrackPlayer.setVolume(1.0 - fadeProgress)

        if (currentStep >= totalSteps) {
            // Trigger next track via store
            await usePlayerStore.getState().skipToNext()
            
            // Clean up and restore volume
            await stopCrossfade()
        }
    }, 100)
}
