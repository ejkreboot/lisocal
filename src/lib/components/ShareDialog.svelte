<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    
    export let isOpen = false
    export let calendarId: string | null = null
    
    const dispatch = createEventDispatcher()
    
    let permissions: 'view' | 'edit' = 'view'
    let expiresIn: number | null = null
    let isLoading = false
    let shareUrl = ''
    let existingLinks: any[] = []
    let showExisting = false
    let error = ''
    
    async function generateShareLink() {
        if (!calendarId) return
        
        isLoading = true
        error = ''
        
        try {
            const response = await fetch('/api/share', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    calendarId,
                    permissions,
                    expiresIn
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to create share link')
            }
            
            const data = await response.json()
            shareUrl = `${window.location.origin}${data.shareUrl}`
            
            // Refresh existing links
            loadExistingLinks()
            
        } catch (err) {
            console.error('Error generating share link:', err)
            error = 'Failed to generate share link. Please try again.'
        } finally {
            isLoading = false
        }
    }
    
    async function loadExistingLinks() {
        if (!calendarId) return
        
        try {
            const response = await fetch('/api/share')
            if (response.ok) {
                const data = await response.json()
                existingLinks = data.sharedLinks || []
            }
        } catch (err) {
            console.error('Error loading existing links:', err)
        }
    }
    
    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(shareUrl)
            // Could add a toast notification here
        } catch (err) {
            console.error('Error copying to clipboard:', err)
        }
    }
    
    async function copyExistingLink(shareUrl: string) {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`)
            // Could add a toast notification here
        } catch (err) {
            console.error('Error copying to clipboard:', err)
        }
    }
    
    async function deleteShareLink(shareToken: string) {
        if (!confirm('Are you sure you want to delete this share link? It will no longer be accessible.')) {
            return
        }
        
        try {
            const response = await fetch('/api/share', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ shareToken })
            })
            
            if (!response.ok) {
                throw new Error('Failed to delete share link')
            }
            
            // Refresh existing links list
            await loadExistingLinks()
            
        } catch (err) {
            console.error('Error deleting share link:', err)
            error = 'Failed to delete share link. Please try again.'
        }
    }
    
    function closeDialog() {
        dispatch('close')
        shareUrl = ''
        error = ''
        expiresIn = null
        permissions = 'view'
        showExisting = false
    }
    
    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString()
    }
    
    function toggleExistingLinks() {
        showExisting = !showExisting
        if (showExisting) {
            loadExistingLinks()
        }
    }
    
    // Load existing links when dialog opens
    $: if (isOpen && calendarId) {
        loadExistingLinks()
    }
</script>

{#if isOpen}
    <div 
        class="dialog-overlay" 
        on:click={closeDialog} 
        on:keydown={(e) => e.key === 'Escape' && closeDialog()}
        role="dialog" 
        aria-modal="true"
        tabindex="-1"
    >
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <div class="dialog-content" on:click|stopPropagation role="document">
            <div class="dialog-header">
                <h3>Share Calendar</h3>
                <button class="close-button" on:click={closeDialog}>×</button>
            </div>
            
            <div class="dialog-body">
                <div class="form-group">
                    <label for="permissions">Permissions</label>
                    <select id="permissions" bind:value={permissions}>
                        <option value="view">View Only</option>
                        <option value="edit">View & Edit</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="expires">Link Expires</label>
                    <select id="expires" bind:value={expiresIn}>
                        <option value={null}>Never</option>
                        <option value={1}>1 Day</option>
                        <option value={7}>1 Week</option>
                        <option value={30}>1 Month</option>
                        <option value={90}>3 Months</option>
                    </select>
                </div>
                
                <button 
                    class="generate-button" 
                    on:click={generateShareLink}
                    disabled={isLoading}
                >
                    {isLoading ? 'Generating...' : 'Generate Share Link'}
                </button>
                
                {#if error}
                    <div class="error-message">{error}</div>
                {/if}
                
                {#if shareUrl}
                    <div class="share-result">
                        <span class="share-label">Share URL:</span>
                        <div class="url-container">
                            <input 
                                type="text" 
                                readonly 
                                value={shareUrl}
                                class="share-url"
                            />
                            <button class="copy-button" on:click={copyToClipboard}>
                                Copy
                            </button>
                        </div>
                        <p class="share-info">
                            {#if permissions === 'edit'}
                                Recipients can view and edit events on this calendar.
                            {:else}
                                Recipients can only view events on this calendar.
                            {/if}
                            {#if expiresIn}
                                Link expires in {expiresIn} day{expiresIn > 1 ? 's' : ''}.
                            {:else}
                                Link never expires.
                            {/if}
                        </p>
                    </div>
                {/if}
                
                <div class="existing-links-section">
                    <button 
                        class="toggle-existing" 
                        on:click={toggleExistingLinks}
                    >
                        {showExisting ? 'Hide' : 'Show'} Existing Links ({existingLinks.length})
                    </button>
                    
                    {#if showExisting && existingLinks.length > 0}
                        <div class="existing-links">
                            {#each existingLinks as link}
                                <div class="link-item">
                                    <div class="link-url" title="{window.location.origin}{link.shareUrl}">
                                        {window.location.origin}{link.shareUrl}
                                    </div>
                                    <div class="link-details">
                                        <div class="link-info">
                                            <span class="link-permissions" class:edit={link.permissions === 'edit'}>
                                                {link.permissions}
                                            </span>
                                            <div class="link-dates">
                                                <span class="link-created">
                                                    Created {formatDate(link.createdAt)}
                                                </span>
                                                <span class="date-separator">•</span>
                                                {#if link.expiresAt}
                                                    <span class="link-expires">
                                                        Expires {formatDate(link.expiresAt)}
                                                    </span>
                                                {:else}
                                                    <span class="link-never-expires">Never expires</span>
                                                {/if}
                                            </div>
                                        </div>
                                        <div class="link-actions">
                                            <button 
                                                class="copy-existing-button"
                                                on:click={() => copyExistingLink(link.shareUrl)}
                                                title="Copy link to clipboard"
                                            >
                                                Copy
                                            </button>
                                            <button 
                                                class="delete-link-button"
                                                on:click={() => deleteShareLink(link.shareToken)}
                                                title="Delete this share link"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Using global modal styles - renaming for compatibility */
    .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: var(--space-5);
        box-sizing: border-box;
    }
    
    .dialog-content {
        background: var(--white);
        border-radius: var(--radius-xl);
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: var(--shadow-md);
        display: flex;
        flex-direction: column;
    }
    
    .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-5) var(--space-6);
        border-bottom: 1px solid var(--gray-200);
        flex-shrink: 0;
    }
    
    .dialog-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--gray-700);
    }
    
    .close-button {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: var(--gray-600);
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-md);
        transition: all var(--transition-normal);
    }
    
    .close-button:hover {
        background: #f0f0f0;
        color: #333;
    }
    
    .dialog-body {
        padding: 24px;
    }
    
    .form-group {
        margin-bottom: 20px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
        color: #333;
        font-size: 14px;
    }
    
    .form-group select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        background: white;
    }
    
    .generate-button {
        width: 100%;
        background: #2196f3;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 12px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
        margin-bottom: 16px;
    }
    
    .generate-button:hover:not(:disabled) {
        background: #1976d2;
    }
    
    .generate-button:disabled {
        background: #ccc;
        cursor: not-allowed;
    }
    
    .error-message {
        background: #ffebee;
        color: #c62828;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
        margin-bottom: 16px;
    }
    
    .share-result {
        background: #f8f9fa;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 20px;
    }
    
    .share-label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
        color: #333;
        font-size: 14px;
    }
    
    .url-container {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
    }
    
    .share-url {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 13px;
        background: white;
        font-family: monospace;
    }
    
    .copy-button {
        background: #4caf50;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    
    .copy-button:hover {
        background: #45a049;
    }
    
    .share-info {
        margin: 0;
        font-size: 13px;
        color: #666;
        line-height: 1.4;
    }
    
    .existing-links-section {
        border-top: 1px solid #e0e0e0;
        padding-top: 16px;
    }
    
    .toggle-existing {
        background: none;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 14px;
        cursor: pointer;
        color: #666;
        transition: all 0.2s;
        width: 100%;
        text-align: left;
    }
    
    .toggle-existing:hover {
        background: #f0f0f0;
        border-color: #ccc;
    }
    
    .existing-links {
        margin-top: 12px;
    }
    
    .link-item {
        background: #f8f9fa;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .link-url {
        font-family: monospace;
        font-size: 12px;
        color: #2196f3;
        background: #f0f8ff;
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid #e3f2fd;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
        box-sizing: border-box;
    }
    
    .link-details {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
    }
    
    .link-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0; /* Allows text to wrap properly */
    }
    
    .link-url:hover {
        background: #e3f2fd;
        border-color: #bbdefb;
    }
    
    .link-permissions {
        background: #e0e0e0;
        color: #666;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 11px;
        text-transform: uppercase;
        width: fit-content;
        margin-top: 2px;
    }
    
    .link-permissions.edit {
        background: #4caf50;
        color: white;
    }
    
    .link-dates {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .link-created, .link-expires, .link-never-expires {
        font-size: 12px;
        color: #666;
    }
    
    .date-separator {
        color: #ccc;
        font-size: 12px;
    }
    
    .link-actions {
        display: flex;
        gap: 8px;
    }
    
    .copy-existing-button {
        background: #2196f3;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    
    .copy-existing-button:hover {
        background: #1976d2;
    }
    
    .delete-link-button {
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    
    .delete-link-button:hover {
        background: #d32f2f;
    }
</style>