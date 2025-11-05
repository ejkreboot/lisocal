import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

interface SyncStatusRequest {
    calendarId: string
    forceSync?: boolean
}

export const POST: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }

    try {
        const { calendarId, forceSync = false }: SyncStatusRequest = await request.json()
        
        if (!calendarId) {
            throw error(400, 'Calendar ID is required')
        }

        // Verify user owns this calendar
        const { data: calendar, error: calendarError } = await supabaseAdmin
            .from('calendars')
            .select('id')
            .eq('id', calendarId)
            .eq('user_id', locals.user.id)
            .limit(1)
            .single()

        if (calendarError || !calendar) {
            throw error(404, 'Calendar not found')
        }

        // Get unique external calendar URLs from events
        const { data: externalUrls, error: urlsError } = await supabaseAdmin
            .from('events')
            .select('external_calendar_url')
            .eq('calendar_id', calendarId)
            .not('external_calendar_url', 'is', null)

        if (urlsError) {
            console.error('Error fetching external URLs:', urlsError)
            throw error(500, 'Failed to fetch external calendars')
        }

        // Get unique URLs
        const uniqueUrls = [...new Set(
            externalUrls
                ?.map(e => e.external_calendar_url!)
                .filter(Boolean) || []
        )]

        if (uniqueUrls.length === 0) {
            return json({ calendarsToSync: [] })
        }

        // Get or create sync metadata for each URL
        const calendarsToSync = []

        for (const url of uniqueUrls) {
            // Check existing sync metadata
            let { data: syncData, error: syncError } = await supabaseAdmin
                .from('external_calendar_sync')
                .select('*')
                .eq('calendar_id', calendarId)
                .eq('external_url', url)
                .limit(1)
                .single()

            if (syncError && syncError.code !== 'PGRST116') { // PGRST116 = no rows returned
                console.error('Error fetching sync metadata:', syncError)
                continue
            }

            if (!syncData) {
                // Create new sync metadata record
                const { data: newSyncData, error: createError } = await supabaseAdmin
                    .from('external_calendar_sync')
                    .insert({
                        calendar_id: calendarId,
                        external_url: url,
                        sync_interval_minutes: 60 // Default 1 hour
                    })
                    .select()
                    .single()

                if (createError) {
                    console.error('Error creating sync metadata:', createError)
                    continue
                }

                syncData = newSyncData
            }

            // Determine if sync is needed
            const needsSync = forceSync || shouldSync(syncData)

            if (needsSync) {
                calendarsToSync.push({
                    external_url: url,
                    etag: syncData.etag,
                    last_modified: syncData.last_modified,
                    last_synced: syncData.last_synced,
                    sync_interval_minutes: syncData.sync_interval_minutes
                })
            }
        }

        return json({ calendarsToSync })

    } catch (err: any) {
        console.error('Sync status error:', err)
        
        // Re-throw SvelteKit errors
        if (err.status) {
            throw err
        }
        
        throw error(500, 'Failed to check sync status')
    }
}

/**
 * Determine if a calendar should be synced based on its metadata
 */
function shouldSync(syncData: any): boolean {
    if (!syncData.last_synced) {
        return true // Never synced
    }

    const lastSynced = new Date(syncData.last_synced)
    const now = new Date()
    const intervalMs = (syncData.sync_interval_minutes || 60) * 60 * 1000

    return (now.getTime() - lastSynced.getTime()) >= intervalMs
}