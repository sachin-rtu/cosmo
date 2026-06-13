import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import Feather from '@expo/vector-icons/Feather'

import HomeScreen from '../screens/HomeScreen'
import SearchScreen from '../screens/SearchScreen'
import LibraryScreen from '../screens/LibraryScreen'
import NowPlayingScreen from '../screens/NowPlayingScreen'
import QueueScreen from '../screens/QueueScreen'
import MoodScreen from '../screens/MoodScreen'
import InsightsScreen from '../screens/InsightsScreen'
import LoginScreen from '../screens/LoginScreen'
import SignupScreen from '../screens/SignupScreen'
import PlaylistsScreen from '../screens/PlaylistsScreen'
import PlaylistDetailScreen from '../screens/PlaylistDetailScreen'
import OnboardingScreen from '../screens/OnboardingScreen'
import MiniPlayer from '../components/MiniPlayer'

import { useAuthStore } from '../store/authStore'
import { useOnboardingStore } from '../store/onboardingStore'

// ─── Route definitions ────────────────────────────────────────────────────────
export type TabStackParams = {
    HomeTab: undefined
    SearchTab: undefined
    LibraryTab: undefined
}

export type RootStackParams = {
    Tabs: undefined
    NowPlaying: undefined
    Queue: undefined
    Mood: undefined
    Insights: undefined
    Playlists: undefined
    PlaylistDetail: { playlist: any }
    Onboarding: undefined
    Login: undefined
    Signup: undefined
}

const Stack = createNativeStackNavigator<RootStackParams>()
const Tab = createBottomTabNavigator<TabStackParams>()

function TabNavigator() {
    return (
        <>
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    headerShown: false,
                    tabBarIcon: ({ color, size }) => {
                        let iconName: any = 'home'
                        if (route.name === 'HomeTab') iconName = 'home'
                        else if (route.name === 'SearchTab') iconName = 'search'
                        else if (route.name === 'LibraryTab') iconName = 'book'
                        return <Feather name={iconName} size={24} color={color} />
                    },
                    tabBarActiveTintColor: '#fff',
                    tabBarInactiveTintColor: '#666',
                    tabBarStyle: {
                        backgroundColor: '#0a0a0a',
                        borderTopWidth: 0,
                        elevation: 0,
                        height: 60,
                        paddingBottom: 8,
                        paddingTop: 8,
                    },
                    tabBarShowLabel: false,
                })}
            >
                <Tab.Screen name="HomeTab" component={HomeScreen} />
                <Tab.Screen name="SearchTab" component={SearchScreen} />
                <Tab.Screen name="LibraryTab" component={LibraryScreen} />
            </Tab.Navigator>
            
            {/* Global MiniPlayer floats over all tabs */}
            <MiniPlayer />
        </>
    )
}

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
                    headerShown: false,
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
                        <Stack.Screen name="Tabs" component={TabNavigator} options={{ animation: 'fade' }} />
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