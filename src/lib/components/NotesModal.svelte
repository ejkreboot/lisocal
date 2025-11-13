<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import { supabase } from '$lib/supabase.js'
    import { marked } from 'marked'
    
    export let isOpen = false
    export let canEdit = true
    export let calendarId: string
    export let shareToken: string | null = null
    
    const dispatch = createEventDispatcher()
    
    let notes: any[] = []
    let loading = false
    let currentNoteIndex = 0
    
    let editingContent = false
    let tempContent = ''
    let showNoteMenu = false
    
    // Load notes when modal opens or calendarId changes
    $: if (isOpen && calendarId) {
        loadNotes()
    }
    
    async function loadNotes() {
        if (!calendarId) return
        
        loading = true
        try {
            const params = new URLSearchParams({ calendarId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/notes?${params}`, {
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to load notes')
            }
            
            const data = await response.json()
            notes = data.notes || []
            
            // If we have notes but currentNoteIndex is out of bounds, reset it
            if (notes.length > 0 && currentNoteIndex >= notes.length) {
                currentNoteIndex = 0
            }
        } catch (error) {
            console.error('Error loading notes:', error)
            notes = []
        } finally {
            loading = false
        }
    }
    
    async function getAuthToken() {
        const { data: { session } } = await supabase.auth.getSession()
        return session?.access_token || ''
    }
    
    function closeModal() {
        isOpen = false
        dispatch('close')
    }
    
    function handleModalClick(event: MouseEvent) {
        // Close modal if clicking the backdrop
        if (event.target === event.currentTarget) {
            closeModal()
        }
    }
    
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            if (editingContent) {
                cancelEditContent()
            } else {
                closeModal()
            }
        }
    }
    
    async function addNote() {
        if (!canEdit || !calendarId) return
        
        try {
            const params = shareToken ? `?shareToken=${shareToken}` : ''
            const authToken = shareToken ? null : await getAuthToken()
            
            const response = await fetch(`/api/notes${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${authToken}` })
                },
                body: JSON.stringify({
                    calendarId,
                    content: '# New Note\n\nStart writing here...'
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to create note')
            }
            
            const data = await response.json()
            notes = [...notes, data.note]
            currentNoteIndex = notes.length - 1
        } catch (error) {
            console.error('Error creating note:', error)
        }
    }
    
    async function deleteNote() {
        if (!canEdit || notes.length === 0) return
        
        const noteToDelete = notes[currentNoteIndex]
        if (!noteToDelete) return
        
        try {
            const params = new URLSearchParams({ noteId: noteToDelete.id })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/notes?${params}`, {
                method: 'DELETE',
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to delete note')
            }
            
            notes = notes.filter(note => note.id !== noteToDelete.id)
            
            // Adjust currentNoteIndex if needed
            if (currentNoteIndex >= notes.length && notes.length > 0) {
                currentNoteIndex = notes.length - 1
            } else if (notes.length === 0) {
                currentNoteIndex = 0
            }
        } catch (error) {
            console.error('Error deleting note:', error)
        }
    }
    
    function previousNote() {
        if (currentNoteIndex > 0) {
            currentNoteIndex--
        }
    }
    
    function nextNote() {
        if (currentNoteIndex < notes.length - 1) {
            currentNoteIndex++
        }
    }
    
    function startEditContent() {
        if (!canEdit) return
        
        const currentNote = notes[currentNoteIndex]
        if (currentNote) {
            tempContent = currentNote.content
            editingContent = true
            
            setTimeout(() => {
                const textarea = document.querySelector('.edit-content-textarea') as HTMLTextAreaElement
                if (textarea) {
                    textarea.focus()
                }
            }, 0)
        }
    }
    
    async function saveContent() {
        if (!notes[currentNoteIndex]) {
            cancelEditContent()
            return
        }
        
        try {
            const noteId = notes[currentNoteIndex].id
            const params = new URLSearchParams({ noteId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/notes?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    content: tempContent.trim()
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to update note content')
            }
            
            notes = notes.map((note, index) => 
                index === currentNoteIndex 
                    ? { ...note, content: tempContent.trim() }
                    : note
            )
            
            editingContent = false
            tempContent = ''
        } catch (error) {
            console.error('Error saving note content:', error)
            cancelEditContent()
        }
    }
    
    function cancelEditContent() {
        editingContent = false
        tempContent = ''
    }
    
    function handleContentKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault()
            cancelEditContent()
        }
        // Allow Ctrl/Cmd + Enter to save
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            saveContent()
        }
    }
    
    // Extract first line as title, removing markdown symbols
    function getNoteTitleFromContent(content: string): string {
        if (!content.trim()) return 'Empty note'
        
        const firstLine = content.split('\n')[0].trim()
        if (!firstLine) return 'Empty note'
        
        // Remove common markdown symbols
        return firstLine
            .replace(/^#+\s*/, '') // Remove heading markers
            .replace(/^\*+\s*/, '') // Remove list markers  
            .replace(/^-+\s*/, '') // Remove dash list markers
            .replace(/^\d+\.\s*/, '') // Remove numbered list markers
            .replace(/^\>\s*/, '') // Remove blockquote markers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markers
            .replace(/\*(.*?)\*/g, '$1') // Remove italic markers
            .replace(/`(.*?)`/g, '$1') // Remove code markers
            .trim() || 'Untitled note'
    }
    
    function toggleNoteMenu() {
        showNoteMenu = !showNoteMenu
    }
    
    function selectNote(index: number) {
        currentNoteIndex = index
        showNoteMenu = false
    }
    
    function closeMenu() {
        showNoteMenu = false
    }
    
    // Get current note
    $: currentNote = notes[currentNoteIndex] || null
    
    // Render markdown content
    $: renderedContent = currentNote && !editingContent 
        ? marked(currentNote.content || '') 
        : ''
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-backdrop" on:click={handleModalClick}>
        <div class="modal-content" role="dialog" aria-labelledby="notes-modal-title" aria-modal="true">
            <div class="modal-header">
                <h2 id="notes-modal-title">Scratchpad</h2>
                <div class="header-actions">
                    {#if canEdit}
                        <button 
                            class="btn btn-sm btn-secondary"
                            on:click={addNote}
                            title="Add new note"
                            disabled={loading}
                        >
                            <span class="material-symbols-outlined">add</span>
                        </button>
                        {#if notes.length > 0}
                            <button 
                                class="btn btn-sm btn-danger"
                                on:click={deleteNote}
                                title="Delete current note"
                                disabled={loading}
                            >
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        {/if}
                    {/if}
                    <button class="close-button" on:click={closeModal} aria-label="Close scratchpad">
                        ×
                    </button>
                </div>
            </div>
            
            <div class="modal-body">
                {#if loading}
                    <div class="loading-state">
                        <p>Loading notes...</p>
                    </div>
                {:else if notes.length === 0}
                    <div class="empty-state">
                        <p>No notes yet!</p>
                        {#if canEdit}
                            <p class="empty-hint">Click the + button to create your first note.</p>
                        {/if}
                    </div>
                {:else}
                    <div class="note-navigation">
                        <button 
                            class="nav-button"
                            on:click={previousNote}
                            disabled={currentNoteIndex === 0}
                            title="Previous note"
                        >
                            <span class="material-symbols-outlined">chevron_left</span>
                        </button>
                        
                        <div class="counter-menu-container">
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <span 
                                class="counter-text clickable" 
                                on:click={toggleNoteMenu}
                                title="Click to select note"
                            >
                                {currentNoteIndex + 1} of {notes.length}
                            </span>
                            
                            {#if showNoteMenu && notes.length > 1}
                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                <div class="note-menu-overlay" on:click={closeMenu}></div>
                                <div class="note-menu">
                                    {#each notes as note, index (note.id)}
                                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                                        <div 
                                            class="note-menu-item"
                                            class:active={index === currentNoteIndex}
                                            on:click={() => selectNote(index)}
                                        >
                                            <span class="note-menu-number">{index + 1}</span>
                                            <span class="note-menu-title">{getNoteTitleFromContent(note.content)}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                        
                        <button 
                            class="nav-button"
                            on:click={nextNote}
                            disabled={currentNoteIndex === notes.length - 1}
                            title="Next note"
                        >
                            <span class="material-symbols-outlined">chevron_right</span>
                        </button>
                    </div>
                    
                    <div class="note-content-container">
                        {#if editingContent}
                            <textarea 
                                class="textarea edit-content-textarea"
                                bind:value={tempContent}
                                on:keydown={(e) => {
                                    e.stopPropagation();
                                    handleContentKeydown(e);
                                }}
                                on:blur={saveContent}
                                placeholder="Write your note in Markdown..."
                            ></textarea>
                            <div class="edit-hint">
                                Press Escape to cancel, Ctrl+Enter (⌘+Enter on Mac) to save
                            </div>
                        {:else if currentNote}
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div 
                                class="note-content"
                                class:editable={canEdit}
                                on:click={() => canEdit && startEditContent()}
                                title={canEdit ? "Click to edit content" : ""}
                            >
                                {@html renderedContent}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    /* NotesModal specific styles - using global styles from global.css */
    
    .modal-content {
        max-width: 600px;
        max-height: 80vh;
        height: min(80vh, 700px);
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
    }
    
    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
    }
    
    .header-actions {
        display: flex;
        gap: var(--space-2);
        align-items: center;
    }
    
    .modal-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
        min-height: 0;
    }
    
    .btn {
        border: none;
        border-radius: var(--radius-small-default);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all var(--transition-normal);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
    }
    
    .btn-sm {
        padding: var(--space-2);
        width: 32px;
        height: 32px;
    }
    
    .btn-secondary {
        background: var(--gray-100);
        color: var(--dark-text);
    }
    
    .btn-secondary:hover:not(:disabled) {
        background: var(--gray-200);
    }
    
    .btn-danger {
        background: #ffebee;
        color: #CB180B
    }
    
    .btn-danger:hover:not(:disabled) {
        background: #ffcdd2;
    }
    
    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .loading-state,
    .empty-state {
        text-align: center;
        padding: var(--space-8) var(--space-4);
        color: var(--gray-500);
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    
    .loading-state p,
    .empty-state p {
        margin: 0 0 var(--space-2);
        font-size: 14px;
    }
    
    .empty-hint {
        font-size: 12px;
        color: var(--gray-400);
    }
    
    .note-navigation {
        padding: var(--space-3) var(--space-6);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3);
        background: var(--gray-50);
        border-bottom: 1px solid var(--gray-100);
        flex-shrink: 0;
    }
    
    .nav-button {
        border: 1px solid transparent;
        border-radius: var(--radius-small-default);
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--gray-800);
        transition: all var(--transition-normal);
    }
    
    .nav-button:hover:not(:disabled) {
        background: var(--gray-100);
        border-color: var(--gray-200);
    }
    
    .nav-button:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
    
    .counter-menu-container {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .counter-text {
        font-size: 12px;
        color: var(--gray-800);
        font-weight: 500;
        min-width: 60px;
        text-align: center;
    }
    
    .counter-text.clickable {
        cursor: pointer;
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-small-default);
        transition: background-color var(--transition-normal);
    }
    
    .counter-text.clickable:hover {
        background: rgba(33, 150, 243, 0.1);
        color: var(--primary-color);
    }
    
    .note-menu-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999;
    }
    
    .note-menu {
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: var(--white);
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-small-default);
        box-shadow: var(--shadow-lg);
        z-index: 1000;
        min-width: 240px;
        max-width: 320px;
        max-height: 200px;
        overflow-y: auto;
        margin-top: var(--space-2);
    }
    
    .note-menu-item {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
        cursor: pointer;
        transition: background-color var(--transition-normal);
        border-bottom: 1px solid var(--gray-100);
    }
    
    .note-menu-item:last-child {
        border-bottom: none;
    }
    
    .note-menu-item:hover {
        background: var(--gray-50);
    }
    
    .note-menu-item.active {
        background: var(--primary-light);
        color: var(--primary-color);
    }
    
    .note-menu-number {
        font-size: 11px;
        font-weight: 600;
        color: var(--gray-400);
        min-width: 20px;
        text-align: center;
    }
    
    .note-menu-item.active .note-menu-number {
        color: var(--primary-color);
    }
    
    .note-menu-title {
        font-size: 13px;
        color: var(--dark-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }
    
    .note-menu-item.active .note-menu-title {
        color: var(--primary-color);
        font-weight: 500;
    }
    
    .note-content-container {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    
    .note-content {
        flex: 1;
        padding: var(--space-5) var(--space-6);
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.6;
        cursor: pointer;
        min-height: 0;
    }
    
    .note-content.editable:hover {
        background: rgba(33, 150, 243, 0.03);
    }
    
    .edit-content-textarea {
        flex: 1;
        margin: var(--space-5) var(--space-6);
        padding: var(--space-4);
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-small-default);
        font-size: 14px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        line-height: 1.5;
        resize: none;
        outline: none;
        overflow-y: auto;
        min-height: 0;
    }
    
    .edit-hint {
        padding: var(--space-3) var(--space-6);
        font-size: 12px;
        color: var(--gray-500);
        background: var(--gray-50);
        text-align: center;
        flex-shrink: 0;
        border-top: 1px solid var(--gray-100);
    }
    
    .textarea {
        background: var(--white);
        border: 1px solid var(--gray-300);
        border-radius: var(--radius-small-default);
        font-size: 14px;
        transition: all var(--transition-normal);
        width: 100%;
        box-sizing: border-box;
    }
    
    .textarea:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
        outline: none;
    }
    
    /* Markdown content styling */
    :global(.note-content h1) {
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 var(--space-4);
        color: var(--gray-800);
        line-height: 1.3;
    }
    
    :global(.note-content h2) {
        font-size: 18px;
        font-weight: 600;
        margin: var(--space-5) 0 var(--space-3);
        color: var(--dark-text);
        line-height: 1.3;
    }
    
    :global(.note-content h3) {
        font-size: 16px;
        font-weight: 600;
        margin: var(--space-4) 0 var(--space-2);
        color: var(--dark-text);
        line-height: 1.3;
    }
    
    :global(.note-content p) {
        margin: 0 0 var(--space-4);
        color: var(--gray-600);
        line-height: 1.6;
    }
    
    :global(.note-content ul),
    :global(.note-content ol) {
        margin: 0 0 var(--space-4);
        padding-left: var(--space-5);
    }
    
    :global(.note-content li) {
        margin-bottom: var(--space-2);
        color: var(--gray-600);
        line-height: 1.6;
    }
    
    :global(.note-content code) {
        background: var(--gray-100);
        padding: 3px 6px;
        border-radius: var(--radius-small-default);
        font-size: 13px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        color: var(--gray-800);
    }
    
    :global(.note-content pre) {
        background: var(--gray-100);
        padding: var(--space-4);
        border-radius: var(--radius-small-default);
        overflow-x: auto;
        margin: 0 0 var(--space-4);
        border: 1px solid var(--gray-200);
    }
    
    :global(.note-content pre code) {
        background: none;
        padding: 0;
        border: none;
    }
    
    :global(.note-content blockquote) {
        border-left: 4px solid var(--primary-color);
        padding-left: var(--space-4);
        margin: 0 0 var(--space-4);
        color: var(--gray-600);
        font-style: italic;
        padding-top: var(--space-3);
        padding-bottom: var(--space-3);
        border-radius: var(--radius-small-default) var(--radius-small-default) var(--radius-small-default) 0;
    }
    
    :global(.note-content a) {
        color: black;
        text-decoration: none;
        font-weight: 500;
    }
    
    :global(.note-content a:hover) {
        text-decoration: underline;
    }
    
    :global(.note-content strong) {
        font-weight: 600;
        color: var(--gray-800);
    }
    
    :global(.note-content em) {
        font-style: italic;
    }
    
    :global(.note-content hr) {
        border: none;
        border-top: 1px solid var(--gray-200);
        margin: var(--space-6) 0;
    }
    
    /* Mobile responsiveness */
    @media (max-width: 576px) {
        .modal-backdrop {
            padding: var(--space-4);
        }
        
        .modal-content {
            max-height: 80vh;
            height: min(80vh, calc(100vh - 2 * var(--space-4)));
        }
        
        .modal-header {
            padding: var(--space-4) var(--space-5) var(--space-3);
        }
        
        .note-navigation {
            padding: var(--space-3) var(--space-5);
        }
        
        .nav-button {
            width: 36px;
            height: 36px;
        }
        
        .counter-text {
            font-size: 13px;
            min-width: 70px;
        }
        
        .note-content {
            padding: var(--space-4) var(--space-5);
            font-size: 13px;
        }
        
        .edit-content-textarea {
            margin: var(--space-4) var(--space-5);
            padding: var(--space-3);
            font-size: 13px;
        }
        
        .edit-hint {
            padding: var(--space-3) var(--space-5);
            font-size: 11px;
        }
    }
</style>