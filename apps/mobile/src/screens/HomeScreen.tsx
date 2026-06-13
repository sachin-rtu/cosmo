import React, { useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView
} from 'react-native'
import { Image } from 'expo-image'
import { FlashList } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery } from '@tanstack/react-query'
import { usePlayerStore, type CosmoTrack } from '../store/playerStore'
import { getRecentlyPlayed, getInsights } from '../store/insightsStore'
import { useOnboardingStore } from '../store/onboardingStore'
import api from '../services/api'
import type { RootStackParams } from '../navigation'
import { TrackCardSkeleton } from '../components/Skeleton'

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
  
  const { playQueue, queue, currentIndex } = usePlayerStore()
  const currentTrack = queue[currentIndex]
  
  const recentlyPlayed = getRecentlyPlayed()
  const insights = getInsights()
  const { seededArtists } = useOnboardingStore()

  // Trending data
  const { data: trendingTracks = [], isLoading: trendingLoading } = useQuery<TrendingTrack[]>({
    queryKey: ['trending'],
    queryFn: async () => {
      const res = await api.get('/trending')
      return res.data
    },
    staleTime: 30 * 60 * 1000, 
  })

  // For You data
  const { data: forYouTracks = [], isLoading: forYouLoading } = useQuery<RecommendedTrack[]>({
    queryKey: ['recommendations', seededArtists],
    queryFn: async () => {
      let seedArtists = seededArtists
      if (seedArtists.length === 0) {
        seedArtists = recentlyPlayed.slice(0, 3).map(t => t.artist)
      }
      const reqData = {
        topArtists: seedArtists.length > 0 ? seedArtists : ['Taylor Swift', 'The Weeknd', 'Arijit Singh'],
        peakHourLabel: '12 PM',
      }
      const res = await api.post('/ai/recommendations', reqData)
      return res.data
    },
    staleTime: 60 * 60 * 1000, 
  })

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

  const handlePlayRecent = (item: any, index: number) => {
    const tracks: CosmoTrack[] = recentlyPlayed.map(t => ({
      videoId: t.videoId,
      mediaId: t.videoId,
      title: t.title,
      artist: t.artist,
      artwork: t.artwork ?? '',
      duration: 0,
      url: '',
    }))
    playQueue(tracks, index)
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>cosmo</Text>
          <Text style={styles.tagline}>what do you feel like?</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: currentTrack ? 100 : 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Trending in India */}
        <View style={styles.trendingSection}>
          <Text style={styles.trendingTitle}>Trending in India 🇮🇳</Text>
          {trendingLoading ? (
            <View style={styles.trendingSkeletonRow}>
              {[0, 1, 2, 3].map(i => (
                <TrackCardSkeleton key={i} cardWidth={130} />
              ))}
            </View>
          ) : (
            // @ts-ignore - types are missing estimatedItemSize
            <FlashList<any>
              data={trendingTracks}
              {...({ estimatedItemSize: 130 } as any)}
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

        {/* For You — AI Recommendations */}
        <View style={styles.forYouSection}>
          <Text style={styles.forYouTitle}>For You ✨</Text>
          {forYouLoading ? (
            <View style={styles.forYouSkeletonRow}>
              {[0, 1, 2, 3].map(i => (
                <TrackCardSkeleton key={i} cardWidth={130} />
              ))}
            </View>
          ) : forYouTracks.length > 0 ? (
            // @ts-ignore - types are missing estimatedItemSize
            <FlashList<any>
              data={forYouTracks}
              {...({ estimatedItemSize: 130 } as any)}
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
                    <View style={styles.forYouThumbWrapper}>
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
                    </View>
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

        {/* Recently Played */}
        {recentlyPlayed.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>Recently Played</Text>
            {/* @ts-ignore - types are missing estimatedItemSize */}
            <FlashList<any>
              data={recentlyPlayed}
              {...({ estimatedItemSize: 120 } as any)}
              keyExtractor={(item, index) => item.videoId + index}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentList}
              renderItem={({ item, index }) => {
                const isActive = currentTrack?.videoId === item.videoId
                return (
                  <TouchableOpacity
                    style={[styles.recentCard, isActive && styles.recentCardActive]}
                    onPress={() => handlePlayRecent(item, index)}
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
      </ScrollView>
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
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  logo: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
  },
  tagline: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  thumbnailPlaceholder: {
    backgroundColor: '#222',
  },
  recentPlayingIcon: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  // Trending Styles
  trendingSection: {
    marginBottom: 24,
  },
  trendingTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  trendingSkeletonRow: {
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rankText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
  // For You Styles
  forYouSection: {
    marginBottom: 24,
  },
  forYouTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  forYouSkeletonRow: {
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: '#0d1f14',
    borderWidth: 1,
    borderColor: '#1DB95440',
  },
  forYouThumbWrapper: {
    position: 'relative',
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
    backgroundColor: '#1DB954',
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
    color: '#1DB954',
  },
  forYouTrackArtist: {
    color: '#555',
    fontSize: 11,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  // Recently Played Styles
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
})