/**
 * Auto-sync service for external calendars
 * Handles intelligent syncing of external calendars with minimal overhead
 */

export interface SyncMetadata {
    external_url: string
    etag?: string
    last_modified?: string
    last_synced: string
    sync_interval_minutes: number
}

export interface SyncResult {
    url: string
    success: boolean
    hasChanges: boolean
    error?: string
}

export class ExternalCalendarAutoSync {
    private syncPromises = new Map<string, Promise<SyncResult>>()
    
    /**
     * Check if external calendars need syncing and perform sync if needed
     * @param calendarId The user's calendar ID
     * @param forceSync Force sync regardless of intervals (default: false)
     * @returns Array of sync results
     */
    async checkAndSyncExternalCalendars(
        calendarId: string, 
        forceSync: boolean = false
    ): Promise<SyncResult[]> {
        try {
            // Get external calendars that need syncing
            const calendarsToSync = await this.getCalendarsToSync(calendarId, forceSync)
            
            if (calendarsToSync.length === 0) {
                return []
            }
            
            // Perform syncs in parallel but avoid duplicate requests
            const syncPromises = calendarsToSync.map(metadata => 
                this.syncCalendarWithDeduplication(metadata)
            )
            
            const results = await Promise.all(syncPromises)
            return results
            
        } catch (error) {
            console.error('Auto-sync error:', error)
            return []
        }
    }
    
    /**
     * Get list of external calendars that need syncing
     */
    private async getCalendarsToSync(
        calendarId: string, 
        forceSync: boolean
    ): Promise<SyncMetadata[]> {
        const response = await fetch('/api/calendar/external/sync-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calendarId, forceSync })
        })
        
        if (!response.ok) {
            throw new Error('Failed to get sync status')
        }
        
        const data = await response.json()
        return data.calendarsToSync || []
    }
    
    /**
     * Sync a calendar with deduplication to avoid multiple requests to same URL
     */
    private async syncCalendarWithDeduplication(metadata: SyncMetadata): Promise<SyncResult> {
        const url = metadata.external_url
        
        // Check if we're already syncing this URL
        if (this.syncPromises.has(url)) {
            return await this.syncPromises.get(url)!
        }
        
        // Create sync promise
        const syncPromise = this.performSync(metadata)
        this.syncPromises.set(url, syncPromise)
        
        try {
            const result = await syncPromise
            return result
        } finally {
            // Clean up the promise when done
            this.syncPromises.delete(url)
        }
    }
    
    /**
     * Perform the actual sync operation
     */
    private async performSync(metadata: SyncMetadata): Promise<SyncResult> {
        try {
            const response = await fetch('/api/calendar/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: metadata.external_url,
                    etag: metadata.etag,
                    lastModified: metadata.last_modified
                })
            })
            
            const data = await response.json()
            
            if (response.ok) {
                return {
                    url: metadata.external_url,
                    success: true,
                    hasChanges: data.hasChanges || false
                }
            } else {
                return {
                    url: metadata.external_url,
                    success: false,
                    hasChanges: false,
                    error: data.message || 'Sync failed'
                }
            }
            
        } catch (error) {
            return {
                url: metadata.external_url,
                success: false,
                hasChanges: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }
}

// Singleton instance
export const autoSync = new ExternalCalendarAutoSync()