import React, { useEffect } from 'react'
import {
    View, Text, StyleSheet, TouchableOpacity,
    SafeAreaView, StatusBar, Alert
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { usePlaylistStore } from '../store/playlistStore'
import { useAuthStore } from '../store/authStore'
import EmptyState from '../components/EmptyState'

export default function PlaylistsScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<any>>()
    const { session, isGuest } = useAuthStore()
    const { playlists, loading, fetchPlaylists, createPlaylist } = usePlaylistStore()

    useEffect(() => {
        if (session) {
            fetchPlaylists()
        }
    }, [session])

    const handleCreatePlaylist = () => {
        if (isGuest || !session) {
            Alert.alert('Account Required', 'Please log in to create custom playlists.')
            return
        }

        Alert.prompt(
            'New Playlist',
            'Enter a name for your new playlist',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Create',
                    onPress: async (name?: string) => {
                        if (name && name.trim()) {
                            await createPlaylist(name)
                        }
                    }
                }
            ],
            'plain-text'
        )
    }

    if (isGuest || !session) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Your Playlists</Text>
                    <View style={{ width: 40 }} />
                </View>
                <EmptyState
                    icon="lock-closed"
                    title="Log in required"
                    message="You must be logged in to create and save playlists."
                />
            </SafeAreaView>
        )
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Your Playlists</Text>
                <TouchableOpacity onPress={handleCreatePlaylist} style={styles.addBtn}>
                    <Ionicons name="add" size={32} color="#1DB954" />
                </TouchableOpacity>
            </View>

            <FlashList
                data={playlists}
                estimatedItemSize={80}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                refreshing={loading}
                onRefresh={fetchPlaylists}
                ListEmptyComponent={
                    !loading ? (
                        <EmptyState
                            icon="musical-notes"
                            title="No playlists yet"
                            message="Tap the button below to create your first playlist."
                            action={{ label: 'Create Playlist', onPress: handleCreatePlaylist }}
                        />
                    ) : null
                }
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        style={styles.playlistCard}
                        onPress={() => navigation.navigate('PlaylistDetail', { playlist: item })}
                    >
                        <View style={styles.playlistIconBox}>
                            <Ionicons name="musical-notes" size={24} color="#1DB954" />
                        </View>
                        <View style={styles.playlistInfo}>
                            <Text style={styles.playlistName}>{item.name}</Text>
                            <Text style={styles.playlistDate}>
                                Created {new Date(item.created_at).toLocaleDateString()}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#444" />
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
    addBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    addIcon: {
        color: '#1DB954',
        fontSize: 28,
        fontWeight: '400',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    playlistCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#161616',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
    },
    playlistIconBox: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    playlistIcon: {
        fontSize: 20,
    },
    playlistInfo: {
        flex: 1,
    },
    playlistName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    playlistDate: {
        color: '#666',
        fontSize: 12,
    },
    chevron: {
        color: '#444',
        fontSize: 24,
    },
})
