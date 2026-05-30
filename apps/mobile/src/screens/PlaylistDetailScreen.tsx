import React, { useEffect } from 'react'
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    SafeAreaView, StatusBar, Image, ActivityIndicator, Alert
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { usePlaylistStore, type Playlist } from '../store/playlistStore'
import { usePlayerStore, type CosmoTrack } from '../store/playerStore'

export default function PlaylistDetailScreen() {
    const route = useRoute<any>()
    const navigation = useNavigation<any>()
    const playlist = route.params?.playlist as Playlist
    
    const { tracksByPlaylist, fetchTracks, removeTrack } = usePlaylistStore()
    const { playQueue } = usePlayerStore()

    const tracks = tracksByPlaylist[playlist.id] || []

    useEffect(() => {
        fetchTracks(playlist.id)
    }, [playlist.id])

    const handlePlayAll = () => {
        if (tracks.length === 0) return
        
        const cosmoTracks: CosmoTrack[] = tracks.map(t => ({
            videoId: t.video_id,
            mediaId: t.video_id,
            title: t.title,
            artist: t.artist,
            artwork: t.thumbnail,
            duration: t.duration_ms,
            url: '' // will be resolved by RNTP setup
        }))

        playQueue(cosmoTracks, 0)
    }

    const handlePlayTrack = (index: number) => {
        const cosmoTracks: CosmoTrack[] = tracks.map(t => ({
            videoId: t.video_id,
            mediaId: t.video_id,
            title: t.title,
            artist: t.artist,
            artwork: t.thumbnail,
            duration: t.duration_ms,
            url: ''
        }))
        playQueue(cosmoTracks, index)
    }

    const handleRemoveTrack = (videoId: string, title: string) => {
        Alert.alert(
            'Remove Track',
            `Are you sure you want to remove "${title}" from this playlist?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { 
                    text: 'Remove', 
                    style: 'destructive',
                    onPress: () => removeTrack(playlist.id, videoId)
                }
            ]
        )
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{playlist.name}</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Controls */}
            <View style={styles.controlsRow}>
                <Text style={styles.trackCount}>
                    {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
                </Text>
                <TouchableOpacity 
                    style={[styles.playBtn, tracks.length === 0 && { opacity: 0.5 }]} 
                    onPress={handlePlayAll}
                    disabled={tracks.length === 0}
                >
                    <Text style={styles.playBtnText}>▶</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={tracks}
                keyExtractor={(item) => item.video_id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyTitle}>It's quiet here</Text>
                        <Text style={styles.emptySubtitle}>
                            Add songs to this playlist from the player screen!
                        </Text>
                    </View>
                }
                renderItem={({ item, index }) => (
                    <TouchableOpacity 
                        style={styles.trackCard}
                        onPress={() => handlePlayTrack(index)}
                        onLongPress={() => handleRemoveTrack(item.video_id, item.title)}
                    >
                        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
                        <View style={styles.trackInfo}>
                            <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
                        </View>
                    </TouchableOpacity>
                )}
            />
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
        paddingHorizontal: 16,
        marginTop: 12,
        marginBottom: 16,
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
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
        textAlign: 'center',
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        marginBottom: 20,
    },
    trackCount: {
        color: '#888',
        fontSize: 14,
        fontWeight: '500',
    },
    playBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    playBtnText: {
        color: '#000',
        fontSize: 24,
        marginLeft: 4, // optical centering for triangle
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    trackCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    thumbnail: {
        width: 48,
        height: 48,
        borderRadius: 8,
        marginRight: 12,
        backgroundColor: '#222',
    },
    trackInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    trackTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 4,
    },
    trackArtist: {
        color: '#aaa',
        fontSize: 13,
    },
    emptyContainer: {
        marginTop: 100,
        alignItems: 'center',
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptySubtitle: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
})
