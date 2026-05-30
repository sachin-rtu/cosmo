import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface EmptyStateAction {
    label: string
    onPress: () => void
}

interface EmptyStateProps {
    icon: string
    title: string
    message: string
    /** Optional CTA button */
    action?: EmptyStateAction
}

/**
 * Reusable empty-state placeholder with a large icon, title, body text,
 * and an optional action button.
 */
export default function EmptyState({ icon, title, message, action }: EmptyStateProps) {
    return (
        <View style={styles.container}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
            {action && (
                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={action.onPress}
                    activeOpacity={0.8}
                >
                    <Text style={styles.actionText}>{action.label}</Text>
                </TouchableOpacity>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 32,
    },
    icon: {
        fontSize: 48,
        marginBottom: 16,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    message: {
        color: '#666',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    actionBtn: {
        marginTop: 24,
        backgroundColor: '#1DB954',
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 28,
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 6,
    },
    actionText: {
        color: '#000',
        fontSize: 15,
        fontWeight: '700',
    },
})
