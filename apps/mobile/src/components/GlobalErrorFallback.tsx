import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import type { FallbackProps } from 'react-error-boundary'

import Ionicons from '@expo/vector-icons/Ionicons'

/**
 * Fallback UI rendered when the global ErrorBoundary catches an unhandled
 * React error. Shows a cosmic-themed crash screen with error details and
 * a glowing "Try Again" button that resets the boundary.
 */
export default function GlobalErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    return (
        <View style={styles.container}>
            {/* Cosmic icon */}
            <Ionicons name="planet" size={64} color="#1DB954" style={{ marginBottom: 16 }} />

            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
                Cosmo hit an unexpected snag. You can try again, and things should be back to normal.
            </Text>

            {/* Error detail card */}
            <View style={styles.errorCard}>
                <Text style={styles.errorLabel}>Error</Text>
                <Text style={styles.errorDetail} numberOfLines={6}>
                    {error instanceof Error ? error.message : String(error)}
                </Text>
            </View>

            {/* Try Again CTA */}
            <TouchableOpacity
                style={styles.button}
                onPress={resetErrorBoundary}
                activeOpacity={0.8}
            >
                <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingTop: Platform.OS === 'android' ? 40 : 0,
    },
    emoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    title: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '800',
        marginBottom: 12,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    message: {
        color: '#888',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 28,
    },
    errorCard: {
        width: '100%',
        backgroundColor: '#141414',
        borderRadius: 14,
        padding: 16,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#1e1e1e',
    },
    errorLabel: {
        color: '#ff6b6b',
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    errorDetail: {
        color: '#666',
        fontSize: 13,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        lineHeight: 20,
    },
    button: {
        backgroundColor: '#1DB954',
        paddingHorizontal: 40,
        paddingVertical: 16,
        borderRadius: 30,
        // Glow effect
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 8,
    },
    buttonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
})
