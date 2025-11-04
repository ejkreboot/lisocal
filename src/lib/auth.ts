import { writable } from 'svelte/store'
import { supabase } from './supabase.js'
import type { User, Session } from '@supabase/supabase-js'

// Create reactive stores for auth state
export const user = writable<User | null>(null)
export const session = writable<Session | null>(null)
export const loading = writable(true)

// Initialize auth state and listen for changes
supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
    session.set(initialSession)
    user.set(initialSession?.user ?? null)
    loading.set(false)
})

supabase.auth.onAuthStateChange((_event, newSession) => {
    session.set(newSession)
    user.set(newSession?.user ?? null)
    loading.set(false)
})

// Sign out function
export async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (!error) {
        user.set(null)
        session.set(null)
    }
    return { error }
}