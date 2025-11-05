<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import { supabase } from '$lib/supabase.js'
    
    export let isOpen = false
    export let canEdit = true
    export let calendarId: string
    export let shareToken: string | null = null
    
    const dispatch = createEventDispatcher()
    
    let todos: any[] = []
    let loading = false
    
    let newTodoText = ''
    let editingId: string | null = null
    let editText = ''
    let draggedTodo: any = null
    let dragOverIndex = -1
    let dragOverSection: 'incomplete' | 'completed' | null = null
    
    // Load todos when modal opens or calendarId changes
    $: if (isOpen && calendarId) {
        loadTodos()
    }
    
    async function loadTodos() {
        if (!calendarId) return
        
        loading = true
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
            todos = data.todos || []
        } catch (error) {
            console.error('Error loading todos:', error)
            todos = []
        } finally {
            loading = false
        }
    }
    
    async function getAuthToken() {
        // Get the session token - you may need to import this from your auth store
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
            if (editingId !== null) {
                cancelEdit()
            } else {
                closeModal()
            }
        }
    }
    
    async function addTodo() {
        if (!newTodoText.trim() || !canEdit || !calendarId) return
        
        try {
            const params = shareToken ? `?shareToken=${shareToken}` : ''
            const authToken = shareToken ? null : await getAuthToken()
            
            console.log('Creating todo:', { calendarId, text: newTodoText.trim(), shareToken, authToken: authToken ? 'present' : 'missing' })
            
            const response = await fetch(`/api/todos${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${authToken}` })
                },
                body: JSON.stringify({
                    calendarId,
                    text: newTodoText.trim()
                })
            })
            
            if (!response.ok) {
                const errorText = await response.text()
                console.error('Server error:', response.status, errorText)
                throw new Error(`Failed to create todo: ${response.status} ${errorText}`)
            }
            
            const data = await response.json()
            todos = [data.todo, ...todos]
            newTodoText = ''
        } catch (error) {
            console.error('Error creating todo:', error)
        }
    }
    
    async function toggleTodo(id: string) {
        if (!canEdit) return
        
        const todo = todos.find(t => t.id === id)
        if (!todo) return
        
        try {
            const params = new URLSearchParams({ todoId: id })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/todos?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    completed: !todo.completed
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to update todo')
            }
            
            // Update local state
            todos = todos.map(t => 
                t.id === id 
                    ? { ...t, completed: !t.completed }
                    : t
            )
        } catch (error) {
            console.error('Error toggling todo:', error)
        }
    }
    
    async function deleteTodo(id: string) {
        if (!canEdit) return
        
        try {
            const params = new URLSearchParams({ todoId: id })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/todos?${params}`, {
                method: 'DELETE',
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to delete todo')
            }
            
            // Update local state
            todos = todos.filter(todo => todo.id !== id)
        } catch (error) {
            console.error('Error deleting todo:', error)
        }
    }
    
    function startEdit(id: string, text: string) {
        if (!canEdit) return
        
        editingId = id
        editText = text
        
        // Focus the input after it's rendered
        setTimeout(() => {
            const input = document.querySelector('.edit-todo-input') as HTMLInputElement
            if (input) {
                input.focus()
                input.select()
            }
        }, 0)
    }
    
    async function saveEdit() {
        if (!editText.trim() || editingId === null) {
            cancelEdit()
            return
        }
        
        try {
            const params = new URLSearchParams({ todoId: editingId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/todos?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    text: editText.trim()
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to update todo')
            }
            
            // Update local state
            todos = todos.map(todo => 
                todo.id === editingId 
                    ? { ...todo, text: editText.trim() }
                    : todo
            )
            
            editingId = null
            editText = ''
        } catch (error) {
            console.error('Error saving todo:', error)
            cancelEdit()
        }
    }
    
    function cancelEdit() {
        editingId = null
        editText = ''
    }
    
    function handleEditKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            saveEdit()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelEdit()
        }
    }
    
    function handleNewTodoKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            addTodo()
        }
    }
    
    // Drag and drop functions
    function handleDragStart(event: DragEvent, todo: any) {
        if (!canEdit || todo.completed) return
        
        draggedTodo = todo
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/html', '')
        }
        
        // Add a slight delay to show drag feedback
        setTimeout(() => {
            const draggedElement = event.target as HTMLElement
            if (draggedElement) {
                draggedElement.classList.add('dragging')
            }
        }, 0)
    }
    
    function handleDragOver(event: DragEvent, index: number) {
        if (!canEdit || !draggedTodo || draggedTodo.completed) return
        
        event.preventDefault()
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move'
        }
        
        // Only allow dragging incomplete items
        dragOverIndex = index
        dragOverSection = 'incomplete'
    }
    
    function handleDragLeave() {
        // Small delay to prevent flicker when moving between elements
        setTimeout(() => {
            dragOverIndex = -1
            dragOverSection = null
        }, 50)
    }
    
    async function handleDrop(event: DragEvent, targetTodo: any, targetIndex: number) {
        if (!canEdit || !draggedTodo || draggedTodo.completed) return
        
        event.preventDefault()
        
        // Don't reorder if dropping on the same item
        if (draggedTodo.id === targetTodo.id) {
            resetDrag()
            return
        }
        
        // Only incomplete items can be dragged and dropped
        const draggedIndex = incompleteTodos.findIndex(t => t.id === draggedTodo.id)
        
        if (draggedIndex === -1) {
            resetDrag()
            return
        }
        
        // Create new array with reordered items
        const newIncompleteList = [...incompleteTodos]
        const [movedItem] = newIncompleteList.splice(draggedIndex, 1)
        newIncompleteList.splice(targetIndex, 0, movedItem)
        
        // Update local state immediately for responsive UI
        todos = [...newIncompleteList, ...completedTodos]
        
        // Send reorder to server
        await saveReorder(newIncompleteList.map(t => t.id))
        
        resetDrag()
    }
    
    async function saveReorder(todoIds: string[]) {
        if (!canEdit || !calendarId) return
        
        console.log('Saving reorder:', todoIds)
        
        try {
            const params = shareToken ? `?shareToken=${shareToken}` : ''
            const response = await fetch(`/api/todos${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    reorderData: {
                        todoIds,
                        calendarId
                    }
                })
            })
            
            console.log('Reorder response:', response.status, response.ok)
            
            if (!response.ok) {
                const errorText = await response.text()
                console.error('Reorder failed:', errorText)
                throw new Error('Failed to save todo order')
            }
            
            console.log('Reorder saved successfully')
        } catch (error) {
            console.error('Error saving todo order:', error)
            // Could reload todos here if needed
        }
    }
    
    function handleDragEnd() {
        resetDrag()
    }
    
    function resetDrag() {
        // Remove dragging class from all elements
        document.querySelectorAll('.todo-item.dragging').forEach(el => {
            el.classList.remove('dragging')
        })
        
        draggedTodo = null
        dragOverIndex = -1
        dragOverSection = null
    }
    
    $: completedTodos = todos.filter(t => t.completed)
    $: incompleteTodos = todos.filter(t => !t.completed)
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-backdrop" on:click={handleModalClick}>
        <div class="modal-content" role="dialog" aria-labelledby="todo-modal-title" aria-modal="true">
            <div class="modal-header">
                <h2 id="todo-modal-title">To-Do List</h2>
                <button class="close-button" on:click={closeModal} aria-label="Close to-do list">
                    ×
                </button>
            </div>
            
            <div class="modal-body">
                {#if canEdit}
                    <div class="add-todo-section">
                        <div class="add-todo-container">
                            <input 
                                class="new-todo-input"
                                bind:value={newTodoText}
                                on:keydown={handleNewTodoKeydown}
                                placeholder="Add a new task..."
                                aria-label="New task description"
                                disabled={loading}
                            />
                            <button 
                                class="add-todo-button"
                                on:click={addTodo}
                                disabled={!newTodoText.trim() || loading}
                                aria-label="Add task"
                            >
                                {loading ? 'Loading...' : 'Add'}
                            </button>
                        </div>
                    </div>
                {/if}
                
                <div class="todos-container">
                    {#if loading}
                        <div class="loading-state">
                            <p>Loading todos...</p>
                        </div>
                    {:else}
                    {#if incompleteTodos.length > 0}
                        <div class="todo-section">
                            <h3 class="section-title">To Do ({incompleteTodos.length})</h3>
                            <div class="todos-list">
                                {#each incompleteTodos as todo, index (todo.id)}
                                    <div 
                                        class="todo-item" 
                                        class:completed={todo.completed}
                                        class:drag-over={dragOverIndex === index && dragOverSection === 'incomplete'}
                                        class:draggable={canEdit}
                                        draggable={canEdit}
                                        on:dragstart={(e) => handleDragStart(e, todo)}
                                        on:dragover={(e) => handleDragOver(e, index)}
                                        on:dragleave={handleDragLeave}
                                        on:drop={(e) => handleDrop(e, todo, index)}
                                        on:dragend={handleDragEnd}
                                        role="listitem"
                                        tabindex={canEdit ? 0 : undefined}
                                    >
                                        {#if canEdit}
                                            <div class="drag-handle" title="Drag to reorder">
                                                <span class="material-symbols-outlined">drag_indicator</span>
                                            </div>
                                        {/if}
                                        <div class="todo-content">
                                            {#if canEdit}
                                                <button 
                                                    class="todo-checkbox"
                                                    on:click={() => toggleTodo(todo.id)}
                                                    aria-label="Mark task as completed: {todo.text}"
                                                >
                                                    <span class="checkbox-icon">{todo.completed ? '✓' : ''}</span>
                                                </button>
                                            {:else}
                                                <div class="todo-checkbox readonly">
                                                    <span class="checkbox-icon">{todo.completed ? '✓' : ''}</span>
                                                </div>
                                            {/if}
                                            
                                            {#if editingId === todo.id}
                                                <input 
                                                    class="edit-todo-input"
                                                    bind:value={editText}
                                                    on:keydown={handleEditKeydown}
                                                    on:blur={saveEdit}
                                                />
                                            {:else}
                                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                                <span 
                                                    class="todo-text"
                                                    class:editable={canEdit}
                                                    on:click={() => canEdit && startEdit(todo.id, todo.text)}
                                                    title={canEdit ? "Click to edit" : ""}
                                                >
                                                    {todo.text}
                                                </span>
                                            {/if}
                                        </div>
                                        
                                        {#if canEdit}
                                            <button 
                                                class="delete-button"
                                                on:click={() => deleteTodo(todo.id)}
                                                aria-label="Delete task: {todo.text}"
                                                title="Delete task"
                                            >
                                                ×
                                            </button>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    
                    {#if completedTodos.length > 0}
                        <div class="todo-section">
                            <h3 class="section-title completed-section">Completed ({completedTodos.length})</h3>
                            <div class="todos-list">
                                {#each completedTodos as todo, index (todo.id)}
                                    <div 
                                        class="todo-item completed" 
                                        role="listitem"
                                    >
                                        <div class="todo-content">
                                            {#if canEdit}
                                                <button 
                                                    class="todo-checkbox"
                                                    on:click={() => toggleTodo(todo.id)}
                                                    aria-label="Mark task as incomplete: {todo.text}"
                                                >
                                                    <span class="checkbox-icon">✓</span>
                                                </button>
                                            {:else}
                                                <div class="todo-checkbox readonly">
                                                    <span class="checkbox-icon">✓</span>
                                                </div>
                                            {/if}
                                            
                                            {#if editingId === todo.id}
                                                <input 
                                                    class="edit-todo-input"
                                                    bind:value={editText}
                                                    on:keydown={handleEditKeydown}
                                                    on:blur={saveEdit}
                                                />
                                            {:else}
                                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                                <span 
                                                    class="todo-text completed"
                                                    class:editable={canEdit}
                                                    on:click={() => canEdit && startEdit(todo.id, todo.text)}
                                                    title={canEdit ? "Click to edit" : ""}
                                                >
                                                    {todo.text}
                                                </span>
                                            {/if}
                                        </div>
                                        
                                        {#if canEdit}
                                            <button 
                                                class="delete-button"
                                                on:click={() => deleteTodo(todo.id)}
                                                aria-label="Delete completed task: {todo.text}"
                                                title="Delete task"
                                            >
                                                ×
                                            </button>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    
                        {#if todos.length === 0}
                            <div class="empty-state">
                                <p>No tasks yet!</p>
                                {#if canEdit}
                                    <p class="empty-hint">Add your first task above to get started.</p>
                                {/if}
                            </div>
                        {/if}
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
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
        padding: 20px;
        box-sizing: border-box;
    }
    
    .modal-content {
        background: white;
        border-radius: 12px;
        width: 100%;
        max-width: 500px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    }
    
    .modal-header {
        padding: 20px 24px 16px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
    }
    
    .modal-header h2 {
        margin: 0;
        color: #333;
        font-size: 20px;
        font-weight: 600;
    }
    
    .close-button {
        background: none;
        border: none;
        font-size: 24px;
        color: #666;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
        line-height: 1;
    }
    
    .close-button:hover {
        background: #f0f0f0;
        color: #333;
    }
    
    .modal-body {
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        flex: 1;
    }
    
    .add-todo-section {
        padding: 20px 24px;
        border-bottom: 1px solid #f0f0f0;
        background: #fafafa;
        flex-shrink: 0;
    }
    
    .add-todo-container {
        display: flex;
        gap: 12px;
        align-items: center;
    }
    
    .new-todo-input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
    }
    
    .new-todo-input:focus {
        border-color: #2196f3;
        box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
    }
    
    .new-todo-input::placeholder {
        color: #999;
    }
    
    .add-todo-button {
        background: #2196f3;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
    }
    
    .add-todo-button:hover:not(:disabled) {
        background: #1976d2;
    }
    
    .add-todo-button:disabled {
        background: #ccc;
        cursor: not-allowed;
    }
    
    .todos-container {
        overflow-y: auto;
        flex: 1;
        padding: 0 24px 24px;
    }
    
    .todo-section {
        margin-bottom: 24px;
    }
    
    .todo-section:last-child {
        margin-bottom: 0;
    }
    
    .section-title {
        font-size: 14px;
        font-weight: 600;
        color: #666;
        margin: 20px 0 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .section-title.completed-section {
        color: #999;
    }
    
    .todos-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: relative;
    }
    
    .todo-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 16px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background: white;
        transition: all 0.2s ease, transform 0.15s ease;
        position: relative;
    }
    
    .todo-item:hover {
        border-color: #d0d0d0;
        background: #fafafa;
    }
    
    .todo-item.completed {
        background: #f8f9fa;
        border-color: #e8e9ea;
    }
    
    .todo-item.draggable {
        cursor: grab;
    }
    
    .todo-item.dragging {
        opacity: 0.5;
        transform: scale(1.02);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        cursor: grabbing;
        z-index: 1000;
    }
    
    .todo-item.drag-over {
        border-color: #2196f3;
        background: #e3f2fd;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(33, 150, 243, 0.2);
    }
    
    .drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
        cursor: grab;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
        flex-shrink: 0;
    }
    
    .drag-handle:hover {
        color: #666;
        background: rgba(0, 0, 0, 0.1);
    }
    
    .todo-item.dragging .drag-handle {
        cursor: grabbing;
    }
    
    .drag-handle .material-symbols-outlined {
        font-size: 18px;
    }
    
    .todo-content {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
    }
    
    .todo-checkbox {
        width: 20px;
        height: 20px;
        border: 2px solid #ddd;
        border-radius: 4px;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        padding: 0;
        flex-shrink: 0;
    }
    
    .todo-checkbox:hover {
        border-color: #2196f3;
    }
    
    .todo-checkbox.readonly {
        cursor: default;
        background: #f0f0f0;
    }
    
    .todo-item.completed .todo-checkbox {
        background: #4caf50;
        border-color: #4caf50;
    }
    
    .checkbox-icon {
        font-size: 12px;
        font-weight: bold;
        color: white;
        line-height: 1;
    }
    
    .todo-text {
        flex: 1;
        font-size: 14px;
        color: #333;
        line-height: 1.4;
        word-wrap: break-word;
        min-width: 0;
    }
    
    .todo-text.editable {
        cursor: pointer;
        padding: 4px 8px;
        margin: -4px -8px;
        border-radius: 4px;
        transition: background-color 0.2s;
    }
    
    .todo-text.editable:hover {
        background: rgba(33, 150, 243, 0.1);
    }
    
    .todo-text.completed {
        text-decoration: line-through;
        color: #999;
    }
    
    .edit-todo-input {
        flex: 1;
        padding: 8px 12px;
        border: 2px solid #2196f3;
        border-radius: 4px;
        font-size: 14px;
        outline: none;
        background: white;
    }
    
    .delete-button {
        background: none;
        border: none;
        color: #999;
        cursor: pointer;
        padding: 4px 8px;
        font-size: 16px;
        font-weight: bold;
        border-radius: 4px;
        transition: all 0.2s;
        flex-shrink: 0;
        line-height: 1;
    }
    
    .delete-button:hover {
        background: #ffebee;
        color: #f44336;
    }
    
    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #666;
    }
    
    .empty-state p {
        margin: 0 0 8px;
        font-size: 16px;
    }
    
    .empty-hint {
        font-size: 14px;
        color: #999;
    }
    
    .loading-state {
        text-align: center;
        padding: 40px 20px;
        color: #666;
    }
    
    .loading-state p {
        margin: 0;
        font-size: 16px;
    }
    
    /* Mobile responsiveness */
    @media (max-width: 576px) {
        .modal-backdrop {
            padding: 16px;
        }
        
        .modal-content {
            max-height: 90vh;
        }
        
        .modal-header {
            padding: 16px 20px 12px;
        }
        
        .add-todo-section {
            padding: 16px 20px;
        }
        
        .add-todo-container {
            flex-direction: column;
            gap: 12px;
        }
        
        .new-todo-input {
            width: 100%;
        }
        
        .add-todo-button {
            width: 100%;
            padding: 12px;
        }
        
        .todos-container {
            padding: 0 20px 20px;
        }
        
        .todo-item {
            padding: 12px;
            gap: 8px;
        }
        
        .drag-handle {
            padding: 8px 4px;
        }
        
        .drag-handle .material-symbols-outlined {
            font-size: 20px;
        }
    }
</style>