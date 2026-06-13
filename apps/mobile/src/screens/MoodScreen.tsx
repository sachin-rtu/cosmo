import React, { useState } from 'react'
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    SafeAreaView, StatusBar, ActivityIndicator
} from 'react-native'
import { Image } from 'expo-image'
import { FlashList } from '@shopify/flash-list'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParams } from '../navigation'
import { usePlayerStore, type CosmoTrack } from '../store/playerStore'
import api from '../services/api'

type NavProp = NativeStackNavigationProp<RootStackParams>

export default function MoodScreen() {
    const navigation = useNavigation<NavProp>()
    const { playQueue } = usePlayerStore()

    const [moodText, setMoodText] = useState('')
    const [loading, setLoading] = useState(false)
    const [playlist, setPlaylist] = useState<CosmoTrack[] | null>(null)
    const [error, setError] = useState('')

    const MOOD_CHIPS = [
        'Late night drive 🚗',
        'Study session 📚',
        'Workout pump 💪',
        'Rainy evening 🌧️',
        'Chill vibes ☕'
    ]

    const handleGenerate = async (moodQuery: string = moodText) => {
        if (!moodQuery.trim()) return
        
        setLoading(true)
        setError('')
        setMoodText(moodQuery)

        try {
            const { data } = await api.post('/ai/playlist', { mood: moodQuery })
            
            if (!Array.isArray(data) || data.length === 0) {
                setError("Couldn't generate a playlist for that mood. Try something else!")
                setPlaylist(null)
            } else {
                const tracks: CosmoTrack[] = data.map((t: any) => ({
                    videoId: t.videoId,
                    mediaId: t.videoId,
                    title: t.title,
                    artist: t.artist,
                    artwork: t.thumbnail ?? '',
                    duration: t.durationMs,
                    url: '', // Will be resolved by playerStore
                }))
                setPlaylist(tracks)
            }
        } catch (err: any) {
            console.error(err)
            setError('Failed to connect to AI. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handlePlayAll = () => {
        if (playlist && playlist.length > 0) {
            playQueue(playlist, 0)
            navigation.navigate('NowPlaying')
        }
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Mood Playlist</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#a855f7" />
                    <Text style={styles.loadingText}>Curating your vibe...</Text>
                    <Text style={styles.loadingSubtext}>Gemini is mixing tracks just for you</Text>
                </View>
            ) : playlist ? (
                <View style={styles.resultContainer}>
                    <View style={styles.resultHeader}>
                        <Text style={styles.resultTitle}>Playlist for:</Text>
                        <Text style={styles.resultMood}>"{moodText}"</Text>
                        
                        <TouchableOpacity style={styles.playAllBtn} onPress={handlePlayAll}>
                            <Ionicons name="play" size={20} color="#fff" />
                            <Text style={styles.playAllText}>Play Playlist</Text>
                        </TouchableOpacity>
                    </View>

                    <FlashList<any>
                        data={playlist}
                        {...({ estimatedItemSize: 76 } as any)}
                        keyExtractor={(item, index) => item.videoId + index}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.playlistList}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity 
                                style={styles.trackRow}
                                activeOpacity={0.7}
                                onPress={() => {
                                    if (playlist) {
                                        playQueue(playlist, index)
                                        navigation.navigate('NowPlaying')
                                    }
                                }}
                            >
                                {item.artwork ? (
                                    <Image source={{ uri: item.artwork }} style={styles.trackArtwork} />
                                ) : (
                                    <View style={[styles.trackArtwork, styles.placeholderArt]} />
                                )}
                                <View style={styles.trackInfo}>
                                    <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                                    <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                    
                    <TouchableOpacity 
                        style={styles.resetBtn} 
                        onPress={() => {
                            setPlaylist(null)
                            setMoodText('')
                        }}
                    >
                        <Text style={styles.resetBtnText}>Generate Another</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.inputContainer}>
                    <Text style={styles.promptTitle}>How are you feeling?</Text>
                    <Text style={styles.promptSubtitle}>Type a mood, activity, or vibe, and AI will build the perfect playlist.</Text>
                    
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.textInput}
                            placeholder="e.g. relaxing after exams..."
                            placeholderTextColor="#555"
                            value={moodText}
                            onChangeText={setMoodText}
                            onSubmitEditing={() => handleGenerate()}
                            returnKeyType="go"
                            autoFocus
                        />
                        <TouchableOpacity 
                            style={[styles.generateBtn, !moodText.trim() && styles.generateBtnDisabled]}
                            onPress={() => handleGenerate()}
                            disabled={!moodText.trim()}
                        >
                            <Ionicons name="sparkles" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    <View style={styles.chipsContainer}>
                        <Text style={styles.chipsLabel}>Or try one of these:</Text>
                        <View style={styles.chipsWrapper}>
                            {MOOD_CHIPS.map(chip => (
                                <TouchableOpacity 
                                    key={chip} 
                                    style={styles.chip}
                                    onPress={() => handleGenerate(chip.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim())}
                                >
                                    <Text style={styles.chipText}>{chip}</Text>
                                </TouchableOpacity>
                            ))}
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
    },
    // ── Header ───────────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginTop: 12,
        marginBottom: 20,
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    backArrow: {
        color: '#fff',
        fontSize: 22,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        flex: 1,
        textAlign: 'center',
    },
    // ── Loading ──────────────────────────────────────────────────────────────
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    loadingText: {
        color: '#a855f7',
        fontSize: 22,
        fontWeight: '700',
        marginTop: 24,
        marginBottom: 8,
    },
    loadingSubtext: {
        color: '#888',
        fontSize: 15,
        textAlign: 'center',
    },
    // ── Input State ──────────────────────────────────────────────────────────
    inputContainer: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
    },
    promptTitle: {
        color: '#fff',
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 12,
    },
    promptSubtitle: {
        color: '#888',
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 32,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#161616',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#333',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 16,
    },
    textInput: {
        flex: 1,
        color: '#fff',
        fontSize: 18,
    },
    generateBtn: {
        backgroundColor: '#a855f7',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
    },
    generateBtnDisabled: {
        backgroundColor: '#333',
        opacity: 0.5,
    },
    generateBtnText: {
        fontSize: 20,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 14,
        marginBottom: 24,
    },
    chipsContainer: {
        marginTop: 32,
    },
    chipsLabel: {
        color: '#666',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 16,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    chipsWrapper: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    chip: {
        backgroundColor: '#1a1a1a',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2a2a2a',
    },
    chipText: {
        color: '#ccc',
        fontSize: 15,
        fontWeight: '500',
    },
    // ── Result State ─────────────────────────────────────────────────────────
    resultContainer: {
        flex: 1,
    },
    resultHeader: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    resultTitle: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    resultMood: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 24,
    },
    playAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#a855f7',
        paddingVertical: 16,
        borderRadius: 16,
        gap: 8,
    },
    playAllIcon: {
        color: '#fff',
        fontSize: 18,
    },
    playAllText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    playlistList: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#121212',
        padding: 10,
        borderRadius: 12,
        marginBottom: 8,
        gap: 12,
    },
    trackArtwork: {
        width: 48,
        height: 48,
        borderRadius: 8,
    },
    placeholderArt: {
        backgroundColor: '#222',
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
    trackArtist: {
        color: '#888',
        fontSize: 13,
    },
    resetBtn: {
        padding: 20,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#1a1a1a',
    },
    resetBtnText: {
        color: '#a855f7',
        fontSize: 16,
        fontWeight: '600',
    },
})
