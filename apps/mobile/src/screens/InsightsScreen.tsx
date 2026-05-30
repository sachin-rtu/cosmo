import React, { useEffect, useState } from 'react'
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    SafeAreaView, StatusBar, Dimensions
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParams } from '../navigation'
import { getInsights } from '../store/insightsStore'

type NavProp = NativeStackNavigationProp<RootStackParams>

export default function InsightsScreen() {
    const navigation = useNavigation<NavProp>()
    const [insights, setInsights] = useState<ReturnType<typeof getInsights>>(null)

    useEffect(() => {
        setInsights(getInsights())
    }, [])

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
                    <Text style={styles.backArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Your Insights</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {!insights ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyTitle}>No insights yet.</Text>
                        <Text style={styles.emptySubtitle}>Keep listening to music to generate your stats!</Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.greetingTitle}>Your listening in numbers.</Text>

                        {/* Top Stats Row */}
                        <View style={styles.statsRow}>
                            <View style={[styles.statCard, { backgroundColor: '#1DB95420' }]}>
                                <Text style={styles.statLabel}>Total Tracks</Text>
                                <Text style={[styles.statValue, { color: '#1DB954' }]}>
                                    {insights.totalPlays.toLocaleString()}
                                </Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: '#a855f720' }]}>
                                <Text style={styles.statLabel}>Streak Days</Text>
                                <Text style={[styles.statValue, { color: '#a855f7' }]}>
                                    {insights.streakDays}🔥
                                </Text>
                            </View>
                        </View>

                        {/* Peak Hour Card */}
                        <View style={styles.bigCard}>
                            <Text style={styles.bigCardLabel}>Vibe Time</Text>
                            <Text style={styles.bigCardValue}>{insights.peakHourLabel}</Text>
                            <Text style={styles.bigCardSubtitle}>is when you listen the most.</Text>
                        </View>

                        {/* Top Artists */}
                        {insights.topArtists.length > 0 && (
                            <View style={styles.artistsContainer}>
                                <Text style={styles.artistsSectionTitle}>Top Artists</Text>
                                {insights.topArtists.map((artist, index) => (
                                    <View key={artist} style={styles.artistRow}>
                                        <Text style={styles.artistRank}>#{index + 1}</Text>
                                        <Text style={styles.artistName}>{artist}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </>
                )}
            </ScrollView>
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
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
        textAlign: 'center',
    },
    // ── Content ──────────────────────────────────────────────────────────────
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    greetingTitle: {
        color: '#fff',
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 32,
        lineHeight: 40,
    },
    // ── Stats ────────────────────────────────────────────────────────────────
    statsRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        padding: 20,
        borderRadius: 24,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    statLabel: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    statValue: {
        fontSize: 32,
        fontWeight: '800',
    },
    // ── Big Card ─────────────────────────────────────────────────────────────
    bigCard: {
        backgroundColor: '#161616',
        borderRadius: 24,
        padding: 24,
        marginBottom: 32,
        alignItems: 'flex-start',
    },
    bigCardLabel: {
        color: '#666',
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    bigCardValue: {
        color: '#f59e0b',
        fontSize: 48,
        fontWeight: '800',
        marginBottom: 4,
    },
    bigCardSubtitle: {
        color: '#888',
        fontSize: 18,
        fontWeight: '500',
    },
    // ── Artists ──────────────────────────────────────────────────────────────
    artistsContainer: {
        backgroundColor: '#111',
        borderRadius: 24,
        padding: 24,
    },
    artistsSectionTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 20,
    },
    artistRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    artistRank: {
        color: '#555',
        fontSize: 20,
        fontWeight: '800',
        width: 40,
    },
    artistName: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        flex: 1,
    },
    // ── Empty State ──────────────────────────────────────────────────────────
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 100,
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptySubtitle: {
        color: '#888',
        fontSize: 15,
        textAlign: 'center',
    },
})
