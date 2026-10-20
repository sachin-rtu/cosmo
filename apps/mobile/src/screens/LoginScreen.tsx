import React, { useState, useEffect } from 'react'
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    SafeAreaView, StatusBar, ActivityIndicator,
    KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import Toast from 'react-native-toast-message'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '../services/supabase'
import { useAuthStore } from '../store/authStore'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

// Tells WebBrowser to complete the auth session if returning from OAuth
WebBrowser.maybeCompleteAuthSession()

export default function LoginScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<any>>()
    const { setGuest } = useAuthStore()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)

    // Deep linking listener for OAuth redirects
    useEffect(() => {
        const sub = Linking.addEventListener('url', async (event) => {
            const url = new URL(event.url)
            if (url.hash) {
                // Supabase returns access_token in the URL hash
                const params = new URLSearchParams(url.hash.substring(1))
                const accessToken = params.get('access_token')
                const refreshToken = params.get('refresh_token')
                if (accessToken && refreshToken) {
                    await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    })
                }
            }
        })
        return () => sub.remove()
    }, [])

    const handleLogin = async () => {
        if (!email || !password) {
            Toast.show({
                type: 'error',
                text1: 'Missing fields',
                text2: 'Please enter email and password',
            })
            return
        }

        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        setLoading(false)

        if (error) {
            Toast.show({
                type: 'error',
                text1: 'Login failed',
                text2: error.message,
            })
        }
    }

    const handleGoogleLogin = async () => {
        try {
            const redirectUrl = Linking.createURL('/')
            
            // Start OAuth flow on Supabase
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    skipBrowserRedirect: true, // We will handle the browser ourselves
                }
            })

            if (error) throw error

            if (data?.url) {
                // Open the browser to authenticate
                const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)
                if (result.type === 'success') {
                    // The deep linking listener above handles the redirect and session setup
                }
            }
        } catch (err: any) {
            Toast.show({
                type: 'error',
                text1: 'Google login error',
                text2: err.message,
            })
        }
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    
                    <View style={styles.header}>
                        <Text style={styles.logo}>cosmo</Text>
                        <Text style={styles.tagline}>your musical universe.</Text>
                    </View>

                    <View style={styles.form}>
                        <Text style={styles.title}>Welcome back</Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Email address"
                            placeholderTextColor="#555"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                        />

                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="#555"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />

                        <TouchableOpacity 
                            style={styles.primaryBtn} 
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text style={styles.primaryBtnText}>Log In</Text>
                            )}
                        </TouchableOpacity>

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <Text style={styles.dividerText}>or</Text>
                            <View style={styles.line} />
                        </View>

                        <TouchableOpacity style={styles.outlineBtn} onPress={handleGoogleLogin}>
                            <Text style={styles.outlineBtnText}>Continue with Google</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.ghostBtn} onPress={() => setGuest(true)}>
                            <Text style={styles.ghostBtnText}>Continue as Guest</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.footer} onPress={() => navigation.navigate('Signup')}>
                        <Text style={styles.footerText}>
                            Don't have an account? <Text style={styles.footerLink}>Sign up</Text>
                        </Text>
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 60,
    },
    logo: {
        color: '#1DB954',
        fontSize: 48,
        fontWeight: '800',
        letterSpacing: -2,
    },
    tagline: {
        color: '#888',
        fontSize: 16,
        letterSpacing: 2,
    },
    form: {
        width: '100%',
    },
    title: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 24,
    },
    input: {
        backgroundColor: '#161616',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#222',
        marginBottom: 16,
    },
    primaryBtn: {
        backgroundColor: '#1DB954',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    primaryBtnText: {
        color: '#000',
        fontSize: 18,
        fontWeight: '700',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: '#333',
    },
    dividerText: {
        color: '#666',
        paddingHorizontal: 16,
    },
    outlineBtn: {
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    outlineBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    ghostBtn: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    ghostBtnText: {
        color: '#888',
        fontSize: 16,
        fontWeight: '500',
    },
    footer: {
        marginTop: 40,
        alignItems: 'center',
    },
    footerText: {
        color: '#888',
        fontSize: 15,
    },
    footerLink: {
        color: '#1DB954',
        fontWeight: '700',
    },
})
