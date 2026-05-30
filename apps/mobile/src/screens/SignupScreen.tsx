import React, { useState } from 'react'
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    SafeAreaView, StatusBar, ActivityIndicator, Alert,
    KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../services/supabase'

export default function SignupScreen() {
    const navigation = useNavigation<any>()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSignup = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter email and password')
            return
        }

        setLoading(true)
        const { error } = await supabase.auth.signUp({
            email,
            password,
        })
        setLoading(false)

        if (error) {
            Alert.alert('Signup Failed', error.message)
        } else {
            Alert.alert('Success', 'Please check your email for the confirmation link.')
            navigation.goBack()
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
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.backBtn}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <Text style={styles.backArrow}>←</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.form}>
                        <Text style={styles.title}>Create Account</Text>
                        <Text style={styles.subtitle}>Join Cosmo and start your musical journey.</Text>

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
                            onPress={handleSignup}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text style={styles.primaryBtnText}>Sign Up</Text>
                            )}
                        </TouchableOpacity>

                    </View>

                    <TouchableOpacity style={styles.footer} onPress={() => navigation.goBack()}>
                        <Text style={styles.footerText}>
                            Already have an account? <Text style={styles.footerLink}>Log in</Text>
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
        position: 'absolute',
        top: 20,
        left: 16,
    },
    backBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    backArrow: {
        color: '#fff',
        fontSize: 24,
    },
    form: {
        width: '100%',
        marginTop: 60,
    },
    title: {
        color: '#fff',
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 8,
    },
    subtitle: {
        color: '#888',
        fontSize: 16,
        marginBottom: 32,
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
