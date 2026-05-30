import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import TrackPlayer, { PlayerCommand } from '@rntp/player'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlaybackService } from './src/services/trackPlayerService'
import Navigation from './src/navigation'

const queryClient = new QueryClient()
TrackPlayer.registerBackgroundEventHandler(() => PlaybackService)

export default function App() {
  const [playerReady, setPlayerReady] = useState(false)

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
      }
    }
    setup()
  }, [])

  if (!playerReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1DB954" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <Navigation />
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