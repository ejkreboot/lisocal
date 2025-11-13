<script lang="ts">
    import { supabase } from '$lib/supabase.js'
    import { marked } from 'marked'
    import { getRandomQuote, formatQuoteAsNote, type Quote } from '$lib/calendar-utils.js'
    import quotes from '$lib/assets/quotes.json'
    
    let { canEdit = true, calendarId, shareToken = null }: {
        canEdit?: boolean
        calendarId: string
        shareToken?: string | null
    } = $props()
    
    let notes: any[] = $state([])
    let loading = $state(false)
    let currentNoteIndex = $state(0)
    
    let editingContent = $state(false)
    let tempContent = $state('')
    let showNoteMenu = $state(false)
    
    // Local state for "Thought for the day" note (not saved to database)
    let thoughtOfDayNote: any = $state(null)
    
    // Load notes when calendarId changes
    $effect(() => {
        if (calendarId) {
            loadNotes()
        }
    })
    
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
            const loadedNotes = data.notes || []
            
            // Handle "Thought for the day" note logic
            handleThoughtOfDayNote(loadedNotes)
            
            // If we have notes but currentNoteIndex is out of bounds, reset it
            if (notes.length > 0 && currentNoteIndex >= notes.length) {
                currentNoteIndex = 0
            }
        } catch (error) {
            console.error('Error loading notes:', error)
            notes = []
            // Even if loading fails, create thought of day note
            handleThoughtOfDayNote([])
        } finally {
            loading = false
        }
    }
    
    function handleThoughtOfDayNote(loadedNotes: any[]) {
        // Check if there's already a "Thought for the day" note
        const existingThoughtNote = loadedNotes.find(note => 
            note.content && 
            note.content.split('\n')[0].replace(/^#+\s*/, '').trim() === 'Thought for the day'
        )
        
        if (existingThoughtNote) {
            // Replace existing thought with a new random quote
            const randomQuote = getRandomQuote(quotes as Quote[])
            const newContent = formatQuoteAsNote(randomQuote)
            
            // Create a local copy with updated content (not saved to database)
            thoughtOfDayNote = {
                ...existingThoughtNote,
                content: newContent,
                isLocal: true
            }
            
            // Replace in the notes array and make it the current note
            notes = loadedNotes.map(note => 
                note.id === existingThoughtNote.id ? thoughtOfDayNote : note
            )
            
            // Set this as the current note
            const thoughtIndex = notes.findIndex(note => note.id === existingThoughtNote.id)
            if (thoughtIndex !== -1) {
                currentNoteIndex = thoughtIndex
            }
        } else {
            // Create a new "Thought for the day" note
            const randomQuote = getRandomQuote(quotes as Quote[])
            const newContent = formatQuoteAsNote(randomQuote)
            
            thoughtOfDayNote = {
                id: `thought-of-day-${Date.now()}`,
                content: newContent,
                isLocal: true,
                created_at: new Date().toISOString()
            }
            
            // Add to beginning of notes array and make it current
            notes = [thoughtOfDayNote, ...loadedNotes]
            currentNoteIndex = 0
        }
    }
    
    async function getAuthToken() {
        const { data: { session } } = await supabase.auth.getSession()
        return session?.access_token || ''
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
        
        // Handle local notes (like "Thought for the day") differently
        if (noteToDelete.isLocal) {
            // Just remove from local state, no API call needed
            notes = notes.filter(note => note.id !== noteToDelete.id)
            
            // Adjust currentNoteIndex if needed
            if (currentNoteIndex >= notes.length && notes.length > 0) {
                currentNoteIndex = notes.length - 1
            } else if (notes.length === 0) {
                currentNoteIndex = 0
            }
            return
        }
        
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
        
        const currentNote = notes[currentNoteIndex]
        
        // Handle local notes (like "Thought for the day") - just update in memory
        if (currentNote.isLocal) {
            notes = notes.map((note, index) => 
                index === currentNoteIndex 
                    ? { ...note, content: tempContent.trim() }
                    : note
            )
            
            editingContent = false
            tempContent = ''
            return
        }
        
        try {
            const noteId = currentNote.id
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
    
    function handleContentClick(event: MouseEvent) {
        // Check if the clicked element or any of its parents is a link
        let target = event.target as HTMLElement
        while (target && target !== event.currentTarget) {
            if (target.tagName === 'A') {
                // This is a link click, don't start editing
                event.stopPropagation()
                return
            }
            target = target.parentElement as HTMLElement
        }
        
        // Not a link click, proceed with editing if allowed
        if (canEdit) {
            startEditContent()
        }
    }
    
    // Get current note
    let currentNote = $derived(notes[currentNoteIndex] || null)
    
    // Render markdown content
    let renderedContent = $derived(
        currentNote && !editingContent 
            ? marked(currentNote.content || '') 
            : ''
    )
    
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
</script>

<aside class="scratchpad-sidebar">
    <div class="sidebar-header">
        <h2>Scratchpad</h2>
        {#if canEdit}
            <div class="header-actions">
                <button 
                    class="btn btn-sm btn-primary"
                    onclick={addNote}
                    title="Add new note"
                    disabled={loading}
                >
                    <span class="material-symbols-outlined">add</span>
                </button>
                {#if notes.length > 0}
                    <button 
                        class="btn btn-sm btn-danger"
                        onclick={deleteNote}
                        title="Delete current note"
                        disabled={loading}
                    >
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                {/if}
            </div>
        {/if}
    </div>
    
    <div class="sidebar-content">
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
            <div class="note-counter">
                <button 
                    class="nav-button"
                    onclick={previousNote}
                    disabled={currentNoteIndex === 0}
                    title="Previous note"
                >
                    <span class="material-symbols-outlined">chevron_left</span>
                </button>
                
                <div class="counter-menu-container">
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span 
                        class="counter-text clickable" 
                        onclick={toggleNoteMenu}
                        title="Click to select note"
                    >
                        {currentNoteIndex + 1} of {notes.length}
                    </span>
                    
                    {#if showNoteMenu && notes.length > 1}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="note-menu-overlay" onclick={closeMenu}></div>
                        <div class="note-menu">
                            {#each notes as note, index (note.id)}
                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div 
                                    class="note-menu-item"
                                    class:active={index === currentNoteIndex}
                                    class:thought-note={note.isLocal}
                                    onclick={() => selectNote(index)}
                                >
                                    <span class="note-menu-number">{index + 1}</span>
                                    <span class="note-menu-title">
                                        {getNoteTitleFromContent(note.content)}
                                        {#if note.isLocal}
                                            <span class="thought-indicator" title="Daily thought (not saved)">✨</span>
                                        {/if}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
                
                <button 
                    class="nav-button"
                    onclick={nextNote}
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
                        onkeydown={(e) => {
                            e.stopPropagation();
                            handleContentKeydown(e);
                        }}
                        onblur={saveContent}
                        placeholder="Write your note in Markdown..."
                    ></textarea>
                    <div class="edit-hint">
                        Press Escape to cancel, Ctrl+Enter (⌘+Enter on Mac) to save
                    </div>
                {:else if currentNote}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        class="note-content"
                        class:editable={canEdit}
                        onclick={handleContentClick}
                        title={canEdit ? "Click to edit content" : ""}
                    >
                        {@html renderedContent}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</aside>

<style>
    .scratchpad-sidebar {
        background: var(--white);
        border-right: 1px solid var(--gray-200);
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        min-width: 240px;
        max-width: 400px;
        overflow: hidden;
    }
    
    .sidebar-header {
        padding: var(--space-5) var(--space-5) var(--space-4);
        border-bottom: 0px solid var(--gray-200);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 60px;
        max-height: 60px;
        height: 60px;
    }
    
    .sidebar-header h2 {
        margin: 0;
        color: var(--dark-text);
        font-size: 18px;
        font-weight: 600;
        font-family: var(--font-primary);
    }
    
    .header-actions {
        display: flex;
        gap: var(--space-2);
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
        color: #D20E00;
    }
    
    .btn-danger:hover:not(:disabled) {
        background: #ffcdd2;
    }
    
    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .material-symbols-outlined {
        font-size: 16px;
    }
    
    .sidebar-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
        min-height: 0;
    }
    
    .loading-state,
    .empty-state {
        text-align: center;
        padding: var(--space-8) var(--space-4);
        color: var(--gray-500);
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
    
    .nav-button {
        background-color: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-small-default);
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--gray-800);
        transition: all var(--transition-normal);
    }
    
    .nav-button:hover:not(:disabled) {
        border-color: var(--gray-800);
    }
    
    .nav-button:disabled {
        opacity: 1;
        cursor: not-allowed;
        color: black;
    }
    
    .note-counter {
        padding: var(--space-1) var(--space-5);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3);
        background:  #fafafa;
        border-top: 0px solid var(--gray-500);
        border-bottom: 0px solid var(--gray-400);
        flex-shrink: 0;
    }
    
    .counter-menu-container {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .counter-text {
        font-size: 11px;
        color: var(--gray-800);
        font-weight: 500;
        min-width: 50px;
        text-align: center;
    }
    
    .counter-text.clickable {
        cursor: pointer;
        padding: var(--space-1) var(--space-2);
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
        min-width: 200px;
        max-width: 280px;
        max-height: 200px;
        overflow-y: auto;
        margin-top: var(--space-1);
    }
    
    .note-menu-item {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
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
        font-size: 10px;
        font-weight: 600;
        color: var(--gray-400);
        min-width: 16px;
        text-align: center;
    }
    
    .note-menu-item.active .note-menu-number {
        color: var(--primary-color);
    }
    
    .note-menu-title {
        font-size: 12px;
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
    
    .note-menu-item.thought-note {
        background: linear-gradient(135deg, #f8fafc 0%, #e8f4fd 100%);
    }
    
    .thought-indicator {
        font-size: 10px;
        margin-left: var(--space-1);
        opacity: 0.7;
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
        padding: var(--space-4) var(--space-5);
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.5;
        cursor: pointer;
        min-height: 0;
    }
    
    .note-content.editable:hover {
        background: rgba(33, 150, 243, 0.05);
    }
    
    .edit-content-textarea {
        flex: 1;
        margin: var(--space-4) var(--space-5);
        padding: var(--space-3);
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-small-default);
        font-size: 13px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        line-height: 1.4;
        resize: none;
        outline: none;
        overflow-y: auto;
    }
    
    .edit-hint {
        padding: var(--space-2) var(--space-5);
        font-size: 11px;
        color: var(--gray-500);
        background: var(--gray-50);
        text-align: center;
        flex-shrink: 0;
    }
    
    .textarea {
        background: var(--white);
        border: 1px solid var(--gray-300);
        border-radius: var(--radius-small-default);
        font-size: 13px;
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
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 var(--space-3);
        color: var(--gray-800);
    }
    
    :global(.note-content h2) {
        font-size: 15px;
        font-weight: 600;
        margin: var(--space-4) 0 var(--space-2);
        color: var(--dark-text);
    }
    
    :global(.note-content h3) {
        font-size: 14px;
        font-weight: 600;
        margin: var(--space-3) 0 var(--space-2);
        color: var(--dark-text);
    }
    
    :global(.note-content p) {
        margin: 0 0 var(--space-3);
    }
    
    :global(.note-content ul),
    :global(.note-content ol) {
        margin: 0 0 var(--space-3);
        padding-left: var(--space-4);
    }
    
    :global(.note-content li) {
        margin-bottom: var(--space-1);
        color: var(--gray-600);
    }
    
    :global(.note-content code) {
        background: var(--gray-100);
        padding: 2px 4px;
        border-radius: var(--radius-small-default);
        font-size: 12px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    }
    
    :global(.note-content pre) {
        background: var(--gray-100);
        padding: var(--space-3);
        border-radius: var(--radius-small-default);
        overflow-x: auto;
        margin: 0 0 var(--space-3);
    }
    
    :global(.note-content pre code) {
        background: none;
        padding: 0;
    }
    
    :global(.note-content blockquote) {
        position: relative;
        border: none !important;
        border-left: none !important;
        padding: var(--space-6) var(--space-5) var(--space-4) var(--space-5);
        margin: var(--space-4) 0;
        border-radius: var(--radius-small-default);
        font-style: normal;
        font-size: 17px;
        line-height: 1.6;
        font-family: 'Sorts Mill Goudy', cursive;
    }
    
    :global(.note-content blockquote::before) {
        content: '“';
        position: absolute;
        top: var(--space-3);
        left: var(--space-2);
        font-size: 70px;
        color: var(--primary-color);
        opacity: 0.25;
        font-family: 'Sorts Mill Goudy', serif;
        line-height: 1;
        font-weight: 400;
    }
    
    :global(.note-content blockquote p) {
        margin: 0;
        position: relative;
        z-index: 1;
        padding-top: var(--space-3);
        font-style: normal;
        color: var(--gray-600);
    }
    
    :global(.note-content a) {
        color: black;
        text-decoration: none;
        font-size: 11px;
        font-weight: 600;
        opacity: 0.7;
        transition: all var(--transition-normal);
        display: inline;
        margin-left: var(--space-2);
        font-family: var(--font-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    :global(.note-content a:hover) {
        text-decoration: none;
        opacity: 1;
        color: var(--primary-hover);
    }
    
    :global(.note-content a::after) {
        content: ' ↗';
        font-size: 9px;
        opacity: 0.6;
        margin-left: 2px;
    }
    
    :global(.note-content strong) {
        font-weight: 600;
    }
    
    :global(.note-content em) {
        font-style: italic;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0.01em;
    }
</style>