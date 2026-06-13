import React, { useCallback, useRef } from 'react'
import {
    View, Text, StyleSheet, TouchableOpacity,
    SafeAreaView, StatusBar, ScrollView,
} from 'react-native'
import { Image } from 'expo-image'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist'
import { BlurView } from 'expo-blur'
import { usePlayerStore, type CosmoTrack } from '../store/playerStore'
import type { RootStackParams } from '../navigation'

type NavProp = NativeStackNavigationProp<RootStackParams>

// ── Right-swipe action (delete) ──────────────────────────────────────────────
function RightAction() {
    return (
        <View style={styles.swipeDelete}>
            <Ionicons name="close" size={16} color="#fff" />
            <Text style={styles.swipeDeleteText}>Remove</Text>
        </View>
    )
}

// ── Main Queue Screen ────────────────────────────────────────────────────────
export default function QueueScreen() {
    const navigation = useNavigation<NavProp>()
    const {
        queue, currentIndex, removeFromQueue, reorderQueue, resolveAndPlay,
    } = usePlayerStore()

    const currentTrack = queue[currentIndex]
    const upcomingTracks = queue.slice(currentIndex + 1)
    const swipeableRefs = useRef<Map<number, SwipeableMethods>>(new Map())

    const handlePlayTrack = useCallback((track: CosmoTrack, queueIndex: number) => {
        resolveAndPlay(track, queueIndex)
    }, [resolveAndPlay])

    const handleRemove = useCallback((queueIndex: number) => {
        swipeableRefs.current.get(queueIndex)?.close()
        setTimeout(() => removeFromQueue(queueIndex), 150) // let animation finish
    }, [removeFromQueue])

    const renderItem = ({ item: track, getIndex, drag, isActive }: RenderItemParams<CosmoTrack>) => {
        const upcomingIdx = getIndex() ?? 0
        const queueIdx = currentIndex + 1 + upcomingIdx

        return (
            <ScaleDecorator>
                <ReanimatedSwipeable
                    key={track.videoId + queueIdx}
                    ref={((ref: SwipeableMethods | null) => {
                        if (ref) swipeableRefs.current.set(queueIdx, ref)
                    }) as any}
                    renderRightActions={() => <RightAction />}
                    onSwipeableOpen={() => handleRemove(queueIdx)}
                    overshootRight={false}
                    friction={2}
                    rightThreshold={80}
                >
                    <View style={[styles.trackRow, { backgroundColor: isActive ? '#1a1a1a' : '#0a0a0a' }]}>
                        {/* Index */}
                        <Text style={styles.trackIndex}>{upcomingIdx + 1}</Text>

                        {/* Artwork */}
                        {track.artwork ? (
                            <Image
                                source={{ uri: track.artwork }}
                                style={styles.trackArtwork}
                            />
                        ) : (
                            <View style={[styles.trackArtwork, styles.placeholderArt]} />
                        )}

                        {/* Info — tappable to play */}
                        <TouchableOpacity
                            style={styles.trackInfo}
                            onPress={() => handlePlayTrack(track, queueIdx)}
                            activeOpacity={0.7}
                            disabled={isActive}
                        >
                            <Text style={styles.trackTitle} numberOfLines={1}>
                                {track.title}
                            </Text>
                            <Text style={styles.trackArtist} numberOfLines={1}>
                                {track.artist}
                            </Text>
                        </TouchableOpacity>

                        {/* Drag Handle */}
                        <TouchableOpacity
                            onLongPress={drag}
                            disabled={isActive}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            style={styles.dragHandleBtn}
                        >
                            <Ionicons name="menu" size={24} color="#555" />
                        </TouchableOpacity>
                    </View>
                </ReanimatedSwipeable>
            </ScaleDecorator>
        )
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

            {/* Header */}
            <BlurView intensity={70} tint="dark" style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Queue</Text>
                <Text style={styles.trackCount}>
                    {upcomingTracks.length} track{upcomingTracks.length !== 1 ? 's' : ''}
                </Text>
            </BlurView>

            {/* Now Playing */}
            {currentTrack && (
                <View style={styles.nowPlayingSection}>
                    <Text style={styles.sectionLabel}>NOW PLAYING</Text>
                    <View style={styles.nowPlayingRow}>
                        {currentTrack.artwork ? (
                            <Image
                                source={{ uri: currentTrack.artwork }}
                                style={styles.nowPlayingArtwork}
                            />
                        ) : (
                            <View style={[styles.nowPlayingArtwork, styles.placeholderArt]} />
                        )}
                        <View style={styles.nowPlayingInfo}>
                            <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                                {currentTrack.title}
                            </Text>
                            <Text style={styles.nowPlayingArtist} numberOfLines={1}>
                                {currentTrack.artist}
                            </Text>
                        </View>
                        <View style={styles.nowPlayingBadge}>
                            <Ionicons name="musical-note" size={14} color="#000" />
                        </View>
                    </View>
                </View>
            )}

            {/* Upcoming tracks */}
            <View style={styles.upcomingSection}>
                <Text style={styles.sectionLabel}>QUEUE</Text>

                {upcomingTracks.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="musical-notes" size={40} color="#666" style={{ marginBottom: 8 }} />
                        <Text style={styles.emptyTitle}>Queue is empty</Text>
                        <Text style={styles.emptySubtitle}>
                            Add tracks from search results or play a playlist
                        </Text>
                    </View>
                ) : (
                    <DraggableFlatList
                        data={upcomingTracks}
                        onDragEnd={({ from, to }) => {
                            reorderQueue(currentIndex + 1 + from, currentIndex + 1 + to)
                        }}
                        keyExtractor={(item, index) => item.videoId + '-' + index}
                        renderItem={renderItem}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40 }}
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
        paddingHorizontal: 16,
    },

    // ── Header ────────────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        marginBottom: 20,
        gap: 12,
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
        fontSize: 20,
        fontWeight: '700',
        flex: 1,
    },
    trackCount: {
        color: '#555',
        fontSize: 13,
    },

    // ── Now Playing ───────────────────────────────────────────────────────────
    nowPlayingSection: {
        marginBottom: 24,
    },
    sectionLabel: {
        color: '#555',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.5,
        marginBottom: 10,
    },
    nowPlayingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0d1f14',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: '#1DB95430',
        gap: 12,
    },
    nowPlayingArtwork: {
        width: 56,
        height: 56,
        borderRadius: 10,
    },
    nowPlayingInfo: {
        flex: 1,
    },
    nowPlayingTitle: {
        color: '#1DB954',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 3,
    },
    nowPlayingArtist: {
        color: '#888',
        fontSize: 13,
    },
    nowPlayingBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nowPlayingBadgeText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '700',
    },
    placeholderArt: {
        backgroundColor: '#1a1a1a',
    },

    // ── Track rows ────────────────────────────────────────────────────────────
    upcomingSection: {
        flex: 1,
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#141414',
        gap: 10,
    },
    trackIndex: {
        color: '#444',
        fontSize: 13,
        fontWeight: '600',
        width: 20,
        textAlign: 'center',
    },
    trackArtwork: {
        width: 46,
        height: 46,
        borderRadius: 8,
    },
    trackInfo: {
        flex: 1,
    },
    trackTitle: {
        color: '#ccc',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 2,
    },
    trackArtist: {
        color: '#555',
        fontSize: 12,
    },

    // ── Drag Handle ───────────────────────────────────────────────────────────
    dragHandleBtn: {
        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dragHandleIcon: {
        color: '#555',
        fontSize: 24,
        fontWeight: '700',
    },

    // ── Swipe to delete ───────────────────────────────────────────────────────
    swipeDelete: {
        backgroundColor: '#ff4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 90,
        flexDirection: 'column',
        gap: 2,
    },
    swipeDeleteIcon: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    swipeDeleteText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },

    // ── Empty state ───────────────────────────────────────────────────────────
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        gap: 8,
    },
    emptyIcon: {
        fontSize: 40,
        marginBottom: 8,
    },
    emptyTitle: {
        color: '#888',
        fontSize: 18,
        fontWeight: '600',
    },
    emptySubtitle: {
        color: '#444',
        fontSize: 13,
        textAlign: 'center',
        maxWidth: 240,
    },
})
