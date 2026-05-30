import { create } from 'zustand'
import { createMMKV } from 'react-native-mmkv'
import { supabase } from '../services/supabase'
import type { Session } from '@supabase/supabase-js'

const storage = createMMKV({ id: 'cosmo-auth' })

interface AuthState {
    session: Session | null
    isGuest: boolean
    initialized: boolean
    setSession: (session: Session | null) => void
    setGuest: (guest: boolean) => void
    initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    isGuest: storage.getBoolean('isGuest') ?? false,
    initialized: false,
    setSession: (session) => set({ session }),
    setGuest: (guest) => {
        storage.set('isGuest', guest)
        set({ isGuest: guest })
    },
    initialize: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        set({ session, initialized: true })

        supabase.auth.onAuthStateChange((_event, session) => {
            set({ session })
        })
    }
}))
