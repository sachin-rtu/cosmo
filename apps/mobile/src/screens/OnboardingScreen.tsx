import React, { useState } from 'react'
import {
    View, Text, StyleSheet, TouchableOpacity,
    SafeAreaView, StatusBar, Dimensions, FlatList,
    Image, ScrollView
} from 'react-native'
import { useOnboardingStore } from '../store/onboardingStore'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const POPULAR_ARTISTS = [
    { id: '1', name: 'The Weeknd', image: 'https://i.scdn.co/image/ab6761610000e5eb214f3cf1cbe7139c1e26ffbb' },
    { id: '2', name: 'Taylor Swift', image: 'https://i.scdn.co/image/ab6761610000e5eb5a00969a4698c3132a15fbb0' },
    { id: '3', name: 'Drake', image: 'https://i.scdn.co/image/ab6761610000e5eb4293385d324db8558179afd9' },
    { id: '4', name: 'Arijit Singh', image: 'https://i.scdn.co/image/ab6761610000e5eb0261696c5df3be99da6ed3f3' },
    { id: '5', name: 'Pritam', image: 'https://i.scdn.co/image/ab6761610000e5ebcb6926f44f620555ba444fca' },
    { id: '6', name: 'Kendrick Lamar', image: 'https://i.scdn.co/image/ab6761610000e5eb436b52f742f365dee2c71287' },
    { id: '7', name: 'Bad Bunny', image: 'https://i.scdn.co/image/ab6761610000e5eb9e3ceaeb6cb242d8d637852b' },
    { id: '8', name: 'Billie Eilish', image: 'https://i.scdn.co/image/ab6761610000e5ebd8b9980db67272cb4d2c3daf' },
    { id: '9', name: 'Ed Sheeran', image: 'https://i.scdn.co/image/ab6761610000e5eb12a2ef08d00dd7451a6dbed6' },
    { id: '10', name: 'Justin Bieber', image: 'https://i.scdn.co/image/ab6761610000e5eb8ae7f2aaa9817a704a87ea36' },
    { id: '11', name: 'Rihanna', image: 'https://i.scdn.co/image/ab6761610000e5eb018e698822d56a2ff76ba505' },
    { id: '12', name: 'Dua Lipa', image: 'https://i.scdn.co/image/ab6761610000e5eb2d59392e2de39487042a98f1' },
    { id: '13', name: 'Bruno Mars', image: 'https://i.scdn.co/image/ab6761610000e5eb4051ac1ed06222c5ed4f6ec2' },
    { id: '14', name: 'Post Malone', image: 'https://i.scdn.co/image/ab6761610000e5eb3e85e486ea3bdcc80a823527' },
    { id: '15', name: 'Shreya Ghoshal', image: 'https://i.scdn.co/image/ab6761610000e5ebcc755ee60a7e6f66de94e1d1' },
]

export default function OnboardingScreen() {
    const [step, setStep] = useState(0)
    const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set())
    const { completeOnboarding } = useOnboardingStore()

    const handleNext = () => {
        if (step < 2) {
            setStep(step + 1)
        }
    }

    const handleFinish = () => {
        if (selectedArtists.size >= 5) {
            completeOnboarding(Array.from(selectedArtists))
        }
    }

    const toggleArtist = (name: string) => {
        const newSet = new Set(selectedArtists)
        if (newSet.has(name)) {
            newSet.delete(name)
        } else {
            newSet.add(name)
        }
        setSelectedArtists(newSet)
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

            <View style={styles.content}>
                {step === 0 && (
                    <View style={styles.slide}>
                        <Text style={styles.slideEmoji}>✨</Text>
                        <Text style={styles.slideTitle}>Welcome to Cosmo</Text>
                        <Text style={styles.slideDesc}>
                            Your personal musical universe. Built for speed, quality, and limitless discovery.
                        </Text>
                    </View>
                )}

                {step === 1 && (
                    <View style={styles.slide}>
                        <Text style={styles.slideEmoji}>🤖</Text>
                        <Text style={styles.slideTitle}>Powered by AI</Text>
                        <Text style={styles.slideDesc}>
                            Cosmo uses Gemini to analyze your taste and InnerTube to instantly stream any track on the planet. Zero cost, zero ads.
                        </Text>
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.slideFull}>
                        <View style={styles.headerRow}>
                            <Text style={styles.slideTitleSmall}>Pick 5 or more</Text>
                            <Text style={styles.selectionCount}>
                                {selectedArtists.size}/5
                            </Text>
                        </View>
                        <Text style={styles.slideDescSmall}>
                            We'll use this to seed your initial recommendations.
                        </Text>

                        <ScrollView contentContainerStyle={styles.grid}>
                            {POPULAR_ARTISTS.map(artist => {
                                const isSelected = selectedArtists.has(artist.name)
                                return (
                                    <TouchableOpacity
                                        key={artist.id}
                                        style={[
                                            styles.artistCard,
                                            isSelected && styles.artistCardSelected
                                        ]}
                                        onPress={() => toggleArtist(artist.name)}
                                        activeOpacity={0.8}
                                    >
                                        <Image
                                            source={{ uri: artist.image }}
                                            style={styles.artistImage}
                                        />
                                        <View style={styles.artistOverlay} />
                                        {isSelected && (
                                            <View style={styles.checkBadge}>
                                                <Text style={styles.checkIcon}>✓</Text>
                                            </View>
                                        )}
                                        <Text style={styles.artistName} numberOfLines={1}>
                                            {artist.name}
                                        </Text>
                                    </TouchableOpacity>
                                )
                            })}
                        </ScrollView>
                    </View>
                )}
            </View>

            <View style={styles.footer}>
                <View style={styles.dots}>
                    <View style={[styles.dot, step === 0 && styles.dotActive]} />
                    <View style={[styles.dot, step === 1 && styles.dotActive]} />
                    <View style={[styles.dot, step === 2 && styles.dotActive]} />
                </View>

                {step < 2 ? (
                    <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                        <Text style={styles.nextBtnText}>Next</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[styles.finishBtn, selectedArtists.size < 5 && styles.finishBtnDisabled]}
                        onPress={handleFinish}
                        disabled={selectedArtists.size < 5}
                    >
                        <Text style={styles.finishBtnText}>Let's go</Text>
                    </TouchableOpacity>
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
    content: {
        flex: 1,
    },
    slide: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    slideFull: {
        flex: 1,
        paddingTop: 40,
    },
    slideEmoji: {
        fontSize: 80,
        marginBottom: 32,
    },
    slideTitle: {
        color: '#fff',
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 16,
        textAlign: 'center',
    },
    slideDesc: {
        color: '#aaa',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    slideTitleSmall: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '800',
    },
    selectionCount: {
        color: '#1DB954',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    slideDescSmall: {
        color: '#aaa',
        fontSize: 14,
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 16,
        justifyContent: 'space-between',
        paddingBottom: 40,
    },
    artistCard: {
        width: (SCREEN_WIDTH - 48) / 3, // 3 columns
        height: (SCREEN_WIDTH - 48) / 3,
        marginBottom: 16,
        borderRadius: 100, // circular
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    artistCardSelected: {
        borderColor: '#1DB954',
    },
    artistImage: {
        width: '100%',
        height: '100%',
    },
    artistOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    artistName: {
        position: 'absolute',
        bottom: 12,
        left: 8,
        right: 8,
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkIcon: {
        color: '#000',
        fontSize: 14,
        fontWeight: '800',
    },
    footer: {
        paddingHorizontal: 32,
        paddingBottom: 32,
        paddingTop: 16,
        alignItems: 'center',
    },
    dots: {
        flexDirection: 'row',
        marginBottom: 24,
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#333',
    },
    dotActive: {
        backgroundColor: '#fff',
        width: 16,
    },
    nextBtn: {
        width: '100%',
        height: 56,
        backgroundColor: '#fff',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextBtnText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
    finishBtn: {
        width: '100%',
        height: 56,
        backgroundColor: '#1DB954',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    finishBtnDisabled: {
        backgroundColor: '#16572a',
    },
    finishBtnText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
})
