import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HomeScreen from '../screens/HomeScreen'
import NowPlayingScreen from '../screens/NowPlayingScreen'
import QueueScreen from '../screens/QueueScreen'
import MoodScreen from '../screens/MoodScreen'
import InsightsScreen from '../screens/InsightsScreen'
import LoginScreen from '../screens/LoginScreen'
import SignupScreen from '../screens/SignupScreen'
import PlaylistsScreen from '../screens/PlaylistsScreen'
import PlaylistDetailScreen from '../screens/PlaylistDetailScreen'
import OnboardingScreen from '../screens/OnboardingScreen'
import { useAuthStore } from '../store/authStore'
import { useOnboardingStore } from '../store/onboardingStore'
import { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'

// ─── Route definitions ────────────────────────────────────────────────────────
// This is a TypeScript map of every screen name → what params it accepts.
// If you navigate to a screen with wrong params, TypeScript catches it.
export type RootStackParams = {
    Home: undefined          // no params needed
    NowPlaying: undefined          // no params — reads from Zustand store
    Queue: undefined               // no params — reads from Zustand store
    Mood: undefined
    Insights: undefined
    Playlists: undefined
    PlaylistDetail: { playlist: any }
    Onboarding: undefined
    Login: undefined
    Signup: undefined
}

const Stack = createNativeStackNavigator<RootStackParams>()

export default function Navigation() {
    const { session, isGuest, initialized, initialize } = useAuthStore()
    const { hasOnboarded } = useOnboardingStore()

    useEffect(() => {
        initialize()
    }, [])

    if (!initialized) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color="#1DB954" />
            </View>
        )
    }

    const isAuthenticated = !!session || isGuest

    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,  // we build our own headers
                    contentStyle: { backgroundColor: '#0a0a0a' },
                    animation: 'slide_from_bottom', // NowPlaying slides up
                }}
            >
                {!isAuthenticated ? (
                    // ── Auth Stack ──
                    <>
                        <Stack.Screen name="Login" component={LoginScreen} />
                        <Stack.Screen name="Signup" component={SignupScreen} />
                    </>
                ) : !hasOnboarded ? (
                    // ── Onboarding Stack ──
                    <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                ) : (
                    // ── Main Stack ──
                    <>
                        <Stack.Screen name="Home" component={HomeScreen} options={{ animation: 'fade' }} />
                        <Stack.Screen name="NowPlaying" component={NowPlayingScreen} />
                        <Stack.Screen name="Queue" component={QueueScreen} />
                        <Stack.Screen name="Mood" component={MoodScreen} />
                        <Stack.Screen name="Insights" component={InsightsScreen} />
                        <Stack.Screen name="Playlists" component={PlaylistsScreen} />
                        <Stack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    )
}

const styles = StyleSheet.create({
    loading: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        justifyContent: 'center',
        alignItems: 'center',
    },
})