import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import type { ViewStyle, StyleProp } from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
} from 'react-native-reanimated'

interface SkeletonProps {
    /** Width of the skeleton block */
    width: number | `${number}%`
    /** Height of the skeleton block */
    height: number
    /** Border radius (default 8) */
    borderRadius?: number
    /** Optional style overrides */
    style?: StyleProp<ViewStyle>
}

/**
 * A pulsing skeleton placeholder that smoothly oscillates its opacity
 * using Reanimated for native-thread performance.
 *
 * Usage:
 * ```tsx
 * <Skeleton width={130} height={130} borderRadius={12} />
 * ```
 */
export default function Skeleton({
    width,
    height,
    borderRadius = 8,
    style,
}: SkeletonProps) {
    const opacity = useSharedValue(0.15)

    useEffect(() => {
        opacity.value = withRepeat(
            withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
            -1,   // infinite
            true,  // reverse each cycle
        )
    }, [])

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }))

    return (
        <Animated.View
            style={[
                {
                    width: width as any,
                    height,
                    borderRadius,
                    backgroundColor: '#2a2a2a',
                },
                animatedStyle,
                style,
            ]}
        />
    )
}

// Pre-built skeleton layouts for common patterns
export function TrackCardSkeleton({ cardWidth = 130 }: { cardWidth?: number }) {
    return (
        <View style={[skeletonStyles.trackCard, { width: cardWidth }]}>
            <Skeleton width={cardWidth} height={cardWidth} borderRadius={12} />
            <Skeleton width={cardWidth * 0.77} height={10} style={{ marginTop: 10 }} />
            <Skeleton width={cardWidth * 0.54} height={10} style={{ marginTop: 6 }} />
        </View>
    )
}

export function TrackRowSkeleton() {
    return (
        <View style={skeletonStyles.trackRow}>
            <Skeleton width={48} height={48} borderRadius={8} />
            <View style={skeletonStyles.trackRowText}>
                <Skeleton width={160} height={12} />
                <Skeleton width={100} height={10} style={{ marginTop: 6 }} />
            </View>
        </View>
    )
}

const skeletonStyles = StyleSheet.create({
    trackCard: {
        overflow: 'hidden',
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    trackRowText: {
        marginLeft: 12,
        flex: 1,
    },
})
