import React, { useEffect, useState } from 'react'
import {
    View, Text, StyleSheet, Image, TouchableOpacity,
    SafeAreaView, StatusBar, ActivityIndicator,
    Dimensions, Platform, ScrollView, Modal, Pressable, FlatList, Alert, Share
} from 'react-native'
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
import api from '../services/api'
import type { RootStackParams } from '../navigation'

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

    const [contextCard, setContextCard] = useState<ContextCard | null>(null)
    const [contextLoading, setContextLoading] = useState(false)

    const [timerModalVisible, setTimerModalVisible] = useState(false)
    const [sleepTimeRemaining, setSleepTimeRemaining] = useState<number | null>(null)

    const [playlistModalVisible, setPlaylistModalVisible] = useState(false)
    const { session } = useAuthStore()
    const { playlists, addTrack, createPlaylist, fetchPlaylists } = usePlaylistStore()

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
            } else {
                setSleepTimeRemaining(null)
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
        } else {
            // Fade out over the last 15 seconds for a graceful exit
            await TrackPlayer.sleepAfterTime(minutes * 60, { fadeOutSeconds: 15 })
            setSleepTimeRemaining(minutes * 60)
        }
        setTimerModalVisible(false)
    }

    const formatSleepTime = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        if (m > 0) return `${m}m`
        return `${s}s`
    }

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
            <SafeAreaView style={styles.container}>
                <Text style={styles.emptyText}>Nothing playing</Text>
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
                    <Text style={styles.backArrow}>↓</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Now Playing</Text>
                
                <TouchableOpacity
                    onPress={() => setTimerModalVisible(true)}
                    style={styles.timerBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={[styles.timerIcon, sleepTimeRemaining !== null && styles.timerIconActive]}>
                        🌙
                    </Text>
                    {sleepTimeRemaining !== null && (
                        <Text style={styles.timerText}>{formatSleepTime(sleepTimeRemaining)}</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Artwork */}
            <View style={styles.artworkWrapper}>
                <Image
                    source={{ uri: currentTrack.artwork }}
                    style={styles.artwork}
                />
                {/* Subtle green glow effect */}
                <View style={styles.artworkGlow} />
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
                        onPress={handleShare}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <Text style={styles.shareIcon}>📤</Text>
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
                    style={styles.controlBtnSecondary}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={[styles.controlIconSecondary, isShuffled && styles.activeIcon]}>🔀</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={skipToPrev}
                    style={styles.controlBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={styles.controlIcon}>⏮</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={async () => {
                        isPlaying
                            ? await TrackPlayer.pause()
                            : await TrackPlayer.play()
                    }}
                    style={styles.playBtn}
                >
                    <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={skipToNext}
                    style={styles.controlBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={styles.controlIcon}>⏭</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={toggleRepeat}
                    style={styles.controlBtnSecondary}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={[styles.controlIconSecondary, repeatMode !== 'off' && styles.activeIcon]}>
                        {repeatMode === 'one' ? '🔂' : '🔁'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Context card */}
            <View style={styles.contextCard}>
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
            </View>

            {/* Show Queue Button */}
            <TouchableOpacity 
                style={styles.queueBtn}
                onPress={() => navigation.navigate('Queue')}
            >
                <Text style={styles.queueBtnIcon}>📋</Text>
                <Text style={styles.queueBtnText}>Up Next</Text>
                <Text style={styles.queueBtnChevron}>›</Text>
            </TouchableOpacity>
            </ScrollView>

            {/* Sleep Timer Modal */}
            <Modal
                visible={timerModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setTimerModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={() => setTimerModalVisible(false)} />
                    <View style={styles.modalContent}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Sleep Timer</Text>
                        <Text style={styles.modalSubtitle}>Stop audio after</Text>

                        <View style={styles.timerOptions}>
                            {[
                                { label: 'Off', minutes: 0 },
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
                    </View>
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
                    <Pressable style={styles.modalContent}>
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
                    </Pressable>
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
    backArrow: {
        color: '#fff',
        fontSize: 22,
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
        gap: 16,
    },
    heartBtn: {
        padding: 4,
    },
    shareIcon: {
        fontSize: 22,
        color: '#fff',
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
    controlIcon: {
        fontSize: 28,
        color: '#ccc',
    },
    controlBtnSecondary: {
        padding: 8,
    },
    controlIconSecondary: {
        fontSize: 22,
        color: '#666',
    },
    activeIcon: {
        color: '#1DB954',
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
    playIcon: {
        fontSize: 26,
        color: '#000',
    },

    // ── Context card ──────────────────────────────────────────────────────────
    contextCard: {
        backgroundColor: '#111',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#1a1a1a',
        minHeight: 80,
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
    },
    queueBtnIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    queueBtnText: {
        color: '#ddd',
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
    },
    queueBtnChevron: {
        color: '#555',
        fontSize: 20,
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
        backgroundColor: '#111',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
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
    }
})