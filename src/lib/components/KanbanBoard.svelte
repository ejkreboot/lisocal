<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte'
    import { supabase } from '$lib/supabase.js'
    import { fly } from 'svelte/transition'
    
    export let isOpen = false
    export let canEdit = true
    export let calendarId: string
    export let shareToken: string | null = null
    
    const dispatch = createEventDispatcher()
    const TODOS_UPDATED_EVENT = 'todos-updated'
    
    type Lane = 'Contemplation' | 'Ready' | 'In Progress' | 'Done'
    const lanes: Lane[] = ['Contemplation', 'Ready', 'In Progress', 'Done']
    
    interface Todo {
        id: string
        text: string
        stage: Lane
        project: string | null
        completed: boolean
        sort_index: number
    }
    
    let todos: Todo[] = []
    let loading = false
    let draggedCard: Todo | null = null
    let dragOverLane: Lane | null = null
    let editingCard: string | null = null
    let editText = ''
    let editProject = ''
    let showNewCardForm: Lane | null = null
    let newCardText = ''
    let newCardProject = ''
    let lastLoadedCalendarId: string | null = null
    let loadRequestId = 0
    
    // Color palette for projects — used as top-border accent colors
    const projectColors: { [key: string]: string } = {}
    const colorPalette = [
        '#5b9ec9', // dusty blue
        '#69a86a', // sage green
        '#c9a84c', // amber
        '#9a7bc9', // lavender
        '#c4854d', // terracotta
        '#4caa99', // teal
        '#c97aab', // dusty rose
        '#c47a7a', // muted red
    ]
    let nextColorIndex = 0

    function broadcastTodosUpdated() {
        if (typeof window === 'undefined' || !calendarId) return
        window.dispatchEvent(new CustomEvent(TODOS_UPDATED_EVENT, {
            detail: { calendarId, source: 'kanban' }
        }))
    }

    onMount(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ calendarId: string; source?: string }>).detail
            if (!detail || detail.calendarId !== calendarId || detail.source === 'kanban') return
            if (isOpen) {
                loadTodos(false)
            }
        }

        window.addEventListener(TODOS_UPDATED_EVENT, handler as EventListener)
        return () => window.removeEventListener(TODOS_UPDATED_EVENT, handler as EventListener)
    })
    
    function getProjectColor(project: string | null): string {
        if (!project) return 'transparent'
        if (!projectColors[project]) {
            projectColors[project] = colorPalette[nextColorIndex % colorPalette.length]
            nextColorIndex++
        }
        return projectColors[project]
    }
    
    // Load todos when modal opens (only once per calendar)
    $: if (isOpen && calendarId && calendarId !== lastLoadedCalendarId) {
        loadTodos()
        lastLoadedCalendarId = calendarId
    }
    
    async function loadTodos(showLoader = true) {
        if (!calendarId) return
        
        const requestId = ++loadRequestId
        if (showLoader) {
            loading = true
        }
        try {
            const params = new URLSearchParams({ calendarId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/todos?${params}`, {
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to load todos')
            }
            
            const data = await response.json()
            if (requestId !== loadRequestId) return
            todos = data.todos || []
        } catch (error) {
            console.error('Error loading todos:', error)
            if (requestId !== loadRequestId) return
            todos = []
        } finally {
            if (requestId === loadRequestId) {
                loading = false
            }
        }
    }
    
    async function getAuthToken() {
        const { data: { session } } = await supabase.auth.getSession()
        return session?.access_token || ''
    }
    
    function closeModal() {
        isOpen = false
        showNewCardForm = null
        editingCard = null
        lastLoadedCalendarId = null  // Reset so next open will reload
        dispatch('close')
    }
    
    function handleModalClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            closeModal()
        }
    }
    
    function handleKeydown(event: KeyboardEvent) {
        // Only handle Escape key
        if (event.key === 'Escape') {
            const target = event.target as HTMLElement
            // If typing in input, handle edit/form cancellation
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                if (editingCard !== null) {
                    cancelEdit()
                } else if (showNewCardForm !== null) {
                    showNewCardForm = null
                    newCardText = ''
                    newCardProject = ''
                }
            } else {
                // Otherwise close the modal
                closeModal()
            }
        }
    }
    
    // Reactive derived value: todos grouped by lane
    $: todosByLane = lanes.reduce((acc, lane) => {
        acc[lane] = todos
            .filter(t => t.stage === lane && !t.completed)
            .sort((a, b) => a.sort_index - b.sort_index)
        return acc
    }, {} as Record<Lane, Todo[]>)
    
    // Drag and drop
    function handleDragStart(event: DragEvent, card: Todo) {
        if (!canEdit) return
        draggedCard = card
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
        }
    }
    
    function handleDragOver(event: DragEvent, lane: Lane) {
        if (!canEdit || !draggedCard) return
        event.preventDefault()
        dragOverLane = lane
    }
    
    function handleDragLeave() {
        dragOverLane = null
    }
    
    async function handleDrop(event: DragEvent, lane: Lane) {
        if (!canEdit || !draggedCard) return
        event.preventDefault()
        
        // Don't update if dropping in the same lane
        if (draggedCard.stage === lane) {
            resetDrag()
            return
        }
        
        // Update stage
        await updateTodoStage(draggedCard.id, lane)
        resetDrag()
    }
    
    function resetDrag() {
        draggedCard = null
        dragOverLane = null
    }
    
    // CRUD operations
    async function createCard(lane: Lane) {
        if (!newCardText.trim() || !canEdit || !calendarId) return
        
        try {
            const params = shareToken ? `?shareToken=${shareToken}` : ''
            const authToken = shareToken ? null : await getAuthToken()
            
            const response = await fetch(`/api/todos${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${authToken}` })
                },
                body: JSON.stringify({
                    calendarId,
                    text: newCardText.trim(),
                    stage: lane,
                    project: newCardProject.trim() || null
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to create card')
            }
            
            const data = await response.json()
            console.log('Created todo:', data.todo)
            // Ensure the new todo has the correct stage
            const newTodo = {
                ...data.todo,
                stage: data.todo.stage || lane
            }
            todos = [...todos, newTodo]
            newCardText = ''
            newCardProject = ''
            showNewCardForm = null

            // Refresh to avoid stale data from earlier loads
            await loadTodos(false)
            broadcastTodosUpdated()
        } catch (error) {
            console.error('Error creating card:', error)
        }
    }
    
    async function updateTodoStage(todoId: string, newStage: Lane) {
        try {
            const params = new URLSearchParams({ todoId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/todos?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    stage: newStage
                })
            })
            
            if (!response.ok) {
                const errorText = await response.text()
                console.error('Failed to update stage:', response.status, errorText)
                throw new Error('Failed to update stage')
            }
            
            const data = await response.json()
            console.log('Updated todo:', data.todo)
            
            // Update local state with the returned data
            todos = todos.map(t => 
                t.id === todoId 
                    ? { ...t, ...data.todo, stage: newStage }
                    : t
            )

            // Reload to keep in sync with the server and ignore stale loads
            await loadTodos(false)
            broadcastTodosUpdated()
        } catch (error) {
            console.error('Error updating stage:', error)
        }
    }
    
    function startEdit(card: Todo) {
        if (!canEdit) return
        editingCard = card.id
        editText = card.text
        editProject = card.project || ''
        
        setTimeout(() => {
            const input = document.querySelector('.edit-card-input') as HTMLInputElement
            if (input) {
                input.focus()
                input.select()
            }
        }, 0)
    }
    
    async function saveEdit() {
        if (!editText.trim() || editingCard === null) {
            cancelEdit()
            return
        }
        
        try {
            const params = new URLSearchParams({ todoId: editingCard })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/todos?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    text: editText.trim(),
                    project: editProject.trim() || null
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to update card')
            }
            
            // Update local state
            todos = todos.map(todo => 
                todo.id === editingCard 
                    ? { ...todo, text: editText.trim(), project: editProject.trim() || null }
                    : todo
            )
            
            editingCard = null
            editText = ''
            editProject = ''
            broadcastTodosUpdated()
        } catch (error) {
            console.error('Error saving card:', error)
            cancelEdit()
        }
    }
    
    function cancelEdit() {
        editingCard = null
        editText = ''
        editProject = ''
    }
    
    async function deleteCard(todoId: string) {
        if (!canEdit) return
        
        try {
            const params = new URLSearchParams({ todoId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/todos?${params}`, {
                method: 'DELETE',
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to delete card')
            }
            
            todos = todos.filter(todo => todo.id !== todoId)
            broadcastTodosUpdated()
        } catch (error) {
            console.error('Error deleting card:', error)
        }
    }
    
    function handleEditKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            saveEdit()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelEdit()
        }
    }
    
    function handleNewCardKeydown(event: KeyboardEvent, lane: Lane) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            createCard(lane)
        } else if (event.key === 'Escape') {
            event.preventDefault()
            showNewCardForm = null
            newCardText = ''
            newCardProject = ''
        }
    }
    
    // Get unique projects for autocomplete
    $: projects = Array.from(new Set(todos.map(t => t.project).filter(p => p !== null))) as string[]
</script>

{#if isOpen}
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="kanban-backdrop" on:click={handleModalClick} on:keydown={handleKeydown} role="presentation">
        <div class="kanban-modal" role="dialog" aria-labelledby="kanban-title" aria-modal="true">
            <div class="kanban-header">
                <h2 id="kanban-title">PROJECT BOARD</h2>
                <button class="close-button" on:click={closeModal} aria-label="Close project board">
                    ×
                </button>
            </div>
            
            <div class="kanban-content">
                {#if loading}
                    <div class="loading-state">Loading...</div>
                {:else}
                    <div class="kanban-lanes">
                        {#each lanes as lane}
                            <div 
                                class="lane" 
                                class:drag-over={dragOverLane === lane}
                                on:dragover={(e) => handleDragOver(e, lane)}
                                on:dragleave={handleDragLeave}
                                on:drop={(e) => handleDrop(e, lane)}
                                role="list"
                                aria-label="{lane} lane"
                            >
                                <div class="lane-header">
                                    <h3 class="lane-title">{lane}</h3>
                                    <span class="lane-count">{(todosByLane[lane] || []).length}</span>
                                </div>
                                
                                <div class="lane-cards">
                                    {#each (todosByLane[lane] || []) as card (card.id)}
                                        {#if editingCard === card.id}
                                            <div class="card editing-card" transition:fly={{ duration: 200, y: 10 }}>
                                                <input 
                                                    class="edit-card-input"
                                                    bind:value={editText}
                                                    on:keydown={handleEditKeydown}
                                                    placeholder="Card text..."
                                                />
                                                <input 
                                                    class="edit-project-input"
                                                    bind:value={editProject}
                                                    on:keydown={handleEditKeydown}
                                                    placeholder="Project (optional)"
                                                    list="projects-list"
                                                />
                                                <div class="card-actions">
                                                    <button class="btn-small btn-primary" on:click={saveEdit}>Save</button>
                                                    <button class="btn-small" on:click={cancelEdit}>Cancel</button>
                                                </div>
                                            </div>
                                        {:else}
                                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                                            <div 
                                                class="card" 
                                                class:dragging={draggedCard?.id === card.id}
                                                style="border-top: 3px solid {getProjectColor(card.project)};"
                                                draggable={canEdit}
                                                on:dragstart={(e) => handleDragStart(e, card)}
                                                on:click={() => startEdit(card)}
                                                role="button"
                                                tabindex="0"
                                                transition:fly={{ duration: 200, y: 10 }}
                                            >
                                                <div class="card-text">{card.text}</div>
                                                {#if card.project}
                                                    <div class="card-project">{card.project}</div>
                                                {/if}
                                                {#if canEdit}
                                                    <button 
                                                        class="card-delete"
                                                        on:click|stopPropagation={() => deleteCard(card.id)}
                                                        aria-label="Delete card"
                                                        title="Delete card"
                                                        type="button"
                                                    >
                                                        <span class="material-symbols-outlined">close</span>
                                                    </button>
                                                {/if}
                                            </div>
                                        {/if}
                                    {/each}
                                    
                                    {#if showNewCardForm === lane}
                                        <div class="card new-card-form" transition:fly={{ duration: 200, y: 10 }}>
                                            <input 
                                                class="new-card-input"
                                                bind:value={newCardText}
                                                on:keydown={(e) => handleNewCardKeydown(e, lane)}
                                                placeholder="Card text..."
                                            />
                                            <input 
                                                class="new-project-input"
                                                bind:value={newCardProject}
                                                on:keydown={(e) => handleNewCardKeydown(e, lane)}
                                                placeholder="Project (optional)"
                                                list="projects-list"
                                            />
                                            <div class="card-actions">
                                                <button class="btn-small btn-primary" on:click={() => createCard(lane)}>Add</button>
                                                <button class="btn-small" on:click={() => { showNewCardForm = null; newCardText = ''; newCardProject = ''; }}>Cancel</button>
                                            </div>
                                        </div>
                                    {:else if canEdit}
                                        <button 
                                            class="add-card-button"
                                            on:click={() => showNewCardForm = lane}
                                        >
                                            <span class="material-symbols-outlined">add</span>
                                            Add card
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
    
    <!-- Datalist for project autocomplete -->
    <datalist id="projects-list">
        {#each projects as project}
            <option value={project}></option>
        {/each}
    </datalist>
{/if}

<style>
    .kanban-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .kanban-modal {
        background: var(--white);
        border-radius: 0;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    
    .kanban-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 1.25rem;
        height: 59px;
        border-bottom: 1px solid #ddd;
        flex-shrink: 0;
    }
    
    .kanban-header h2 {
        font-family: var(--font-primary);
        font-size: 1rem;
        font-weight: 500;
        color: #333;
        margin: 0;
    }
    
    .close-button {
        background: white;
        border: 1px solid #ddd;
        border-radius: 0;
        font-size: 24px;
        color: #666;
        cursor: pointer;
        padding: 0.1rem 0.3rem 0.25rem;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }
    
    .close-button:hover {
        background: #f5f5f5;
        color: #333;
    }
    
    .kanban-content {
        flex: 1;
        overflow: hidden;
        padding: var(--space-6);
        min-height: 0;
    }
    
    .kanban-lanes {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-4);
        height: 100%;
        overflow-x: auto;
        padding-bottom: var(--space-2);
    }
    
    .lane {
        background: var(--gray-50);
        border-radius: 0;
        padding: var(--space-4);
        display: flex;
        flex-direction: column;
        min-width: 250px;
        transition: background var(--transition-fast);
    }
    
    .lane.drag-over {
        background: var(--primary-ultra-light);
        box-shadow: inset 0 0 0 2px var(--primary-color);
    }
    
    .lane-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-3);
    }
    
    .lane-title {
        font-family: var(--font-primary);
        font-size: 14px;
        font-weight: 600;
        color: var(--gray-700);
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .lane-count {
        background: var(--gray-200);
        color: var(--gray-600);
        font-size: 12px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 0;
    }
    
    .lane-cards {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-1);
        margin: -var(--space-1);
    }
    
    .card {
        background: var(--white);
        border-radius: 0;
        padding: var(--space-3);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        cursor: pointer;
        transition: all var(--transition-fast);
        position: relative;
        border: 1px solid #e8e8e8;
        border-top-width: 3px;
    }
    
    .card:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        transform: translateY(-1px);
    }
    
    .card.dragging {
        opacity: 0.5;
        transform: rotate(3deg);
    }
    
    .card-text {
        font-size: 14px;
        color: var(--gray-700);
        line-height: 1.4;
        word-wrap: break-word;
        padding-right: var(--space-6);
    }
    
    .card-project {
        font-size: 11px;
        color: var(--gray-600);
        font-weight: 600;
        margin-top: var(--space-2);
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }
    
    .card-delete {
        position: absolute;
        top: var(--space-2);
        right: var(--space-2);
        background: var(--white);
        border: none;
        border-radius: 0;
        padding: 2px;
        cursor: pointer;
        opacity: 0;
        transition: all var(--transition-fast);
        color: var(--gray-500);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .card-delete .material-symbols-outlined {
        font-size: 16px;
    }
    
    .card:hover .card-delete {
        opacity: 1;
    }
    
    .card-delete:hover {
        background: var(--error-bg);
        color: var(--error-text);
    }
    
    .add-card-button {
        background: transparent;
        border: 2px dashed var(--gray-300);
        border-radius: 0;
        padding: var(--space-3);
        cursor: pointer;
        color: var(--gray-500);
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-1);
        transition: all var(--transition-fast);
    }
    
    .add-card-button:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
        background: var(--primary-ultra-light);
    }
    
    .add-card-button .material-symbols-outlined {
        font-size: 18px;
    }
    
    .new-card-form,
    .editing-card {
        background: var(--white);
        border: 2px solid var(--primary-color);
        border-radius: 0;
        padding: var(--space-3);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .new-card-input,
    .new-project-input,
    .edit-card-input,
    .edit-project-input {
        width: 100%;
        border: 1px solid var(--gray-300);
        border-radius: 0;
        padding: var(--space-2);
        font-size: 13px;
        font-family: var(--font-primary);
        margin-bottom: var(--space-2);
        transition: border-color var(--transition-fast);
    }
    
    .new-card-input:focus,
    .new-project-input:focus,
    .edit-card-input:focus,
    .edit-project-input:focus {
        outline: none;
        border-color: var(--primary-color);
    }
    
    .card-actions {
        display: flex;
        gap: var(--space-2);
        margin-top: var(--space-2);
    }
    
    .btn-small {
        padding: var(--space-1) var(--space-3);
        font-size: 12px;
        border-radius: 0;
        border: 1px solid var(--gray-300);
        background: var(--white);
        color: var(--gray-700);
        cursor: pointer;
        font-weight: 500;
        transition: all var(--transition-fast);
    }
    
    .btn-small:hover {
        background: var(--gray-100);
    }
    
    .btn-small.btn-primary {
        background: var(--primary-color);
        color: var(--white);
        border-color: var(--primary-color);
    }
    
    .btn-small.btn-primary:hover {
        background: var(--primary-hover);
        border-color: var(--primary-hover);
    }
    
    .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--gray-500);
        font-size: 14px;
    }
    
    /* Mobile responsive */
    @media (max-width: 1200px) {
        .kanban-lanes {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    
    @media (max-width: 768px) {
        .kanban-modal {
            max-width: 100%;
            max-height: 100vh;
        }
        
        .kanban-lanes {
            grid-template-columns: 1fr;
        }
        
        .lane {
            min-height: 200px;
        }
    }
</style>
