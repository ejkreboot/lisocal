// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient
			session: Session | null
			user: User | null
			sharedCalendar: {
				id: string
				name: string
				description: string | null
				permissions: 'view' | 'edit'
				shareToken: string
				ownerEmail: string | null
			} | null
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
