import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import TrackPlayer, { PlayerCommand } from '@rntp/player'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import * as ExpoSplashScreen from 'expo-splash-screen'
import { PlaybackService } from './src/services/trackPlayerService'
import SplashScreen from './src/screens/SplashScreen'
import GlobalErrorFallback from './src/components/GlobalErrorFallback'
import Navigation from './src/navigation'

ExpoSplashScreen.preventAutoHideAsync()
const queryClient = new QueryClient()
TrackPlayer.registerBackgroundEventHandler(() => PlaybackService)

export default function App() {
  const [playerReady, setPlayerReady] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    async function setup() {
      try {
        await TrackPlayer.setupPlayer()
        await TrackPlayer.setCommands({
          capabilities: [
            PlayerCommand.PlayPause,
            PlayerCommand.Next,
            PlayerCommand.Previous,
            PlayerCommand.Seek,
          ],
        })
        setPlayerReady(true)
      } catch (e) {
        console.error('RNTP setup error:', e)
        setPlayerReady(true) // even on error, proceed to app
      }
    }
    setup()
  }, [])

  if (!playerReady && !showSplash) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1DB954" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        {showSplash && (
          <SplashScreen onFinish={() => setShowSplash(false)} />
        )}
        {!showSplash && (
          <ErrorBoundary FallbackComponent={GlobalErrorFallback}>
            <Navigation />
          </ErrorBoundary>
        )}
      </QueryClientProvider>
    </GestureHandlerRootView>
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