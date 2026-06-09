import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
    baseURL: process.env.EXPO_PUBLIC_API_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json'
    },
})

// request interceptor 
api.interceptors.request.use(async (config) => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`
    }
    return config
})

// response interceptor
api.interceptors.response.use(
    (response) => response,

    async (error) => {
        if (error.response?.status === 401) {
            await supabase.auth.signOut()
        }
        return Promise.reject(error)
    }
)

export default api