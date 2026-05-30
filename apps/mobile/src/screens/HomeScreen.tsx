import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  FlatList, StyleSheet, ActivityIndicator,
  SafeAreaView, Image, StatusBar, Platform, Modal
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery } from '@tanstack/react-query'
import { usePlayerStore, type CosmoTrack } from '../store/playerStore'
import TrackPlayer, { useProgress, useIsPlaying } from '@rntp/player'
import api from '../services/api'
import { getRecentlyPlayed, getInsights } from '../store/insightsStore'
import { useLikesStore, type LikedTrack } from '../store/likesStore'
import type { RootStackParams } from '../navigation'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import { useAuthStore } from '../store/authStore'
import { useOnboardingStore } from '../store/onboardingStore'
import { supabase } from '../services/supabase'
import { TrackCardSkeleton } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'


interface TrendingTrack {
  videoId: string
  title: string
  artist: string
  thumbnail: string | null
  durationMs: number
}

interface RecommendedTrack {
  videoId: string
  title: string
  artist: string
  thumbnail: string | null
  durationMs: number
}

type NavProp = NativeStackNavigationProp<RootStackParams>

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>()
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<CosmoTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [menuTrack, setMenuTrack] = useState<CosmoTrack | null>(null)
  
  const [recording, setRecording] = useState<Audio.Recording | undefined>()
  const [isRecording, setIsRecording] = useState(false)

  const { playQueue, addToQueue, toggleFavorite, favorites, currentIndex, queue } = usePlayerStore()
  const { session, setGuest } = useAuthStore()
  const progress = useProgress()  // RNTP hook — gives current position + duration
  const isPlaying = useIsPlaying()

  const currentTrack = queue[currentIndex]
  const recentlyPlayed = getRecentlyPlayed()
  const insights = getInsights()
  const { seededArtists } = useOnboardingStore()

  const { likedTracks, fetchLikes } = useLikesStore()

  // Hydrate liked songs on mount
  useEffect(() => { fetchLikes() }, [])

  // Trending data — fetched on mount, cached client-side for 30min
  const { data: trendingTracks = [], isLoading: trendingLoading } = useQuery<TrendingTrack[]>({
    queryKey: ['trending'],
    queryFn: async () => {
      const res = await api.get('/trending')
      return res.data
    },
    staleTime: 30 * 60 * 1000,
  })

  // AI Recommendations — personalized via Gemini + InnerTube fan-out
  const { data: forYouTracks = [], isLoading: forYouLoading } = useQuery<RecommendedTrack[]>({
    queryKey: ['recommendations', insights?.topArtists, insights?.peakHourLabel, seededArtists],
    queryFn: async () => {
      const topArtists = insights?.topArtists?.length ? insights.topArtists : seededArtists
      
      const res = await api.post('/ai/recommendations', {
        topArtists: topArtists,
        peakHourLabel: insights?.peakHourLabel ?? '12 PM',
      })
      return res.data
    },
    staleTime: 30 * 60 * 1000,
  })

  const handlePlayRecent = (event: typeof recentlyPlayed[number]) => {
    const track: CosmoTrack = {
      videoId: event.videoId,
      mediaId: event.videoId,
      title: event.title,
      artist: event.artist,
      artwork: event.artwork,
      duration: 0,
      url: '',
    }
    playQueue([track], 0)
  }

  const handlePlayTrending = (item: TrendingTrack, index: number) => {
    const tracks: CosmoTrack[] = trendingTracks.map(t => ({
      videoId: t.videoId,
      mediaId: t.videoId,
      title: t.title,
      artist: t.artist,
      artwork: t.thumbnail ?? '',
      duration: t.durationMs,
      url: '',
    }))
    playQueue(tracks, index)
  }

  const handlePlayForYou = (item: RecommendedTrack, index: number) => {
    const tracks: CosmoTrack[] = forYouTracks.map(t => ({
      videoId: t.videoId,
      mediaId: t.videoId,
      title: t.title,
      artist: t.artist,
      artwork: t.thumbnail ?? '',
      duration: t.durationMs,
      url: '',
    }))
    playQueue(tracks, index)
  }

  const handlePlayLiked = (item: LikedTrack, index: number) => {
    const tracks: CosmoTrack[] = likedTracks.map(t => ({
      videoId: t.video_id,
      mediaId: t.video_id,
      title: t.title,
      artist: t.artist,
      artwork: t.artwork ?? '',
      duration: 0,
      url: '',
    }))
    playQueue(tracks, index)
  }

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setHasSearched(true)
    try {
      const response = await api.get('/stream/search', { params: { q: query } })
      const tracks: CosmoTrack[] = response.data.map((t: any) => ({
        videoId:    t.videoId,
        mediaId:    t.videoId,
        title:      t.title,
        artist:     t.artist,
        artwork:    t.thumbnail,
        duration:   t.durationMs,
        url:        '',
      }))
      setResults(tracks)
      setHasSearched(true)
    } catch (err: any) {
      console.error(err)
      setError('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync()
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      )
      setRecording(recording)
      setIsRecording(true)
    } catch (err) {
      console.error('Failed to start recording', err)
      setError('Failed to access microphone')
    }
  }

  const stopRecording = async () => {
    if (!recording) return
    setIsRecording(false)
    setRecording(undefined)

    try {
      await recording.stopAndUnloadAsync()
      const uri = recording.getURI()
      if (!uri) return

      setLoading(true)
      setError('')

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
      
      const { data } = await api.post('/ai/voice-search', {
        audioBase64: base64,
        mimeType: 'audio/m4a'
      })
      
      if (data.transcript) {
        setQuery(data.transcript)
      }
      
      if (data.tracks && data.tracks.length > 0) {
        setResults(data.tracks.map((t: any) => ({
          videoId: t.videoId,
          mediaId: t.videoId,
          title: t.title,
          artist: t.artist,
          artwork: t.thumbnail ?? '',
          duration: t.durationMs,
          url: '',
        })))
      } else {
        setError('No songs found for that voice search.')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to process voice search.')
    } finally {
      setLoading(false)
    }
  }

  const handlePlay = async (track: CosmoTrack, index: number) => {
    await playQueue(results, index)
  }

  const handleAddToQueue = async () => {
    if (!menuTrack) return
    await addToQueue(menuTrack)
    setMenuTrack(null)
  }

  // Progress bar width as a percentage — used in mini player
  const progressPercent = progress.duration > 0
    ? (progress.position / progress.duration) * 100
    : 0

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>cosmo</Text>
          <Text style={styles.tagline}>what do you feel like?</Text>
        </View>
        
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.authBtn}
            onPress={async () => {
              if (session) {
                await supabase.auth.signOut()
                setGuest(false)
              } else {
                setGuest(false) // Going to login
              }
            }}
          >
            <Text style={styles.authBtnText}>{session ? 'Log Out' : 'Log In'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.insightsBtn}
            onPress={() => navigation.navigate('Insights')}
          >
            <Text style={styles.insightsBtnIcon}>📊</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search songs, artists, moods..."
          placeholderTextColor="#555"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={[styles.micBtn, isRecording && styles.micBtnRecording]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={loading && !isRecording}
        >
          <Text style={[styles.micIcon, isRecording && styles.micIconRecording]}>
            {isRecording ? '⏹' : '🎤'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.searchBtn, loading && styles.searchBtnDisabled]}
          onPress={handleSearch}
          disabled={loading || isRecording}
        >
          {loading
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={styles.searchBtnText}>↵</Text>
          }
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* AI Mood Playlist Banner */}
      {!results.length && (
        <TouchableOpacity 
          style={styles.moodBanner}
          onPress={() => navigation.navigate('Mood')}
          activeOpacity={0.8}
        >
          <View style={styles.moodBannerContent}>
            <Text style={styles.moodBannerTitle}>AI Mood Playlist ✨</Text>
            <Text style={styles.moodBannerSubtitle}>Tell Gemini how you feel and get a custom vibe</Text>
          </View>
          <Text style={styles.moodBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* Trending in India */}
      {!results.length && (
        <View style={styles.trendingSection}>
          <Text style={styles.trendingTitle}>Trending in India 🇮🇳</Text>
          {trendingLoading ? (
            <View style={styles.trendingSkeletonRow}>
              {[0, 1, 2, 3].map(i => (
                <TrackCardSkeleton key={i} cardWidth={130} />
              ))}
            </View>
          ) : (
            <FlatList
              data={trendingTracks}
              keyExtractor={(item) => item.videoId}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
              renderItem={({ item, index }) => {
                const isActive = currentTrack?.videoId === item.videoId
                return (
                  <TouchableOpacity
                    style={[styles.trendingCard, isActive && styles.trendingCardActive]}
                    onPress={() => handlePlayTrending(item, index)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.trendingThumbWrapper}>
                      {item.thumbnail ? (
                        <Image source={{ uri: item.thumbnail }} style={styles.trendingArtwork} />
                      ) : (
                        <View style={[styles.trendingArtwork, styles.thumbnailPlaceholder]} />
                      )}
                      {/* Rank overlay */}
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>{index + 1}</Text>
                      </View>
                      {isActive && (
                        <View style={styles.trendingPlayingBadge}>
                          <Text style={styles.recentPlayingIcon}>♪</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.trendingTrackTitle, isActive && styles.trendingTrackTitleActive]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.trendingTrackArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </View>
      )}

      {/* For You — AI Recommendations */}
      {!results.length && (
        <View style={styles.forYouSection}>
          <Text style={styles.forYouTitle}>For You ✨</Text>
          {forYouLoading ? (
            <View style={styles.forYouSkeletonRow}>
              {[0, 1, 2, 3].map(i => (
                <TrackCardSkeleton key={i} cardWidth={130} />
              ))}
            </View>
          ) : forYouTracks.length > 0 ? (
            <FlatList
              data={forYouTracks}
              keyExtractor={(item) => item.videoId}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.forYouList}
              renderItem={({ item, index }) => {
                const isActive = currentTrack?.videoId === item.videoId
                return (
                  <TouchableOpacity
                    style={[styles.forYouCard, isActive && styles.forYouCardActive]}
                    onPress={() => handlePlayForYou(item, index)}
                    activeOpacity={0.7}
                  >
                    {item.thumbnail ? (
                      <Image source={{ uri: item.thumbnail }} style={styles.forYouArtwork} />
                    ) : (
                      <View style={[styles.forYouArtwork, styles.thumbnailPlaceholder]} />
                    )}
                    {isActive && (
                      <View style={styles.forYouPlayingBadge}>
                        <Text style={styles.recentPlayingIcon}>♪</Text>
                      </View>
                    )}
                    <Text style={[styles.forYouTrackTitle, isActive && styles.forYouTrackTitleActive]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.forYouTrackArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </TouchableOpacity>
                )
              }}
            />
          ) : null}
        </View>
      )}

      {/* Your Playlists Button */}
      {!results.length && (
        <TouchableOpacity 
          style={styles.playlistsBanner}
          onPress={() => navigation.navigate('Playlists')}
          activeOpacity={0.8}
        >
          <Text style={styles.playlistsBannerIcon}>📂</Text>
          <View style={styles.playlistsBannerTextCol}>
            <Text style={styles.playlistsBannerTitle}>Your Playlists</Text>
            <Text style={styles.playlistsBannerSub}>Create and manage your custom mixes</Text>
          </View>
          <Text style={styles.playlistsBannerArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* Liked Songs */}
      {likedTracks.length > 0 && !results.length && (
        <View style={styles.likedSection}>
          <Text style={styles.likedTitle}>Liked Songs ❤️</Text>
          <FlatList
            data={likedTracks}
            keyExtractor={(item) => item.video_id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.likedList}
            renderItem={({ item, index }) => {
              const isActive = currentTrack?.videoId === item.video_id
              return (
                <TouchableOpacity
                  style={[styles.likedCard, isActive && styles.likedCardActive]}
                  onPress={() => handlePlayLiked(item, index)}
                  activeOpacity={0.7}
                >
                  {item.artwork ? (
                    <Image source={{ uri: item.artwork }} style={styles.likedArtwork} />
                  ) : (
                    <View style={[styles.likedArtwork, styles.thumbnailPlaceholder]} />
                  )}
                  {isActive && (
                    <View style={styles.likedPlayingBadge}>
                      <Text style={styles.recentPlayingIcon}>♪</Text>
                    </View>
                  )}
                  <View style={styles.likedHeartBadge}>
                    <Text style={styles.likedHeartIcon}>❤</Text>
                  </View>
                  <Text style={[styles.likedTrackTitle, isActive && styles.likedTrackTitleActive]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.likedTrackArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                </TouchableOpacity>
              )
            }}
          />
        </View>
      )}

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && !results.length && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recently Played</Text>
          <FlatList
            data={recentlyPlayed}
            keyExtractor={(item) => item.videoId + item.timestamp}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentList}
            renderItem={({ item }) => {
              const isActive = currentTrack?.videoId === item.videoId
              return (
                <TouchableOpacity
                  style={[styles.recentCard, isActive && styles.recentCardActive]}
                  onPress={() => handlePlayRecent(item)}
                  activeOpacity={0.7}
                >
                  {item.artwork ? (
                    <Image source={{ uri: item.artwork }} style={styles.recentArtwork} />
                  ) : (
                    <View style={[styles.recentArtwork, styles.thumbnailPlaceholder]} />
                  )}
                  {isActive && (
                    <View style={styles.recentPlayingBadge}>
                      <Text style={styles.recentPlayingIcon}>♪</Text>
                    </View>
                  )}
                  <Text style={[styles.recentTrackTitle, isActive && styles.recentTrackTitleActive]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.recentTrackArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                </TouchableOpacity>
              )
            }}
          />
        </View>
      )}

      {/* Search empty state */}
      {hasSearched && results.length === 0 && !loading && (
        <EmptyState
          icon="🔍"
          title="No results found"
          message="Try searching for a different track or artist."
        />
      )}

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.videoId}
        contentContainerStyle={{
          paddingBottom: currentTrack ? 90 : 24
        }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const isPlaying = currentTrack?.videoId === item.videoId
          return (
            <TouchableOpacity
              style={[styles.trackRow, isPlaying && styles.trackRowActive]}
              onPress={() => handlePlay(item, index)}
              activeOpacity={0.7}
            >
              <View style={styles.thumbnailWrapper}>
                {item.artwork
                  ? <Image source={{ uri: item.artwork }} style={styles.thumbnail} />
                  : <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
                }
                {/* Playing indicator overlay */}
                {isPlaying && (
                  <View style={styles.playingOverlay}>
                    <Text style={styles.playingDot}>♪</Text>
                  </View>
                )}
              </View>
              <View style={styles.trackInfo}>
                <Text
                  style={[styles.trackTitle, isPlaying && styles.trackTitleActive]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {item.artist}
                </Text>
              </View>
              {/* Duration */}
              <Text style={styles.duration}>
                {Math.floor(item.duration / 60000)}:
                {String(Math.floor((item.duration % 60000) / 1000)).padStart(2, '0')}
              </Text>
              {/* Three dots menu */}
              <TouchableOpacity
                style={styles.menuBtn}
                onPress={() => setMenuTrack(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.menuDots}>⋮</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          hasSearched && !loading ? (
            <EmptyState
              icon="🔍"
              title="No results found"
              message="Try searching for a different track or artist."
            />
          ) : null
        }
      />

      {/* ── Bottom Sheet Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={!!menuTrack}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuTrack(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMenuTrack(null)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            {/* Track preview */}
            {menuTrack && (
              <View style={styles.modalTrackPreview}>
                {menuTrack.artwork ? (
                  <Image source={{ uri: menuTrack.artwork }} style={styles.modalArtwork} />
                ) : (
                  <View style={[styles.modalArtwork, styles.thumbnailPlaceholder]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTrackTitle} numberOfLines={1}>
                    {menuTrack.title}
                  </Text>
                  <Text style={styles.modalTrackArtist} numberOfLines={1}>
                    {menuTrack.artist}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.modalDivider} />

            {/* Add to Queue */}
            <TouchableOpacity
              style={styles.modalOption}
              onPress={handleAddToQueue}
            >
              <Text style={styles.modalOptionIcon}>📋</Text>
              <Text style={styles.modalOptionText}>
                {queue.some(t => t.videoId === menuTrack?.videoId)
                  ? 'Already in queue'
                  : 'Add to Queue'
                }
              </Text>
            </TouchableOpacity>

            {/* Download (placeholder for now) */}
            <TouchableOpacity
              style={[styles.modalOption, { opacity: 0.4 }]}
              disabled
            >
              <Text style={styles.modalOptionIcon}>⬇️</Text>
              <Text style={styles.modalOptionText}>Download (coming soon)</Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setMenuTrack(null)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mini player */}
      {currentTrack && (
        <View style={styles.miniPlayer}>
          {/* Progress bar at top */}
          <View style={styles.miniProgress}>
            <View
              style={[
                styles.miniProgressFill,
                { width: `${progressPercent}%` }
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
              <Text style={styles.miniPlayIcon}>{isPlaying ? '⏸' : '▶'}</Text>
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
              {/* Favorite */}
              <TouchableOpacity
                onPress={() => toggleFavorite(currentTrack.videoId)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text style={styles.miniActionIcon}>
                  {favorites.includes(currentTrack.videoId) ? '❤️' : '🤍'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 0,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  authBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#333',
  },
  authBtnText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  logo: {
    color: '#1DB954',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
  },
  tagline: {
    color: '#888',
    fontSize: 14,
    marginTop: -2,
    letterSpacing: 1,
  },
  insightsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightsBtnIcon: {
    fontSize: 20,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    height: 48,
  },
  input: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#222',
  },
  micBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtnRecording: {
    backgroundColor: '#ff444420',
    borderRadius: 22,
  },
  micIcon: {
    fontSize: 18,
    opacity: 0.8,
  },
  micIconRecording: {
    color: '#ff4444',
    opacity: 1,
  },
  searchBtn: {
    backgroundColor: '#1DB954',
    borderRadius: 12,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnDisabled: {
    opacity: 0.6,
  },
  searchBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 18,
  },
  error: {
    color: '#ff4444',
    marginBottom: 12,
    fontSize: 13,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#141414',
    gap: 12,
  },
  trackRowActive: {
    backgroundColor: '#0d1f14',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  thumbnailWrapper: {
    position: 'relative',
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    backgroundColor: '#1a1a1a',
  },
  playingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playingDot: {
    color: '#1DB954',
    fontSize: 18,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 3,
  },
  trackTitleActive: {
    color: '#1DB954',
  },
  trackArtist: {
    color: '#555',
    fontSize: 13,
  },
  duration: {
    color: '#444',
    fontSize: 12,
  },
  menuBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  menuDots: {
    color: '#666',
    fontSize: 20,
    fontWeight: '700',
  },
  // ── Bottom sheet modal ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  modalTrackPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  modalArtwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  modalTrackTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalTrackArtist: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#2a2a2a',
    marginVertical: 8,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  modalOptionIcon: {
    fontSize: 20,
  },
  modalOptionText: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '500',
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    backgroundColor: '#252525',
    borderRadius: 12,
  },
  modalCancelText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  // ── Mini player ─────────────────────────────────────────────────────────────
  miniPlayer: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 12 : 28,
    left: 12,
    right: 12,
    backgroundColor: '#161616',
    borderRadius: 16,
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
  miniPlayIcon: {
    color: '#000',
    fontSize: 14,
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
  emptySubtitle: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  // ── AI Mood Banner ──────────────────────────────────────────────────────────
  moodBanner: {
    backgroundColor: '#a855f720',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#a855f750',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  moodBannerContent: {
    flex: 1,
  },
  moodBannerTitle: {
    color: '#a855f7',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  moodBannerSubtitle: {
    color: '#d8b4fe',
    fontSize: 13,
  },
  moodBannerArrow: {
    color: '#a855f7',
    fontSize: 24,
    fontWeight: '600',
    marginLeft: 12,
  },
  miniArtist: {
    color: '#666',
    fontSize: 11,
    marginTop: 1,
  },
  miniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  miniActionIcon: {
    fontSize: 18,
  },
  // ── Trending in India ───────────────────────────────────────────────────────
  trendingSection: {
    marginBottom: 20,
  },
  trendingTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  trendingList: {
    gap: 12,
    paddingRight: 4,
  },
  trendingCard: {
    width: 130,
    borderRadius: 12,
    backgroundColor: '#141414',
    overflow: 'hidden',
    paddingBottom: 10,
  },
  trendingCardActive: {
    backgroundColor: '#0d1f14',
    borderWidth: 1,
    borderColor: '#1DB95440',
  },
  trendingThumbWrapper: {
    position: 'relative',
  },
  trendingArtwork: {
    width: 130,
    height: 130,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  rankBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 6,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    color: '#1DB954',
    fontSize: 13,
    fontWeight: '800',
  },
  trendingPlayingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendingTrackTitle: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  trendingTrackTitleActive: {
    color: '#1DB954',
  },
  trendingTrackArtist: {
    color: '#555',
    fontSize: 11,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  // Skeleton row container (animated skeletons live in Skeleton.tsx)
  trendingSkeletonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // ── For You (AI Recommendations) ──────────────────────────────────────────
  forYouSection: {
    marginBottom: 20,
  },
  forYouTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  forYouList: {
    gap: 12,
    paddingRight: 4,
  },
  forYouCard: {
    width: 130,
    borderRadius: 12,
    backgroundColor: '#141414',
    overflow: 'hidden',
    paddingBottom: 10,
  },
  forYouCardActive: {
    backgroundColor: '#1a0d2e',
    borderWidth: 1,
    borderColor: '#8B5CF640',
  },
  forYouArtwork: {
    width: 130,
    height: 130,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  forYouPlayingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  forYouTrackTitle: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  forYouTrackTitleActive: {
    color: '#8B5CF6',
  },
  forYouTrackArtist: {
    color: '#555',
    fontSize: 11,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  forYouSkeletonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // ── Liked Songs ───────────────────────────────────────────────────────────
  likedSection: {
    marginBottom: 20,
  },
  likedTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  likedList: {
    gap: 12,
    paddingRight: 4,
  },
  likedCard: {
    width: 130,
    borderRadius: 12,
    backgroundColor: '#141414',
    overflow: 'hidden',
    paddingBottom: 10,
    position: 'relative',
  },
  likedCardActive: {
    backgroundColor: '#1f0d0d',
    borderWidth: 1,
    borderColor: '#ff444440',
  },
  likedArtwork: {
    width: 130,
    height: 130,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  likedPlayingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  likedHeartBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  likedHeartIcon: {
    fontSize: 12,
    color: '#ff4444',
  },
  likedTrackTitle: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  likedTrackTitleActive: {
    color: '#ff4444',
  },
  likedTrackArtist: {
    color: '#555',
    fontSize: 11,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  // ── Recently Played ─────────────────────────────────────────────────────────
  recentSection: {
    marginBottom: 16,
  },
  recentTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  recentList: {
    gap: 12,
    paddingRight: 4,
  },
  recentCard: {
    width: 120,
    borderRadius: 12,
    backgroundColor: '#141414',
    overflow: 'hidden',
    paddingBottom: 10,
  },
  recentCardActive: {
    backgroundColor: '#0d1f14',
    borderWidth: 1,
    borderColor: '#1DB95440',
  },
  recentArtwork: {
    width: 120,
    height: 120,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  recentPlayingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentPlayingIcon: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  recentTrackTitle: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  recentTrackTitleActive: {
    color: '#1DB954',
  },
  recentTrackArtist: {
    color: '#555',
    fontSize: 11,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  playlistsBanner: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  playlistsBannerIcon: {
    fontSize: 28,
  },
  playlistsBannerTextCol: {
    flex: 1,
    marginLeft: 16,
  },
  playlistsBannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  playlistsBannerSub: {
    color: '#aaa',
    fontSize: 13,
  },
  playlistsBannerArrow: {
    color: '#666',
    fontSize: 24,
  },
})