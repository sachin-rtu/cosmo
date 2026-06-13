import React, { useEffect, useState } from 'react'
import {
    View, Text, StyleSheet, TouchableOpacity,
    SafeAreaView, StatusBar, ActivityIndicator,
    Dimensions, Platform, ScrollView, Modal, Pressable, FlatList, Alert, Share
} from 'react-native'
import { Image } from 'expo-image'
import { BlurView } from 'expo-blur'
import { FlashList } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import TrackPlayer, {
    useProgress,
    useIsPlaying,
} from '@rntp/player'
import { usePlayerStore } from '../store/playerStore'
import { useLikesStore } from '../store/likesStore'
import { usePlaylistStore } from '../store/playlistStore'
import { useAuthStore } from '../store/authStore'
import { useDownloadStore } from '../store/downloadStore'
import { downloadTrack, removeLocalDownload } from '../services/downloadService'
import api from '../services/api'
import type { RootStackParams } from '../navigation'
import Feather from '@expo/vector-icons/Feather'
import Ionicons from '@expo/vector-icons/Ionicons'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import Equalizer from '../components/Equalizer'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const ARTWORK_SIZE = SCREEN_WIDTH - 64

// ─── ContextCard type ─────────────────────────────────────────────────────────
interface ContextCard {
    genre: string
    mood_tags: string[]
    similar_artists: string[]
    fun_fact: string
    language: string
    energy_level: 1 | 2 | 3
}

export default function NowPlayingScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>()
    const progress = useProgress()
    const isPlaying = useIsPlaying()

    const { 
        queue, currentIndex, skipToNext, skipToPrev,
        isShuffled, repeatMode, toggleShuffle, toggleRepeat 
    } = usePlayerStore()
    const currentTrack = queue[currentIndex]

    const { isLiked, toggleLike, fetchLikes } = useLikesStore()
    const liked = currentTrack ? isLiked(currentTrack.videoId) : false

    // Hydrate likes on mount
    useEffect(() => { fetchLikes() }, [])

    const activeDownloads = useDownloadStore(s => s.activeDownloads)
    const isDownloaded = useDownloadStore(s => s.isDownloaded)

    // Context card
    const [contextCard, setContextCard] = useState<ContextCard | null>(null)
    const [contextLoading, setContextLoading] = useState(false)

    const [settingsModalVisible, setSettingsModalVisible] = useState(false)
    const [timerModalVisible, setTimerModalVisible] = useState(false)
    const [sleepTimeRemaining, setSleepTimeRemaining] = useState<number | null>(null)
    const [sleepTimerMode, setSleepTimerMode] = useState<'off' | 'time' | 'track'>('off')

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false)
    const { session } = useAuthStore()
    const { playlists, addTrack, createPlaylist, fetchPlaylists } = usePlaylistStore()

    // Lyrics State
    const [lyrics, setLyrics] = useState<{ synced: { time: number; text: string }[] | null; plain: string | null } | null>(null)
    const [lyricsLoading, setLyricsLoading] = useState(false)
    const [showLyrics, setShowLyrics] = useState(false)
    const flashListRef = React.useRef<any>(null)

    // EQ State
    const [showEQ, setShowEQ] = useState(false)
    const eqSlideY = useSharedValue(SCREEN_WIDTH) // start hidden off screen below context card

    const eqAnimatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: eqSlideY.value }],
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 10,
        }
    })

    useEffect(() => {
        eqSlideY.value = withSpring(showEQ ? 0 : 400, { damping: 20, stiffness: 100 })
    }, [showEQ])

    // Fetch playlists on mount if logged in
    useEffect(() => {
        if (session) {
            fetchPlaylists()
        }
    }, [session])

    // Poll sleep timer status
    useEffect(() => {
        const interval = setInterval(async () => {
            const timer = await TrackPlayer.getSleepTimer()
            if (timer?.type === 'time') {
                setSleepTimeRemaining(Math.ceil(timer.remainingSeconds))
                setSleepTimerMode('time')
            } else if (timer?.type === 'mediaItem') {
                setSleepTimeRemaining(null)
                setSleepTimerMode('track')
            } else {
                setSleepTimeRemaining(null)
                setSleepTimerMode('off')
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    const handleShare = async () => {
        if (!currentTrack) return
        try {
            await Share.share({
                message: `Listen to ${currentTrack.title} by ${currentTrack.artist} on Cosmo!\nhttps://youtube.com/watch?v=${currentTrack.videoId}`
            })
        } catch (error) {
            console.error('Error sharing track:', error)
        }
    }

    const handleSetSleepTimer = async (minutes: number) => {
        if (minutes === 0) {
            await TrackPlayer.cancelSleepTimer()
            setSleepTimeRemaining(null)
            setSleepTimerMode('off')
        } else if (minutes === -1) {
            // End of track
            const currentQueueIdx = await TrackPlayer.getActiveMediaItemIndex()
            await TrackPlayer.sleepAfterMediaItemAtIndex(currentQueueIdx ?? 0)
            setSleepTimeRemaining(null)
            setSleepTimerMode('track')
        } else {
            // Fade out over the last 15 seconds for a graceful exit
            await TrackPlayer.sleepAfterTime(minutes * 60, { fadeOutSeconds: 15 })
            setSleepTimeRemaining(minutes * 60)
            setSleepTimerMode('time')
        }
        setTimerModalVisible(false)
    }

    const formatSleepTime = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        if (m > 0) return `${m}m`
        return `${s}s`
    }

    // ── Fetch Lyrics when track changes ───────────────────────────────────────
    useEffect(() => {
        if (!currentTrack) return
        setLyrics(null)
        setLyricsLoading(true)

        let cancelled = false
        const fetchLyrics = async () => {
            try {
                const response = await api.get(`/lyrics`, {
                    params: { title: currentTrack.title, artist: currentTrack.artist }
                })
                if (!cancelled) {
                    setLyrics(response.data)
                }
            } catch (err) {
                console.error('Failed to fetch lyrics', err)
            } finally {
                if (!cancelled) setLyricsLoading(false)
            }
        }
        fetchLyrics()

        return () => { cancelled = true }
    }, [currentTrack?.videoId])

    // Auto-scroll lyrics
    useEffect(() => {
        if (!showLyrics || !lyrics?.synced || !flashListRef.current) return
        const currentTime = progress.position
        const activeIndex = lyrics.synced.findIndex((line, index) => {
            const nextLine = lyrics.synced![index + 1]
            return currentTime >= line.time && (!nextLine || currentTime < nextLine.time)
        })
        if (activeIndex !== -1) {
            flashListRef.current.scrollToIndex({ index: activeIndex, animated: true, viewPosition: 0.5 })
        }
    }, [progress.position, showLyrics, lyrics?.synced])

    // ── Fetch context card when track changes ─────────────────────────────────
    useEffect(() => {
        if (!currentTrack) return
        setContextCard(null)
        setContextLoading(true)

        let cancelled = false

        const fetchAndPoll = async () => {
            const { videoId, title, artist } = currentTrack

            try {
                // POST triggers the job (or returns cached result immediately)
                const response = await api.post(
                    `/context/${videoId}`,
                    { title, artist }
                )

                if (cancelled) return

                if (response.data.status === 'ready') {
                    setContextCard(response.data.data)
                    setContextLoading(false)
                    return
                }

                // Processing — poll up to 5 times at 3s intervals
                for (let attempt = 0; attempt < 5; attempt++) {
                    await new Promise(r => setTimeout(r, 3000))
                    if (cancelled) return

                    try {
                        const poll = await api.get(`/context/${videoId}`)
                        if (cancelled) return

                        if (poll.data.status === 'ready') {
                            setContextCard(poll.data.data)
                            setContextLoading(false)
                            return
                        }
                    } catch {
                        // Silent fail on individual poll attempt
                    }
                }

                // All retries exhausted
                if (!cancelled) setContextLoading(false)
            } catch {
                if (!cancelled) setContextLoading(false)
            }
        }

        fetchAndPoll()

        return () => { cancelled = true }
    }, [currentTrack?.videoId])

    // ── Seek ──────────────────────────────────────────────────────────────────
    const handleSeek = async (ratio: number) => {
        await TrackPlayer.seekTo(ratio * progress.duration)
    }

    // ── Format time ──────────────────────────────────────────────────────────
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = Math.floor(seconds % 60)
        return `${m}:${String(s).padStart(2, '0')}`
    }

    const progressRatio = progress.duration > 0
        ? progress.position / progress.duration
        : 0

    const energyLabel = ['', 'Chill', 'Moderate', 'High Energy']

    if (!currentTrack) {
        return (
            <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <Text style={{ color: '#888', fontSize: 16 }}>Nothing playing</Text>
            </SafeAreaView>
        )
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
            >

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Feather name="chevron-down" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Now Playing</Text>
                
                <TouchableOpacity
                    onPress={() => setTimerModalVisible(true)}
                    style={styles.timerBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={[styles.timerIcon, sleepTimerMode !== 'off' && styles.timerIconActive]}>
                        🌙
                    </Text>
                    {sleepTimerMode === 'time' && sleepTimeRemaining !== null && (
                        <Text style={styles.timerText}>{formatSleepTime(sleepTimeRemaining)}</Text>
                    )}
                    {sleepTimerMode === 'track' && (
                        <Text style={styles.timerText}>Track</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Artwork OR Lyrics */}
            <View style={styles.artworkWrapper}>
                {showLyrics ? (
                    <View style={styles.lyricsContainer}>
                        {lyricsLoading ? (
                            <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 40 }} />
                        ) : lyrics?.synced ? (
                            // @ts-ignore - types are missing estimatedItemSize
                            <FlashList
                                ref={flashListRef}
                                data={lyrics.synced}
                                estimatedItemSize={40}
                                contentContainerStyle={{ paddingVertical: ARTWORK_SIZE / 2 }}
                                showsVerticalScrollIndicator={false}
                                renderItem={({ item, index }) => {
                                    const currentTime = progress.position
                                    const nextLine = lyrics.synced![index + 1]
                                    const isActive = currentTime >= item.time && (!nextLine || currentTime < nextLine.time)
                                    return (
                                        <TouchableOpacity 
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                                TrackPlayer.seekTo(item.time)
                                            }}
                                        >
                                            <Text style={[styles.lyricLine, isActive && styles.lyricLineActive]}>
                                                {item.text}
                                            </Text>
                                        </TouchableOpacity>
                                    )
                                }}
                            />
                        ) : lyrics?.plain ? (
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
                                <Text style={styles.plainLyricsText}>{lyrics.plain}</Text>
                            </ScrollView>
                        ) : (
                            <View style={styles.noLyricsContainer}>
                                <Text style={styles.noLyricsText}>No lyrics found</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    currentTrack.artwork ? (
                        <Image
                            source={{ uri: currentTrack.artwork }}
                            style={styles.artwork}
                        />
                    ) : (
                        <View style={[styles.artwork, { backgroundColor: '#222' }]} />
                    )
                )}
            </View>

            {/* Track info + Heart */}
            <View style={styles.trackInfoRow}>
                <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                        {currentTrack.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                        {currentTrack.artist}
                    </Text>
                </View>
                <View style={styles.actionBtns}>
                    <TouchableOpacity
                        style={styles.heartBtn}
                        onPress={() => {
                            if (!currentTrack) return
                            if (isDownloaded(currentTrack.videoId)) {
                                Alert.alert('Remove Download', 'Are you sure you want to remove this offline track?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Remove', style: 'destructive', onPress: () => removeLocalDownload(currentTrack.videoId) }
                                ])
                            } else if (activeDownloads[currentTrack.videoId]?.status !== 'downloading') {
                                downloadTrack(currentTrack)
                            }
                        }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        {activeDownloads[currentTrack?.videoId ?? '']?.status === 'downloading' ? (
                            <ActivityIndicator size="small" color="#1DB954" />
                        ) : isDownloaded(currentTrack?.videoId ?? '') ? (
                            <Ionicons name="cloud-done" size={24} color="#1DB954" />
                        ) : (
                            <Ionicons name="cloud-download-outline" size={24} color="#fff" />
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.heartBtn}
                        onPress={handleShare}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <Ionicons name="share-outline" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.heartBtn}
                        onPress={() => {
                            if (!session) {
                                Alert.alert('Account Required', 'Please log in to add to playlists.')
                                return
                            }
                            setPlaylistModalVisible(true)
                        }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <Text style={styles.heartIcon}>+</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.heartBtn}
                        onPress={() => toggleLike({
                            videoId: currentTrack.videoId,
                            title: currentTrack.title,
                            artist: currentTrack.artist,
                            artwork: currentTrack.artwork,
                        })}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <Text style={[styles.heartIcon, liked && styles.heartIconActive]}>
                            {liked ? '❤' : '♡'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Progress bar */}
            <View style={styles.progressSection}>
                <TouchableOpacity
                    style={styles.progressBarWrapper}
                    onPress={(e) => {
                        const ratio = e.nativeEvent.locationX / (SCREEN_WIDTH - 48)
                        handleSeek(Math.max(0, Math.min(1, ratio)))
                    }}
                    activeOpacity={1}
                >
                    <View style={styles.progressBarBg}>
                        <View
                            style={[
                                styles.progressBarFill,
                                { width: `${progressRatio * 100}%` }
                            ]}
                        />
                        {/* Scrubber dot */}
                        <View
                            style={[
                                styles.scrubberDot,
                                { left: `${progressRatio * 100}%` }
                            ]}
                        />
                    </View>
                </TouchableOpacity>
                <View style={styles.timeRow}>
                    <Text style={styles.timeText}>{formatTime(progress.position)}</Text>
                    <Text style={styles.timeText}>{formatTime(progress.duration)}</Text>
                </View>
            </View>

            {/* Controls */}
            <View style={styles.controls}>
                <TouchableOpacity
                    onPress={toggleShuffle}
                    style={[styles.controlBtnSecondary, isShuffled && styles.controlBtnSecondaryActive]}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="shuffle" size={20} color={isShuffled ? '#1DB954' : '#666'} style={{ marginLeft: 2 }} />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={skipToPrev}
                    style={styles.controlBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="play-skip-back" size={28} color="#ccc" />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={async () => {
                        isPlaying
                            ? await TrackPlayer.pause()
                            : await TrackPlayer.play()
                    }}
                    style={styles.playBtn}
                >
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#000" style={!isPlaying ? { marginLeft: 3 } : undefined} />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={skipToNext}
                    style={styles.controlBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="play-skip-forward" size={28} color="#ccc" />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={toggleRepeat}
                    style={[styles.controlBtnSecondary, repeatMode !== 'off' && styles.controlBtnSecondaryActive]}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="repeat" size={20} color={repeatMode !== 'off' ? '#1DB954' : '#666'} />
                    {repeatMode === 'one' && <View style={styles.repeatOneDot} />}
                </TouchableOpacity>
            </View>

            {/* Context card */}
            <BlurView intensity={60} tint="dark" style={styles.contextCard}>
                {contextLoading && !contextCard && (
                    <View style={styles.contextLoading}>
                        <ActivityIndicator size="small" color="#1DB954" />
                        <Text style={styles.contextLoadingText}>
                            AI is analyzing this track...
                        </Text>
                    </View>
                )}

                {contextCard && (
                    <>
                        {/* Genre + Energy row */}
                        <View style={styles.contextTopRow}>
                            <View style={styles.genrePill}>
                                <Text style={styles.genreText}>{contextCard.genre}</Text>
                            </View>
                            <View style={styles.energyPill}>
                                <Text style={styles.energyText}>
                                    {energyLabel[contextCard.energy_level]}
                                </Text>
                            </View>
                            <View style={styles.langPill}>
                                <Text style={styles.langText}>{contextCard.language}</Text>
                            </View>
                        </View>

                        {/* Mood tags */}
                        <View style={styles.moodRow}>
                            {contextCard.mood_tags.map((tag) => (
                                <View key={tag} style={styles.moodTag}>
                                    <Text style={styles.moodTagText}>{tag}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Similar artists */}
                        <Text style={styles.contextLabel}>Similar artists</Text>
                        <Text style={styles.similarArtists}>
                            {contextCard.similar_artists.join('  ·  ')}
                        </Text>

                        {/* Fun fact */}
                        {contextCard.fun_fact ? (
                            <>
                                <Text style={styles.contextLabel}>Did you know</Text>
                                <Text style={styles.funFact}>{contextCard.fun_fact}</Text>
                            </>
                        ) : null}
                    </>
                )}
            </BlurView>

            {/* Show Queue, Lyrics & EQ Buttons */}
            <View style={styles.actionRow}>
                <TouchableOpacity 
                    style={styles.queueBtn}
                    onPress={() => navigation.navigate('Queue')}
                >
                    <Text style={styles.queueBtnIcon}>📋</Text>
                    <Text style={styles.queueBtnText}>Up Next</Text>
                    <Text style={styles.queueBtnChevron}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.lyricsBtn, showLyrics && styles.lyricsBtnActive]}
                    onPress={() => {
                        setShowLyrics(!showLyrics)
                        if (showEQ) setShowEQ(false)
                    }}
                >
                    <Ionicons name="mic-outline" size={18} color={showLyrics ? '#000' : '#fff'} style={{ marginRight: 6 }} />
                    <Text style={[styles.lyricsBtnText, showLyrics && styles.lyricsBtnTextActive]}>Lyrics</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.lyricsBtn, showEQ && styles.lyricsBtnActive]}
                    onPress={() => {
                        setShowEQ(!showEQ)
                        if (showLyrics) setShowLyrics(false)
                    }}
                >
                    <Ionicons name="options-outline" size={18} color={showEQ ? '#000' : '#fff'} style={{ marginRight: 6 }} />
                    <Text style={[styles.lyricsBtnText, showEQ && styles.lyricsBtnTextActive]}>EQ</Text>
                </TouchableOpacity>
            </View>
            </ScrollView>

            {/* Equalizer Bottom Sheet */}
            <Animated.View style={eqAnimatedStyle}>
                <Equalizer />
            </Animated.View>

            {/* Settings Modal */}
            <Modal
                visible={settingsModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setSettingsModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={() => setSettingsModalVisible(false)} />
                    <BlurView intensity={70} tint="dark" style={styles.modalContent}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Playback Settings</Text>

                        {/* Sleep Timer Option */}
                        <TouchableOpacity 
                            style={styles.settingsRow} 
                            onPress={() => {
                                setSettingsModalVisible(false)
                                setTimerModalVisible(true)
                            }}
                        >
                            <Feather name="moon" size={24} color="#fff" style={styles.settingsIcon} />
                            <View style={styles.settingsTextContainer}>
                                <Text style={styles.settingsRowTitle}>Sleep Timer</Text>
                                <Text style={styles.settingsRowSubtitle}>
                                    {sleepTimerMode === 'time' && sleepTimeRemaining 
                                        ? `Ends in ${formatSleepTime(sleepTimeRemaining)}` 
                                        : sleepTimerMode === 'track'
                                        ? 'Ends after track'
                                        : 'Off'}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#666" />
                        </TouchableOpacity>

                        {/* Crossfade Option */}
                        <View style={styles.settingsRow}>
                            <Feather name="git-merge" size={24} color="#fff" style={styles.settingsIcon} />
                            <View style={styles.settingsTextContainer}>
                                <Text style={styles.settingsRowTitle}>Crossfade</Text>
                                <Text style={styles.settingsRowSubtitle}>
                                    {usePlayerStore.getState().crossfadeEnabled 
                                        ? `${usePlayerStore.getState().crossfadeDuration}s` 
                                        : 'Off'}
                                </Text>
                            </View>
                            <TouchableOpacity 
                                style={[styles.toggleBtn, usePlayerStore.getState().crossfadeEnabled && styles.toggleBtnActive]}
                                onPress={() => {
                                    usePlayerStore.getState().setCrossfadeEnabled(!usePlayerStore.getState().crossfadeEnabled)
                                }}
                            >
                                <View style={[styles.toggleKnob, usePlayerStore.getState().crossfadeEnabled && styles.toggleKnobActive]} />
                            </TouchableOpacity>
                        </View>
                        
                        {usePlayerStore.getState().crossfadeEnabled && (
                            <View style={styles.sliderContainer}>
                                <Text style={styles.sliderLabel}>1s</Text>
                                <View style={styles.sliderTrackWrapper}>
                                    <View style={styles.sliderBg} />
                                    <View style={[styles.sliderFill, { width: `${(usePlayerStore.getState().crossfadeDuration / 12) * 100}%` }]} />
                                    {/* Tap zones for adjusting crossfade */}
                                    <View style={styles.sliderControls}>
                                        <TouchableOpacity 
                                            style={styles.sliderControlHalf} 
                                            onPress={() => {
                                                const v = usePlayerStore.getState().crossfadeDuration
                                                if (v > 1) usePlayerStore.getState().setCrossfadeDuration(v - 1)
                                            }} 
                                        />
                                        <TouchableOpacity 
                                            style={styles.sliderControlHalf} 
                                            onPress={() => {
                                                const v = usePlayerStore.getState().crossfadeDuration
                                                if (v < 12) usePlayerStore.getState().setCrossfadeDuration(v + 1)
                                            }} 
                                        />
                                    </View>
                                </View>
                                <Text style={styles.sliderLabel}>12s</Text>
                            </View>
                        )}

                        <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSettingsModalVisible(false)}>
                            <Text style={styles.modalCancelText}>Close</Text>
                        </TouchableOpacity>
                    </BlurView>
                </View>
            </Modal>

            {/* Sleep Timer Modal */}
            <Modal
                visible={timerModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setTimerModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={() => setTimerModalVisible(false)} />
                    <BlurView intensity={70} tint="dark" style={styles.modalContent}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Sleep Timer</Text>
                        <Text style={styles.modalSubtitle}>Stop audio after</Text>

                        <View style={styles.timerOptions}>
                            {[
                                { label: 'Off', minutes: 0 },
                                { label: 'End of Track', minutes: -1 },
                                { label: '15 mins', minutes: 15 },
                                { label: '30 mins', minutes: 30 },
                                { label: '45 mins', minutes: 45 },
                                { label: '1 hour', minutes: 60 },
                            ].map((opt) => (
                                <TouchableOpacity
                                    key={opt.label}
                                    style={styles.timerOptionBtn}
                                    onPress={() => handleSetSleepTimer(opt.minutes)}
                                >
                                    <Text style={styles.timerOptionText}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setTimerModalVisible(false)}>
                            <Text style={styles.modalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </BlurView>
                </View>
            </Modal>

            {/* ─── Add to Playlist Modal ────────────────────────────────────── */}
            <Modal
                visible={playlistModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setPlaylistModalVisible(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setPlaylistModalVisible(false)}
                >
                    <BlurView intensity={70} tint="dark" style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add to Playlist</Text>
                            <TouchableOpacity onPress={() => setPlaylistModalVisible(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity
                            style={styles.newPlaylistBtn}
                            onPress={() => {
                                Alert.prompt(
                                    'New Playlist',
                                    'Enter a name for your new playlist',
                                    [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                            text: 'Create & Add',
                                            onPress: async (name?: string) => {
                                                if (name && name.trim()) {
                                                    const playlist = await createPlaylist(name)
                                                    if (playlist) {
                                                        await addTrack(playlist.id, {
                                                            video_id: currentTrack.videoId,
                                                            title: currentTrack.title,
                                                            artist: currentTrack.artist,
                                                            thumbnail: currentTrack.artwork,
                                                            duration_ms: currentTrack.duration
                                                        })
                                                        setPlaylistModalVisible(false)
                                                    }
                                                }
                                            }
                                        }
                                    ],
                                    'plain-text'
                                )
                            }}
                        >
                            <Text style={styles.newPlaylistBtnIcon}>+</Text>
                            <Text style={styles.newPlaylistBtnText}>New Playlist</Text>
                        </TouchableOpacity>

                        <FlatList
                            data={playlists}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ paddingBottom: 24 }}
                            ListEmptyComponent={
                                <Text style={styles.emptyPlaylistText}>No playlists yet.</Text>
                            }
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.playlistRow}
                                    onPress={async () => {
                                        await addTrack(item.id, {
                                            video_id: currentTrack.videoId,
                                            title: currentTrack.title,
                                            artist: currentTrack.artist,
                                            thumbnail: currentTrack.artwork,
                                            duration_ms: currentTrack.duration
                                        })
                                        setPlaylistModalVisible(false)
                                    }}
                                >
                                    <Text style={styles.playlistRowIcon}>🎵</Text>
                                    <Text style={styles.playlistRowText}>{item.name}</Text>
                                </TouchableOpacity>
                            )}
                        />
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
        paddingHorizontal: 24,
    },
    emptyText: {
        color: '#555',
        textAlign: 'center',
        marginTop: 40,
    },

    // ── Header ────────────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        marginBottom: 24,
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    timerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        height: 40,
        backgroundColor: '#161616',
        borderRadius: 20,
    },
    timerIcon: {
        fontSize: 16,
        opacity: 0.6,
    },
    timerIconActive: {
        opacity: 1,
    },
    timerText: {
        color: '#1DB954',
        fontSize: 12,
        fontWeight: '600',
    },

    // ── Artwork ───────────────────────────────────────────────────────────────
    artworkWrapper: {
        alignSelf: 'center',
        marginBottom: 28,
        position: 'relative',
    },
    artwork: {
        width: ARTWORK_SIZE,
        height: ARTWORK_SIZE,
        borderRadius: 16,
    },
    artworkGlow: {
        position: 'absolute',
        bottom: -8,
        left: 16,
        right: 16,
        height: 20,
        backgroundColor: '#1DB954',
        opacity: 0.15,
        borderRadius: 50,
        // blur effect — visible on iOS, subtle on Android
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 0,
    },

    // ── Track info ────────────────────────────────────────────────────────────
    trackInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 12,
    },
    trackInfo: {
        flex: 1,
    },
    trackTitle: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '800',
        marginBottom: 4,
    },
    trackArtist: {
        color: '#aaa',
        fontSize: 16,
    },
    actionBtns: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    heartBtn: {
        padding: 4,
    },
    shareBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#1a1a1a',
        borderWidth: 1,
        borderColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 0,
    },
    heartIcon: {
        fontSize: 28,
        color: '#fff',
    },
    heartIconActive: {
        color: '#ff4444',
    },

    // ── Progress ──────────────────────────────────────────────────────────────
    progressSection: {
        marginBottom: 24,
    },
    progressBarWrapper: {
        paddingVertical: 10,
    },
    progressBarBg: {
        height: 3,
        backgroundColor: '#222',
        borderRadius: 3,
        position: 'relative',
    },
    progressBarFill: {
        height: 3,
        backgroundColor: '#1DB954',
        borderRadius: 3,
    },
    scrubberDot: {
        position: 'absolute',
        top: -5,
        width: 13,
        height: 13,
        borderRadius: 7,
        backgroundColor: '#fff',
        marginLeft: -6,
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
    },
    timeText: {
        color: '#555',
        fontSize: 12,
    },

    // ── Controls ──────────────────────────────────────────────────────────────
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        marginBottom: 28,
    },
    controlBtn: {
        padding: 8,
    },
    controlBtnSecondary: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1a1a1a',
        borderWidth: 1,
        borderColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    controlBtnSecondaryActive: {
        backgroundColor: '#0d2618',
        borderColor: '#1DB95440',
    },
    repeatOneDot: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#1DB954',
        borderWidth: 1,
        borderColor: '#0d2618',
    },
    playBtn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
    },

    // ── Context card ──────────────────────────────────────────────────────────
    contextCard: {
        marginTop: 32,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#333',
        overflow: 'hidden', // Ensure blur respects radius
    },
    contextLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    contextLoadingText: {
        color: '#555',
        fontSize: 13,
    },
    contextTopRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
    },
    genrePill: {
        backgroundColor: '#1a2e1a',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: '#1DB95430',
    },
    genreText: {
        color: '#1DB954',
        fontSize: 12,
        fontWeight: '600',
    },
    energyPill: {
        backgroundColor: '#1a1a2e',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    energyText: {
        color: '#7B8FFF',
        fontSize: 12,
    },
    langPill: {
        backgroundColor: '#1a1a1a',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    langText: {
        color: '#666',
        fontSize: 12,
    },
    moodRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 14,
    },
    moodTag: {
        backgroundColor: '#1a1a1a',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    moodTagText: {
        color: '#888',
        fontSize: 12,
    },
    contextLabel: {
        color: '#444',
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    similarArtists: {
        color: '#aaa',
        fontSize: 13,
        marginBottom: 12,
    },
    funFact: {
        color: '#777',
        fontSize: 13,
        lineHeight: 19,
    },

    // ── Queue Button ──────────────────────────────────────────────────────────
    queueBtn: {
        marginTop: 16,
        backgroundColor: '#161616',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#222',
        flex: 1,
    },
    queueBtnIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    queueBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    queueBtnChevron: {
        color: '#666',
        fontSize: 20,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 32,
    },
    lyricsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
        backgroundColor: '#161616',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#333',
    },
    lyricsBtnActive: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    lyricsBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    lyricsBtnTextActive: {
        color: '#000',
    },
    lyricsContainer: {
        width: ARTWORK_SIZE,
        height: ARTWORK_SIZE,
        backgroundColor: '#111',
        borderRadius: 16,
        overflow: 'hidden',
    },
    lyricLine: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'left',
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    lyricLineActive: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '800',
        textShadowColor: 'rgba(255, 255, 255, 0.3)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    plainLyricsText: {
        color: '#ccc',
        fontSize: 16,
        lineHeight: 24,
        textAlign: 'center',
    },
    noLyricsContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noLyricsText: {
        color: '#666',
        fontSize: 16,
    },

    // ── Modal ─────────────────────────────────────────────────────────────────
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        overflow: 'hidden',
    },
    modalHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 4,
    },
    modalSubtitle: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
    },
    timerOptions: {
        gap: 12,
        marginBottom: 24,
    },
    timerOptionBtn: {
        backgroundColor: '#1a1a1a',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    timerOptionText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    modalCancelBtn: {
        padding: 16,
        alignItems: 'center',
    },
    modalCancelText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    // Add to Playlist modal specific
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },

    modalClose: {
        color: '#888',
        fontSize: 24,
        padding: 4,
    },
    newPlaylistBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        marginBottom: 8,
    },
    newPlaylistBtnIcon: {
        color: '#1DB954',
        fontSize: 24,
        marginRight: 16,
        width: 24,
        textAlign: 'center',
    },
    newPlaylistBtnText: {
        color: '#1DB954',
        fontSize: 16,
        fontWeight: '600',
    },
    playlistRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
    },
    playlistRowIcon: {
        fontSize: 20,
        marginRight: 16,
        width: 24,
        textAlign: 'center',
    },
    playlistRowText: {
        color: '#fff',
        fontSize: 16,
    },
    emptyPlaylistText: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 20,
    },
    // Settings Modal
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    settingsIcon: {
        marginRight: 16,
    },
    settingsTextContainer: {
        flex: 1,
    },
    settingsRowTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    settingsRowSubtitle: {
        color: '#888',
        fontSize: 14,
    },
    toggleBtn: {
        width: 50,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#333',
        justifyContent: 'center',
        padding: 2,
    },
    toggleBtnActive: {
        backgroundColor: '#1DB954',
    },
    toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
    },
    toggleKnobActive: {
        transform: [{ translateX: 22 }],
    },
    sliderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 8,
        paddingHorizontal: 8,
    },
    sliderLabel: {
        color: '#888',
        fontSize: 12,
        width: 30,
        textAlign: 'center',
    },
    sliderTrackWrapper: {
        flex: 1,
        height: 30,
        justifyContent: 'center',
        marginHorizontal: 12,
    },
    sliderBg: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
    },
    sliderFill: {
        height: 4,
        backgroundColor: '#1DB954',
        borderRadius: 2,
    },
    sliderControls: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
    },
    sliderControlHalf: {
        flex: 1,
    }
})