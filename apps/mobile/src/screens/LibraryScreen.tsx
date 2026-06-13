import React, { useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar
} from 'react-native'
import { Image } from 'expo-image'
import { FlashList } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'
import { useLikesStore, type LikedTrack } from '../store/likesStore'
import { usePlayerStore, type CosmoTrack } from '../store/playerStore'
import { supabase } from '../services/supabase'
import type { RootStackParams } from '../navigation'
import Ionicons from '@expo/vector-icons/Ionicons'

type NavProp = NativeStackNavigationProp<RootStackParams>

export default function LibraryScreen() {
  const navigation = useNavigation<NavProp>()
  const { session, setGuest } = useAuthStore()
  const { likedTracks, fetchLikes } = useLikesStore()
  const { playQueue, queue, currentIndex } = usePlayerStore()
  const currentTrack = queue[currentIndex]

  useEffect(() => {
    fetchLikes()
  }, [fetchLikes])

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setGuest(false) // Trigger nav to Auth Stack
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header & Settings */}
      <View style={styles.header}>
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {session?.user.email ? session.user.email[0].toUpperCase() : 'G'}
            </Text>
          </View>
          <Text style={styles.headerTitle}>Your Library</Text>
        </View>

        {session ? (
          <TouchableOpacity style={styles.authBtn} onPress={handleLogout}>
            <Text style={styles.authBtnText}>Log Out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.authBtn} onPress={() => setGuest(false)}>
            <Text style={styles.authBtnText}>Log In</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Playlists Button */}
      <TouchableOpacity 
        style={styles.playlistsBanner}
        onPress={() => navigation.navigate('Playlists')}
        activeOpacity={0.8}
      >
        <View style={styles.playlistsIconWrapper}>
          <Ionicons name="musical-notes" size={24} color="#1DB954" />
        </View>
        <View style={styles.playlistsBannerContent}>
          <Text style={styles.playlistsBannerTitle}>Your Playlists</Text>
          <Text style={styles.playlistsBannerSubtitle}>View saved and created playlists</Text>
        </View>
        <Text style={styles.playlistsBannerArrow}>→</Text>
      </TouchableOpacity>

      {/* Liked Songs */}
      <View style={styles.likedSection}>
        <Text style={styles.sectionTitle}>Liked Songs ❤️</Text>
        {likedTracks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptySubtitle}>No liked songs yet.</Text>
          </View>
        ) : (
          // @ts-ignore - types are missing estimatedItemSize
          <FlashList
            data={likedTracks}
            estimatedItemSize={72}
            keyExtractor={(item) => item.video_id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.likedList}
            renderItem={({ item, index }) => {
              const isActive = currentTrack?.videoId === item.video_id
              return (
                <TouchableOpacity
                  style={[styles.trackRow, isActive && styles.trackRowActive]}
                  onPress={() => handlePlayLiked(item, index)}
                  activeOpacity={0.7}
                >
                  <View style={styles.artworkWrapper}>
                    {item.artwork ? (
                      <Image source={{ uri: item.artwork }} style={styles.trackArtwork} />
                    ) : (
                      <View style={[styles.trackArtwork, styles.placeholderArt]} />
                    )}
                    {isActive && (
                      <View style={styles.playingBadge}>
                        <Text style={styles.playingIcon}>♪</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.trackInfo}>
                    <Text style={[styles.trackTitle, isActive && styles.trackTitleActive]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                  <Ionicons name="heart" size={20} color="#ff4444" />
                </TouchableOpacity>
              )
            }}
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  authBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
  },
  authBtnText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
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
  playlistsIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1DB95420',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  playlistsBannerContent: {
    flex: 1,
  },
  playlistsBannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  playlistsBannerSubtitle: {
    color: '#888',
    fontSize: 13,
  },
  playlistsBannerArrow: {
    color: '#666',
    fontSize: 20,
  },
  likedSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptySubtitle: {
    color: '#555',
    fontSize: 14,
  },
  likedList: {
    paddingBottom: 100, // Make room for MiniPlayer
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  trackRowActive: {
    opacity: 1,
  },
  artworkWrapper: {
    position: 'relative',
  },
  trackArtwork: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  placeholderArt: {
    backgroundColor: '#222',
  },
  playingBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playingIcon: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  trackTitleActive: {
    color: '#1DB954',
  },
  trackArtist: {
    color: '#aaa',
    fontSize: 13,
  },
})
