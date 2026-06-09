import TrackPlayer, { Event } from '@rntp/player'
import { usePlayerStore } from '../store/playerStore'

// Register background event handler
// NOTE: Next/Previous just tell RNTP to skip — the actual URL resolution
// happens via the store when skipping
export const PlaybackService = async () => {
    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    
    // Call our store's skip methods so URL resolution/fetching works!
    TrackPlayer.addEventListener(Event.RemoteNext, () => usePlayerStore.getState().skipToNext());
    TrackPlayer.addEventListener(Event.RemotePrevious, () => usePlayerStore.getState().skipToPrev());
    
    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));

    // Debug: log playback errors so we can see exactly why ExoPlayer rejects a URL
    TrackPlayer.addEventListener(Event.PlayerError, (event) => {
        console.error('[TrackPlayer] Playback error:', {
            code: event.code,
            message: event.message,
        });
    });
};
