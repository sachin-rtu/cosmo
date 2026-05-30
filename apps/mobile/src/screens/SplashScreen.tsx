import React, { useEffect, useRef } from 'react'
import {
    View, Text, Image, Animated,
    StyleSheet, Dimensions
} from 'react-native'
import * as ExpoSplashScreen from 'expo-splash-screen'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface Props {
    onFinish: () => void   // called when animation ends → App shows HomeScreen
}

export default function SplashScreen({ onFinish }: Props) {

    // ── Animation values ────────────────────────────────────────────────────
    // Each Animated.Value starts at 0 (invisible/small) and animates to 1
    const logoOpacity = useRef(new Animated.Value(0)).current
    const logoScale = useRef(new Animated.Value(0.7)).current
    const titleOpacity = useRef(new Animated.Value(0)).current
    const titleY = useRef(new Animated.Value(16)).current
    const taglineOpacity = useRef(new Animated.Value(0)).current
    const barWidth = useRef(new Animated.Value(0)).current
    const screenOpacity = useRef(new Animated.Value(1)).current

    useEffect(() => {
        // Hide the native expo splash screen immediately
        // Our custom animated one takes over from here
        ExpoSplashScreen.hideAsync()

        // ── Animation sequence ────────────────────────────────────────────────
        // Animated.sequence runs animations one after another
        // Animated.parallel runs animations at the same time
        // delay() creates a pause between steps
        Animated.sequence([

            // Step 1 (0ms): Logo fades in + scales up simultaneously
            Animated.parallel([
                Animated.timing(logoOpacity, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,  // runs on native thread — smooth 60fps
                }),
                Animated.spring(logoScale, {
                    toValue: 1,
                    tension: 60,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]),

            // Step 2 (400ms): App name slides up from below
            Animated.parallel([
                Animated.timing(titleOpacity, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.timing(titleY, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }),
            ]),

            // Step 3 (200ms pause): Let the title breathe
            Animated.delay(200),

            // Step 4 (300ms): Tagline fades in
            Animated.timing(taglineOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),

            // Step 5 (200ms pause): Then progress bar
            Animated.delay(200),

            // Step 6: Progress bar sweeps from left to right
            // useNativeDriver: false because we're animating width (layout property)
            Animated.timing(barWidth, {
                toValue: 120,   // matches the track width in styles
                duration: 900,
                useNativeDriver: false,
            }),

            // Step 7 (300ms pause): Hold on full screen
            Animated.delay(300),

            // Step 8: Whole screen fades out
            Animated.timing(screenOpacity, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            }),

        ]).start(() => {
            // Animation fully complete — tell App.tsx to show the real screen
            onFinish()
        })
    }, [])

    return (
        <Animated.View style={[styles.container, { opacity: screenOpacity }]}>

            {/* Logo */}
            <Animated.View style={[
                styles.logoWrapper,
                {
                    opacity: logoOpacity,
                    transform: [{ scale: logoScale }],
                }
            ]}>
                <Image
                    source={require('../../assets/logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </Animated.View>

            {/* App name */}
            <Animated.Text style={[
                styles.appName,
                {
                    opacity: titleOpacity,
                    transform: [{ translateY: titleY }],
                }
            ]}>
                COSMO
            </Animated.Text>

            {/* Tagline */}
            <Animated.Text style={[
                styles.tagline,
                { opacity: taglineOpacity }
            ]}>
                your universe of music
            </Animated.Text>

            {/* Progress bar */}
            <View style={styles.barTrack}>
                <Animated.View style={[styles.barFill, { width: barWidth }]} />
            </View>

        </Animated.View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoWrapper: {
        marginBottom: 28,
    },
    logo: {
        width: 72,
        height: 72,
    },
    appName: {
        fontSize: 28,
        fontWeight: '800',
        color: '#ffffff',
        letterSpacing: 8,
        marginBottom: 8,
    },
    tagline: {
        fontSize: 11,
        color: '#333',
        letterSpacing: 3,
        textTransform: 'uppercase',
        marginBottom: 40,
    },
    barTrack: {
        width: 120,
        height: 2,
        backgroundColor: '#111',
        borderRadius: 2,
        overflow: 'hidden',
    },
    barFill: {
        height: 2,
        backgroundColor: '#1DB954',
        borderRadius: 2,
    },
})