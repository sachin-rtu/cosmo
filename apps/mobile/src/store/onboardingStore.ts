import { create } from 'zustand'
import { createMMKV } from 'react-native-mmkv'

const storage = createMMKV({ id: 'cosmo-onboarding' })

interface OnboardingStore {
    hasOnboarded: boolean
    seededArtists: string[]
    completeOnboarding: (artists: string[]) => void
    resetOnboarding: () => void // mainly for debugging
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
    hasOnboarded: storage.getBoolean('hasOnboarded') ?? false,
    seededArtists: (() => {
        const str = storage.getString('seededArtists')
        if (str) {
            try {
                return JSON.parse(str)
            } catch {
                return []
            }
        }
        return []
    })(),

    completeOnboarding: (artists) => {
        storage.set('hasOnboarded', true)
        storage.set('seededArtists', JSON.stringify(artists))
        set({ hasOnboarded: true, seededArtists: artists })
    },

    resetOnboarding: () => {
        storage.remove('hasOnboarded')
        storage.remove('seededArtists')
        set({ hasOnboarded: false, seededArtists: [] })
    }
}))
