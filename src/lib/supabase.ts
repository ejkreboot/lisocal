import { createBrowserClient } from '@supabase/ssr'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

if (!PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.PUBLIC_SUPABASE_URL')
}
if (!PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Missing env.PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)

// Database type definitions
export interface Database {
    public: {
        Tables: {
            users: {
                Row: {
                    id: string
                    email: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    email: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    created_at?: string
                    updated_at?: string
                }
            }
            calendars: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    description: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    description?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    description?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            events: {
                Row: {
                    id: string
                    calendar_id: string
                    title: string
                    description: string | null
                    start_date: string
                    end_date: string | null
                    start_time: string | null
                    end_time: string | null
                    is_all_day: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    calendar_id: string
                    title: string
                    description?: string | null
                    start_date: string
                    end_date?: string | null
                    start_time?: string | null
                    end_time?: string | null
                    is_all_day?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    calendar_id?: string
                    title?: string
                    description?: string | null
                    start_date?: string
                    end_date?: string | null
                    start_time?: string | null
                    end_time?: string | null
                    is_all_day?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            shared_links: {
                Row: {
                    id: string
                    calendar_id: string
                    share_token: string
                    permissions: 'view' | 'edit'
                    created_at: string
                    expires_at: string | null
                }
                Insert: {
                    id?: string
                    calendar_id: string
                    share_token?: string
                    permissions?: 'view' | 'edit'
                    created_at?: string
                    expires_at?: string | null
                }
                Update: {
                    id?: string
                    calendar_id?: string
                    share_token?: string
                    permissions?: 'view' | 'edit'
                    created_at?: string
                    expires_at?: string | null
                }
            }
        }
    }
}