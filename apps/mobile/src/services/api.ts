import axios, { AxiosError } from 'axios'
import { supabase } from './supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL
const API_TIMEOUT_MS = 60_000
const RETRY_DELAY_MS = 1_000

declare module 'axios' {
    interface AxiosRequestConfig {
        hasRetried?: boolean
    }
}

const api = axios.create({
    baseURL: API_URL,
    timeout: API_TIMEOUT_MS,
    headers: {
        'Content-Type': 'application/json'
    },
})

function isRetryableRequest(error: AxiosError): boolean {
    const method = error.config?.method?.toUpperCase()
    const isSafeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'

    return Boolean(
        isSafeMethod &&
        !error.config?.hasRetried &&
        (!error.response || error.response.status >= 500)
    )
}

function waitForRetry(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, RETRY_DELAY_MS)
    })
}

// request interceptor 
api.interceptors.request.use(async (config) => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`
    }
    return config
})

// response interceptor — one retry on 5xx / network error
api.interceptors.response.use(
    (response) => response,

    async (error: AxiosError) => {
        if (error.config && isRetryableRequest(error)) {
            error.config.hasRetried = true
            await waitForRetry()
            return api.request(error.config)
        }

        if (error.response?.status === 401) {
            await supabase.auth.signOut()
        }
        return Promise.reject(error)
    }
)

/**
 * Warm-up ping — wakes Render free-tier service (sleeps after ~15 min idle).
 * Called once on app launch. Fire-and-forget, never blocks the UI.
 */
export function warmUpApi(): void {
    if (!API_URL) return
    void api.get('/health').catch(() => {
        // Silently ignore — the next real request will retry anyway
    })
}

export default api
