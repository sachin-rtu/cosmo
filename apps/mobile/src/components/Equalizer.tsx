import React, { useEffect, useState, useRef } from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler'
import Animated, {
    useSharedValue,
    useAnimatedGestureHandler,
    useAnimatedStyle,
    runOnJS,
    withSpring,
    interpolate,
    Extrapolate
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { createMMKV } from 'react-native-mmkv'
import { AudioContext } from 'react-native-audio-api'
import { BlurView } from 'expo-blur'

const eqStorage = createMMKV({ id: 'cosmo-eq' })

const BANDS = [60, 230, 910, 3600, 14000]
const MIN_GAIN = -10
const MAX_GAIN = 10
const SLIDER_HEIGHT = 150

// Singleton AudioContext and Nodes
let audioCtx: any = null
let sourceNode: any = null
let filterNodes: any[] = []

function initAudio() {
    if (audioCtx) return

    audioCtx = new AudioContext()
    
    // Bridge with RNTP: MediaElementAudioSourceNode
    // This is the approach recommended for react-native-audio-api to intercept RNTP
    sourceNode = audioCtx.createMediaElementSource()

    let prevNode = sourceNode

    filterNodes = BANDS.map((freq) => {
        const filter = audioCtx.createBiquadFilter()
        filter.type = 'peaking'
        filter.frequency.value = freq
        filter.Q.value = 1.0
        filter.gain.value = 0

        prevNode.connect(filter)
        prevNode = filter
        return filter
    })

    prevNode.connect(audioCtx.destination)
}

function updateGain(index: number, value: number) {
    if (filterNodes[index]) {
        filterNodes[index].gain.value = value
    }
}

interface EQSliderProps {
    index: number
    freq: number
    initialGain: number
    onGainChange: (index: number, gain: number) => void
}

const EQSlider = ({ index, freq, initialGain, onGainChange }: EQSliderProps) => {
    // Map -10 -> 10 to 0 -> SLIDER_HEIGHT
    // 0 gain is at SLIDER_HEIGHT / 2
    const initialY = interpolate(initialGain, [MAX_GAIN, MIN_GAIN], [0, SLIDER_HEIGHT])
    const translateY = useSharedValue(initialY)

    const gestureHandler = useAnimatedGestureHandler<PanGestureHandlerGestureEvent, { startY: number }>({
        onStart: (_, ctx) => {
            ctx.startY = translateY.value
        },
        onActive: (event, ctx) => {
            let newY = ctx.startY + event.translationY
            if (newY < 0) newY = 0
            if (newY > SLIDER_HEIGHT) newY = SLIDER_HEIGHT
            translateY.value = newY

            const currentGain = interpolate(newY, [0, SLIDER_HEIGHT], [MAX_GAIN, MIN_GAIN], Extrapolate.CLAMP)
            runOnJS(onGainChange)(index, currentGain)
        },
        onEnd: () => {
            // Snap nicely
        }
    })

    const thumbStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: translateY.value - 12 }], // Center the 24px thumb
        }
    })

    const fillStyle = useAnimatedStyle(() => {
        return {
            height: SLIDER_HEIGHT - translateY.value,
            backgroundColor: translateY.value < SLIDER_HEIGHT / 2 ? '#1DB954' : '#555',
        }
    })

    const formatFreq = (f: number) => f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${f}`

    // We also need a local state just to show the number
    const [displayGain, setDisplayGain] = useState(initialGain)
    useEffect(() => {
        setDisplayGain(initialGain)
    }, [initialGain])

    const handleGainChange = (i: number, g: number) => {
        setDisplayGain(g)
        onGainChange(i, g)
    }

    // A separate gesture handler for internal state? Reanimated triggers onGainChange via runOnJS.
    // We can just rely on the prop for updating text, but to avoid 60fps React state updates, 
    // we use a derived value or just show it roughly. Let's keep it simple.
    
    return (
        <View style={styles.sliderCol}>
            <Text style={styles.gainText}>{displayGain > 0 ? '+' : ''}{Math.round(displayGain)}</Text>
            
            <View style={styles.trackWrapper}>
                <PanGestureHandler onGestureEvent={gestureHandler}>
                    <Animated.View style={styles.track}>
                        <Animated.View style={[styles.trackFill, fillStyle]} />
                        <Animated.View style={[styles.thumb, thumbStyle]} />
                    </Animated.View>
                </PanGestureHandler>
                {/* Center line (0dB) */}
                <View style={styles.centerLine} pointerEvents="none" />
            </View>

            <Text style={styles.freqText}>{formatFreq(freq)}</Text>
        </View>
    )
}

export default function Equalizer() {
    const [gains, setGains] = useState<number[]>([0, 0, 0, 0, 0])

    useEffect(() => {
        initAudio()
        
        // Load saved
        const saved = eqStorage.getString('eq-settings')
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed) && parsed.length === BANDS.length) {
                    setGains(parsed)
                    parsed.forEach((g, i) => updateGain(i, g))
                }
            } catch (e) { }
        }
    }, [])

    const handleGainChange = (index: number, newGain: number) => {
        updateGain(index, newGain)
        
        // Haptics on threshold cross (e.g., passing 0)
        // Or light haptics every whole number change
        const currentWhole = Math.round(newGain)
        const prevWhole = Math.round(gains[index])
        
        if (currentWhole !== prevWhole) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }

        setGains(prev => {
            const next = [...prev]
            next[index] = newGain
            
            // Debounce save to MMKV could be done here, but doing it directly is fine for small arrays
            eqStorage.set('eq-settings', JSON.stringify(next))
            return next
        })
    }

    return (
        <BlurView intensity={70} tint="dark" style={styles.container}>
            <Text style={styles.title}>Equalizer</Text>
            
            <View style={styles.slidersRow}>
                {BANDS.map((freq, i) => (
                    <EQSlider 
                        key={freq}
                        index={i}
                        freq={freq}
                        initialGain={gains[i]}
                        onGainChange={handleGainChange}
                    />
                ))}
            </View>
        </BlurView>
    )
}

const styles = StyleSheet.create({
    container: {
        padding: 24,
        borderRadius: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
        overflow: 'hidden',
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 32,
    },
    slidersRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 10,
    },
    sliderCol: {
        alignItems: 'center',
    },
    gainText: {
        color: '#ccc',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 12,
        height: 16,
    },
    trackWrapper: {
        height: SLIDER_HEIGHT,
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    track: {
        width: 6,
        height: SLIDER_HEIGHT,
        backgroundColor: '#222',
        borderRadius: 3,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    trackFill: {
        width: 6,
        backgroundColor: '#1DB954',
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
    },
    thumb: {
        position: 'absolute',
        top: 0,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 5,
    },
    centerLine: {
        position: 'absolute',
        top: SLIDER_HEIGHT / 2 - 1,
        width: 16,
        height: 2,
        backgroundColor: '#555',
        zIndex: -1,
    },
    freqText: {
        color: '#888',
        fontSize: 12,
        marginTop: 16,
        fontWeight: '500',
    },
})
