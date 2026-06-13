import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Pressable,
  FlatList, StyleSheet, ActivityIndicator,
  SafeAreaView, Image, StatusBar, Modal, ScrollView
} from 'react-native'
import { BlurView } from 'expo-blur'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { usePlayerStore, type CosmoTrack } from '../store/playerStore'
import api from '../services/api'
import type { RootStackParams } from '../navigation'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import Feather from '@expo/vector-icons/Feather'
import Ionicons from '@expo/vector-icons/Ionicons'

type NavProp = NativeStackNavigationProp<RootStackParams>

export default function SearchScreen() {
  const navigation = useNavigation<NavProp>()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CosmoTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [menuTrack, setMenuTrack] = useState<CosmoTrack | null>(null)
  
  const [recording, setRecording] = useState<Audio.Recording | undefined>()
  const [isRecording, setIsRecording] = useState(false)

  const { playQueue, addToQueue, queue, currentIndex } = usePlayerStore()
  const currentTrack = queue[currentIndex]

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
        setHasSearched(true)
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
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
          <Feather name={isRecording ? 'square' : 'mic'} size={18} color={isRecording ? '#ff4444' : '#666'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.searchBtn, loading && styles.searchBtnDisabled]}
          onPress={handleSearch}
          disabled={loading || isRecording}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name="search" size={18} color="#fff" />
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: currentTrack ? 100 : 24 }}
        keyboardShouldPersistTaps="handled"
      >
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

        {/* Results */}
        {results.length > 0 && (
          <View style={styles.resultsSection}>
            {results.map((track, index) => {
              const isActive = currentTrack?.videoId === track.videoId
              return (
                <View key={track.videoId + index} style={[styles.trackRow, isActive && styles.trackRowActive]}>
                  {track.artwork ? (
                    <Image source={{ uri: track.artwork }} style={styles.artwork} />
                  ) : (
                    <View style={[styles.artwork, styles.placeholderArt]} />
                  )}
                  
                  <TouchableOpacity
                    style={styles.trackInfo}
                    onPress={() => handlePlay(track, index)}
                  >
                    <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>{track.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => setMenuTrack(track)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color="#888" />
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
        )}
        
        {hasSearched && results.length === 0 && !loading && !error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>Try searching for something else</Text>
          </View>
        )}
      </ScrollView>

      {/* Options Modal */}
      <Modal
        visible={!!menuTrack}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuTrack(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuTrack(null)}>
          <BlurView intensity={70} tint="dark" style={styles.modalContent}>
            {menuTrack && (
              <View style={styles.modalHeader}>
                <Image source={{ uri: menuTrack.artwork }} style={styles.modalArtwork} />
                <View style={styles.modalInfo}>
                  <Text style={styles.modalTitle} numberOfLines={2}>{menuTrack.title}</Text>
                  <Text style={styles.modalArtist}>{menuTrack.artist}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.modalOption} onPress={handleAddToQueue}>
              <Text style={styles.modalOptionIcon}>+</Text>
              <Text style={styles.modalOptionText}>Add to Queue</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancel}
              onPress={() => setMenuTrack(null)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </BlurView>
        </Pressable>
      </Modal>
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
    paddingBottom: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    marginTop: 8,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  micBtnRecording: {
    backgroundColor: '#ff444420',
    borderColor: '#ff444440',
  },
  searchBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  searchBtnDisabled: {
    opacity: 0.4,
  },
  error: {
    color: '#ff4444',
    marginBottom: 12,
    fontSize: 13,
  },
  moodBanner: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 24,
  },
  moodBannerContent: {
    flex: 1,
  },
  moodBannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  moodBannerSubtitle: {
    color: '#888',
    fontSize: 13,
  },
  moodBannerArrow: {
    color: '#666',
    fontSize: 20,
  },
  resultsSection: {
    marginTop: 8,
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
  },
  artwork: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  placeholderArt: {
    backgroundColor: '#222',
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  titleActive: {
    color: '#1DB954',
  },
  artist: {
    color: '#888',
    fontSize: 13,
  },
  moreBtn: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 14,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    gap: 16,
  },
  modalArtwork: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  modalInfo: {
    flex: 1,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalArtist: {
    color: '#888',
    fontSize: 14,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
  },
  modalOptionIcon: {
    color: '#fff',
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  modalOptionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  modalCancel: {
    marginTop: 24,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 12,
  },
  modalCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
