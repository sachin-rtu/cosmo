import React from 'react'
import {
  View, Text, TouchableOpacity, Pressable, Image, StyleSheet, PanResponder, Animated
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { usePlayerStore } from '../store/playerStore'
import TrackPlayer, { useProgress, useIsPlaying } from '@rntp/player'
import type { RootStackParams } from '../navigation'
import Ionicons from '@expo/vector-icons/Ionicons'
import { startCrossfade } from '../services/crossfadeService'
import { BlurView } from 'expo-blur'

type NavProp = NativeStackNavigationProp<RootStackParams>

export default function MiniPlayer() {
  const navigation = useNavigation<NavProp>()
  const { 
    queue, currentIndex, toggleFavorite, favorites, skipToNext, skipToPrev,
    crossfadeEnabled, crossfadeDuration 
  } = usePlayerStore()
  const progress = useProgress()
  const isPlaying = useIsPlaying()
  const currentTrack = queue[currentIndex]

  // Track to ensure crossfade only triggers once per song
  const crossfadedTrackRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!currentTrack || !isPlaying || !crossfadeEnabled) return

    // If we've already triggered crossfade for this track, do nothing
    if (crossfadedTrackRef.current === currentTrack.videoId) return

    const timeRemaining = progress.duration - progress.position

    // When time remaining is less than or equal to crossfade duration, trigger it!
    if (progress.duration > 0 && timeRemaining > 0 && timeRemaining <= crossfadeDuration) {
      crossfadedTrackRef.current = currentTrack.videoId
      startCrossfade(crossfadeDuration)
    }
  }, [progress.position, crossfadeEnabled, crossfadeDuration, currentTrack, isPlaying])

  // Reset the ref when the track changes so the next track can crossfade
  React.useEffect(() => {
    if (currentTrack && crossfadedTrackRef.current !== currentTrack.videoId) {
      crossfadedTrackRef.current = null
    }
  }, [currentTrack])

  const pan = React.useRef(new Animated.ValueXY()).current

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx < -50) {
          Animated.timing(pan, {
            toValue: { x: -500, y: 0 },
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            skipToNext()
            pan.setValue({ x: 500, y: 0 })
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start()
          })
        } else if (gestureState.dx > 50) {
          Animated.timing(pan, {
            toValue: { x: 500, y: 0 },
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            skipToPrev()
            pan.setValue({ x: -500, y: 0 })
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start()
          })
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start()
        }
      }
    })
  ).current

  if (!currentTrack) return null

  return (
    <Animated.View style={[styles.miniPlayer, { transform: [{ translateX: pan.x }] }]} {...panResponder.panHandlers}>
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.blurOverlay} />
      
      {/* Progress Bar Background */}
      <View style={styles.miniProgress}>
        <View
          style={[
            styles.miniProgressFill,
            { width: `${(progress.position / (progress.duration || 1)) * 100}%` }
          ]}
        />
      </View>

      <View style={styles.miniContent}>
        {/* Play/Pause button (left) */}
        <TouchableOpacity
          style={styles.miniPlayBtn}
          onPress={() => isPlaying ? TrackPlayer.pause() : TrackPlayer.play()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#000" style={!isPlaying ? { marginLeft: 2 } : undefined} />
        </TouchableOpacity>

        {/* Artwork + info (center — tappable to open NowPlaying) */}
        <Pressable
          style={styles.miniCenter}
          onPress={() => navigation.navigate('NowPlaying')}
        >
          <Image
            source={{ uri: currentTrack.artwork }}
            style={styles.miniArtwork}
          />
          <View style={styles.miniInfo}>
            <Text style={styles.miniTitle} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={styles.miniArtist} numberOfLines={1}>
              {currentTrack.artist}
            </Text>
          </View>
        </Pressable>

        {/* Right side buttons */}
        <View style={styles.miniActions}>
          <TouchableOpacity
            onPress={() => toggleFavorite(currentTrack.videoId)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Ionicons
              name={favorites.includes(currentTrack.videoId) ? 'heart' : 'heart-outline'}
              size={20}
              color={favorites.includes(currentTrack.videoId) ? '#ff4444' : '#666'}
            />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  miniPlayer: {
    position: 'absolute',
    bottom: 56, // Adjusted to sit just above the Bottom Tab Bar
    left: 8,
    right: 8,
    backgroundColor: 'transparent',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
    elevation: 20,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  miniProgress: {
    height: 2,
    backgroundColor: '#222',
    width: '100%',
  },
  miniProgressFill: {
    height: 2,
    backgroundColor: '#1DB954',
  },
  miniContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  miniPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniArtwork: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  miniInfo: {
    flex: 1,
  },
  miniTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  miniArtist: {
    color: '#aaa',
    fontSize: 12,
  },
  miniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingRight: 4,
  },
})
