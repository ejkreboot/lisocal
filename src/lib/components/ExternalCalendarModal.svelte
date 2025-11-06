<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import { getExternalCalendarColor } from '$lib/external-calendar-colors.js'
    
    export let showModal = false
    
    const dispatch = createEventDispatcher()
    
    interface ExternalCalendar {
        url: string
        eventCount: number
        name: string
    }
    
    let externalCalendars: ExternalCalendar[] = []
    let isLoading = false
    let isImporting = false
    let isSyncing = false
    let importUrl = ''
    let message = ''
    let messageType: 'success' | 'error' | '' = ''
    
    // Load external calendars when modal opens
    $: if (showModal) {
        loadExternalCalendars()
    }
    
    async function loadExternalCalendars() {
        isLoading = true
        try {
            const response = await fetch('/api/calendar/remove')
            const data = await response.json()
            
            if (response.ok) {
                externalCalendars = data.calendars || []
            } else {
                showMessage('Failed to load external calendars', 'error')
            }
        } catch (error) {
            console.error('Error loading external calendars:', error)
            showMessage('Failed to load external calendars', 'error')
        } finally {
            isLoading = false
        }
    }
    
    async function importCalendar() {
        if (!importUrl.trim()) {
            showMessage('Please enter a calendar URL', 'error')
            return
        }
        
        // Validate URL format
        try {
            new URL(importUrl)
        } catch {
            showMessage('Please enter a valid URL', 'error')
            return
        }
        
        isImporting = true
        try {
            const response = await fetch('/api/calendar/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: importUrl.trim()
                })
            })
            
            const data = await response.json()
            
            if (response.ok) {
                showMessage(data.message, 'success')
                // Clear form
                importUrl = ''
                // Reload calendars and notify parent
                await loadExternalCalendars()
                dispatch('calendarsChanged')
            } else {
                showMessage(data.message || 'Failed to import calendar', 'error')
            }
        } catch (error) {
            console.error('Error importing calendar:', error)
            showMessage('Failed to import calendar', 'error')
        } finally {
            isImporting = false
        }
    }
    
    async function syncCalendar(url: string) {
        // Re-import the calendar (same as importing again)
        isSyncing = true
        try {
            const response = await fetch('/api/calendar/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            })
            
            const data = await response.json()
            
            if (response.ok) {
                showMessage(data.message, 'success')
                await loadExternalCalendars()
                dispatch('calendarsChanged')
            } else {
                showMessage(data.message || 'Failed to sync calendar', 'error')
            }
        } catch (error) {
            console.error('Error syncing calendar:', error)
            showMessage('Failed to sync calendar', 'error')
        } finally {
            isSyncing = false
        }
    }
    
    async function removeCalendar(url: string) {
        if (!confirm('Are you sure you want to remove this calendar? All imported events will be deleted.')) {
            return
        }
        
        try {
            const response = await fetch('/api/calendar/remove', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            })
            
            const data = await response.json()
            
            if (response.ok) {
                showMessage(data.message, 'success')
                await loadExternalCalendars()
                dispatch('calendarsChanged')
            } else {
                showMessage('Failed to remove calendar', 'error')
            }
        } catch (error) {
            console.error('Error removing calendar:', error)
            showMessage('Failed to remove calendar', 'error')
        }
    }
    
    function showMessage(text: string, type: 'success' | 'error') {
        message = text
        messageType = type
        setTimeout(() => {
            message = ''
            messageType = ''
        }, 5000)
    }
    
    function closeModal() {
        showModal = false
        message = ''
        messageType = ''
        dispatch('close')
    }
    
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            closeModal()
        }
    }
    
    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString()
    }
    
    function getDomainFromUrl(url: string) {
        try {
            return new URL(url).hostname
        } catch {
            return url
        }
    }
    
    function getCalendarColor(url: string) {
        return getExternalCalendarColor(url)
    }
</script>

{#if showModal}
    <!-- Modal backdrop -->
    <div 
        class="modal-backdrop" 
        on:click={closeModal}
        on:keydown={handleKeydown}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <!-- Modal content -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="modal-content" on:click|stopPropagation>
            <!-- Header -->
            <div class="modal-header">
                <h2>External Calendars</h2>
                <button class="close-button" on:click={closeModal} title="Close">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            
            <!-- Message -->
            {#if message}
                <div class="message" class:success={messageType === 'success'} class:error={messageType === 'error'}>
                    {message}
                </div>
            {/if}
            
            <!-- Import new calendar section -->
            <div class="section">
                <h3>Import New Calendar</h3>
                <div class="import-form">
                    <div class="input-group">
                        <label for="calendar-url">Calendar URL (.ics)</label>
                        <input
                            id="calendar-url"
                            type="url"
                            bind:value={importUrl}
                            placeholder="https://example.com/calendar.ics"
                            disabled={isImporting}
                        />
                    </div>
                    

                    
                    <button 
                        class="import-button" 
                        on:click={importCalendar}
                        disabled={isImporting || !importUrl.trim()}
                    >
                        {#if isImporting}
                            <span class="spinner"></span>
                            Importing...
                        {:else}
                            Import Calendar
                        {/if}
                    </button>
                </div>
            </div>
            
            <!-- Existing calendars section -->
            <div class="section">
                <div class="section-header">
                    <h3>Imported Calendars</h3>
                    {#if externalCalendars.length > 0}
                        <button 
                            class="sync-all-button"
                            on:click={() => {
                                externalCalendars.forEach(cal => syncCalendar(cal.url))
                            }}
                            disabled={isSyncing}
                            title="Sync all calendars"
                        >
                            {#if isSyncing}
                                <span class="spinner small"></span>
                            {:else}
                                <span class="material-symbols-outlined">sync</span>
                            {/if}
                            Sync All
                        </button>
                    {/if}
                </div>
                
                {#if isLoading}
                    <div class="loading">
                        <span class="spinner"></span>
                        Loading calendars...
                    </div>
                {:else if externalCalendars.length === 0}
                    <div class="empty-state">
                        <p>No external calendars imported yet.</p>
                        <p>Add a calendar URL above to get started.</p>
                    </div>
                {:else}
                    <div class="calendar-list">
                        {#each externalCalendars as calendar}
                            <div class="calendar-item">
                                <div class="calendar-color-indicator" 
                                     style="background-color: {getCalendarColor(calendar.url).bg}"
                                     title="Calendar color"
                                     role="img"
                                     aria-label="Calendar color indicator">
                                </div>
                                <div class="calendar-info">
                                    <div class="calendar-name">{calendar.name}</div>
                                    <div class="calendar-details">
                                        <span class="event-count">{calendar.eventCount} events</span>
                                        <span class="calendar-url">{getDomainFromUrl(calendar.url)}</span>
                                    </div>
                                </div>
                                
                                <div class="calendar-actions">
                                    <button 
                                        class="sync-button"
                                        on:click={() => syncCalendar(calendar.url)}
                                        disabled={isSyncing}
                                        title="Sync this calendar"
                                    >
                                        {#if isSyncing}
                                            <span class="spinner small"></span>
                                        {:else}
                                            <span class="material-symbols-outlined">sync</span>
                                        {/if}
                                    </button>
                                    
                                    <button 
                                        class="remove-button"
                                        on:click={() => removeCalendar(calendar.url)}
                                        title="Remove this calendar"
                                    >
                                        <span class="material-symbols-outlined">delete</span>
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    /* Using global modal styles - customizations only */
    .modal-content {
        max-width: 600px;
        overflow-y: auto;
        box-shadow: var(--shadow-xl);
    }
    
    .modal-header {
        padding: var(--space-6) var(--space-6) 0;
        margin-bottom: var(--space-6);
    }
    
    .modal-header h2 {
        font-size: 24px;
        color: var(--gray-800);
    }
    
    .close-button:hover {
        background: #f3f4f6;
        color: #374151;
    }
    
    .close-button .material-symbols-outlined {
        font-size: 20px;
    }
    
    .message {
        margin: 0 var(--space-6) var(--space-5);
    }
    
    .section {
        padding: 0 var(--space-6) var(--space-6);
        border-bottom: 1px solid #f0f0f0;
    }
    
    .section:last-child {
        border-bottom: none;
    }
    
    .section h3 {
        margin: 0 0 var(--space-4) 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--gray-800);
    }
    
    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-4);
    }
    
    .import-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
    }
    
    .input-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    
    label {
        font-size: 14px;
        font-weight: 500;
        color: var(--gray-900);
    }
    
    input[type="url"] {
        /* Uses global .input styles with custom sizing */
        padding: var(--space-3);
    }
    
    .import-button {
        background: #2563eb;
        color: var(--white);
        border: none;
        padding: var(--space-3) var(--space-6);
        border-radius: var(--radius-lg);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        transition: background-color var(--transition-normal);
    }
    
    .import-button:hover:not(:disabled) {
        background: #1d4ed8;
    }
    
    .import-button:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }
    
    .sync-all-button {
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: all 0.2s;
    }
    
    .sync-all-button:hover:not(:disabled) {
        background: #e5e7eb;
    }
    
    .sync-all-button .material-symbols-outlined {
        font-size: 14px;
    }
    
    .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 32px;
        color: #6b7280;
    }
    
    .empty-state {
        text-align: center;
        padding: 32px;
        color: #6b7280;
    }
    
    .empty-state p {
        margin: 0 0 8px 0;
    }
    
    .calendar-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    
    .calendar-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
    }
    
    .calendar-color-indicator {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        flex-shrink: 0;
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    
    .calendar-info {
        flex: 1;
        min-width: 0; /* Allow text truncation */
    }
    
    .calendar-name {
        font-weight: 500;
        color: #1f2937;
        margin-bottom: 4px;
    }
    
    .calendar-details {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: #6b7280;
    }
    
    .calendar-url {
        color: #9ca3af;
        font-size: 11px;
    }
    
    .calendar-actions {
        display: flex;
        gap: 8px;
    }
    
    .sync-button,
    .remove-button {
        background: none;
        border: 1px solid #d1d5db;
        padding: 8px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        transition: all 0.2s;
    }
    
    .sync-button:hover:not(:disabled) {
        background: #e0f2fe;
        border-color: #0ea5e9;
    }
    
    .remove-button:hover {
        background: #fef2f2;
        border-color: #f87171;
    }
    
    .sync-button .material-symbols-outlined,
    .remove-button .material-symbols-outlined {
        font-size: 16px;
    }
    
    .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #f3f4f6;
        border-top: 2px solid #2563eb;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    .spinner.small {
        width: 12px;
        height: 12px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    /* Mobile responsive */
    @media (max-width: 640px) {
        .modal-backdrop {
            padding: 12px;
        }
        
        .modal-header {
            padding: 16px 16px 0;
        }
        
        .section {
            padding: 0 16px 20px;
        }
        

        
        .calendar-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
        }
        
        .calendar-actions {
            align-self: flex-end;
        }
    }
</style>