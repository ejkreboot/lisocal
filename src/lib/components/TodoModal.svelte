<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import { supabase } from '$lib/supabase.js'
    import { scale, fly } from 'svelte/transition'
    import { quintOut, quintIn } from 'svelte/easing'
    
    // Custom fadeFlow transition to match your signature animation
    function fadeFlowIn(node: HTMLElement, { duration = 250 } = {}) {
        return {
            duration,
            easing: (t: number) => t * (2 - t), // cubic-bezier approximation
            css: (t: number) => {
                const scale = 0.75 + (0.25 * t)
                const blur = 12 * (1 - t)
                const y = 12 * (1 - t)
                return `
                    opacity: ${t};
                    transform: translateY(${y}px) scale(${scale});
                    filter: blur(${blur}px);
                `
            }
        }
    }
    
    function fadeFlowOut(node: HTMLElement, { duration = 300 } = {}) {
        return {
            duration,
            easing: (t: number) => t * t, // ease-in
            css: (t: number) => {
                const scale = 0.75 + (0.25 * t)
                const blur = 12 * (1 - t)
                const y = 12 * (1 - t)
                return `
                    opacity: ${t};
                    transform: translateY(${y}px) scale(${scale});
                    filter: blur(${blur}px);
                `
            }
        }
    }
    
    export let isOpen = false
    export let canEdit = true
    export let calendarId: string
    export let shareToken: string | null = null
    
    const dispatch = createEventDispatcher()
    
    let todos: any[] = []
    let loading = false
    let removingTodoIds: Set<string> = new Set()
    
    let newTodoText = ''
    let editingId: string | null = null
    let editText = ''
    let draggedTodo: any = null
    let draggedTodoId: string | null = null
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
        
        // Add immediate visual feedback
        const todoElement = document.querySelector(`[data-todo-id="${id}"]`)
        if (todoElement) {
            todoElement.classList.add('checking')
        }
        
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
            
            // Small delay to let check animation complete
            setTimeout(() => {
                todos = todos.map(t => 
                    t.id === id 
                        ? { ...t, completed: !t.completed }
                        : t
                )
            }, 150)
            
        } catch (error) {
            console.error('Error toggling todo:', error)
            // Remove visual feedback if error
            if (todoElement) {
                todoElement.classList.remove('checking')
            }
        }
    }
    
    async function deleteTodo(id: string) {
        if (!canEdit) return
        
        // Mark as removing to trigger exit animation
        removingTodoIds.add(id)
        removingTodoIds = removingTodoIds // trigger reactivity
        
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
            
            // Remove from state after animation completes
            setTimeout(() => {
                todos = todos.filter(todo => todo.id !== id)
                removingTodoIds.delete(id)
                removingTodoIds = removingTodoIds // trigger reactivity
            }, 350) // slightly longer to ensure animation completes
            
        } catch (error) {
            console.error('Error deleting todo:', error)
            // Remove from removing set if error
            removingTodoIds.delete(id)
            removingTodoIds = removingTodoIds
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
        draggedTodoId = todo.id
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/html', '')
        }
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
            
                        
            if (!response.ok) {
                const errorText = await response.text()
                console.error('Reorder failed:', errorText)
                throw new Error('Failed to save todo order')
            }
            
                    } catch (error) {
            console.error('Error saving todo order:', error)
            // Could reload todos here if needed
        }
    }
    
    function resetDrag() {
        draggedTodo = null
        draggedTodoId = null
        dragOverIndex = -1
        dragOverSection = null
    }
    
    function handleDragEnd() {
        resetDrag()
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
                                class="input new-todo-input"
                                bind:value={newTodoText}
                                on:keydown={handleNewTodoKeydown}
                                placeholder="Add a new task..."
                                aria-label="New task description"
                                disabled={loading}
                            />
                            <button 
                                class="btn btn-primary add-todo-button"
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
                                        class="todo-item todo-item-enter" 
                                        class:completed={todo.completed}
                                        class:drag-over={dragOverIndex === index && dragOverSection === 'incomplete'}
                                        class:draggable={canEdit}
                                        class:dragging={draggedTodoId === todo.id}
                                        class:removing={removingTodoIds.has(todo.id)}
                                        data-todo-id={todo.id}
                                        draggable={canEdit}
                                        on:dragstart={(e) => handleDragStart(e, todo)}
                                        on:dragover={(e) => handleDragOver(e, index)}
                                        on:dragleave={handleDragLeave}
                                        on:drop={(e) => handleDrop(e, todo, index)}
                                        on:dragend={handleDragEnd}
                                        role="listitem"
                                        in:fadeFlowIn={{ duration: 250 }}
                                        out:fadeFlowOut={{ duration: 300 }}
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
                                                    class="input edit-todo-input"
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
                                        class="todo-item completed todo-item-enter" 
                                        role="listitem"
                                        data-todo-id={todo.id}
                                        class:removing={removingTodoIds.has(todo.id)}
                                        in:fadeFlowIn={{ duration: 250 }}
                                        out:fadeFlowOut={{ duration: 300 }}
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
                                                    class="input edit-todo-input"
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
    /* TodoModal specific styles - using global styles from global.css */
    
    .modal-content {
        max-width: 500px;
        max-height: 80vh;
        height: min(80vh, 600px);
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
    }
    
    .add-todo-section {
        padding: var(--space-5) var(--space-6);
        border-bottom: 1px solid #f0f0f0;
        background: var(--gray-50);
        flex-shrink: 0;
    }
    
    .add-todo-container {
        display: flex;
        gap: var(--space-3);
        align-items: center;
    }
    
    .new-todo-input {
        flex: 1;
        margin: 0;
    }
    
    .add-todo-button {
        white-space: nowrap;
        flex-shrink: 0;
    }
    
    .modal-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
        min-height: 0;
    }
    
    .todos-container {
        overflow-y: auto;
        flex: 1;
        padding: 0 var(--space-6) var(--space-6);
        min-height: 0;
    }
    
    .todo-section {
        margin-bottom: var(--space-6);
    }
    
    .todo-section:last-child {
        margin-bottom: 0;
    }
    
    .section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--gray-600);
        margin: var(--space-5) 0 var(--space-3);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .section-title.completed-section {
        color: var(--gray-800);
    }
    
    .todos-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        position: relative;
    }
    
    .todo-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-small-default);
        background: var(--white);
        transition: all var(--transition-normal), transform 0.15s ease;
        position: relative;
    }
    
    .todo-item:hover {
        border-color: #d0d0d0;
        background: var(--gray-50);
    }
    
    .todo-item.completed {
        background: var(--gray-50);
        border-color: #e8e9ea;
    }
    
    /* Animation states */
    .todo-item-enter {
        animation: fadeFlowIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .todo-item.removing {
        animation: fadeFlowOut 0.3s cubic-bezier(0.6, 0, 0.8, 1) forwards;
        pointer-events: none;
    }
        
    @keyframes fadeFlowIn {
        0% {
            opacity: 0;
            transform: translateY(12px) scale(0.75);
            filter: blur(12px);
        }
        100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
        }
    }

    @keyframes fadeFlowOut {
        100% {
            opacity: 1;
            transform: translateY(0px) scale(1);
            filter: blur(0px);
        }
        0% {
            opacity: 0;
            transform: translateY(12px) scale(0.75);
            filter: blur(12px);
        }
    }
    
    @keyframes checkBounce {
        0% { transform: scale(1); }
        30% { transform: scale(1.05); }
        60% { transform: scale(0.98); }
        100% { transform: scale(1); }
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
        border-color: var(--primary-color);
        background: var(--primary-light);
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(33, 150, 243, 0.2);
    }
    
    .drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--gray-500);
        cursor: grab;
        padding: var(--space-1);
        border-radius: var(--radius-small-default);
        transition: all var(--transition-normal);
        flex-shrink: 0;
    }
    
    .drag-handle:hover {
        color: var(--gray-600);
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
        gap: var(--space-3);
        flex: 1;
        min-width: 0;
    }
    
    .todo-checkbox {
        width: 20px;
        height: 20px;
        border: 2px solid var(--gray-300);
        border-radius: var(--radius-small-default);
        background: var(--white);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--transition-normal);
        padding: 0;
        flex-shrink: 0;
    }
    
    .todo-checkbox:hover {
        border-color: var(--primary-color);
        transform: scale(1.05);
    }
    
    .todo-checkbox.readonly {
        cursor: default;
        background: var(--gray-100);
    }
    
    .todo-item.completed .todo-checkbox {
        background: #4caf50;
        border-color: #4caf50;
        animation: checkPop 0.2s ease-out;
    }
    
    @keyframes checkPop {
        0% { transform: scale(1); }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); }
    }
    
    .checkbox-icon {
        font-size: 12px;
        font-weight: bold;
        color: var(--white);
        line-height: 1;
    }
    
    .todo-text {
        flex: 1;
        font-size: 14px;
        color: var(--dark-text);
        line-height: 1.4;
        word-wrap: break-word;
        min-width: 0;
    }
    
    .todo-text.editable {
        cursor: pointer;
        padding: var(--space-1) var(--space-2);
        margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
        border-radius: var(--radius-small-default);
        transition: background-color var(--transition-normal);
    }
    
    .todo-text.editable:hover {
        background: rgba(33, 150, 243, 0.1);
    }
    
    .todo-text.completed {
        text-decoration: line-through;
        color: var(--gray-500);
    }
    
    .edit-todo-input {
        flex: 1;
        margin: 0;
        padding: var(--space-2) var(--space-3);
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-small-default);
        font-size: 14px;
    }
    
    .delete-button {
        background: none;
        border: none;
        color: var(--gray-600);
        cursor: pointer;
        padding: var(--space-1) var(--space-2);
        font-size: 16px;
        font-weight: bold;
        border-radius: var(--radius-small-default);
        transition: all var(--transition-normal);
        flex-shrink: 0;
        line-height: 1;
    }
    
    .delete-button:hover {
        background: #ffebee;
        color: #f44336;
        transform: scale(1.1);
    }
    
    .delete-button:active {
        transform: scale(0.95);
    }
    
    .empty-state {
        text-align: center;
        padding: 40px var(--space-5);
        color: var(--gray-600);
    }
    
    .empty-state p {
        margin: 0 0 var(--space-2);
        font-size: 16px;
    }
    
    .empty-hint {
        font-size: 14px;
        color: var(--gray-500);
    }
    
    .loading-state {
        text-align: center;
        padding: 40px var(--space-5);
        color: var(--gray-600);
    }
    
    .loading-state p {
        margin: 0;
        font-size: 16px;
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
        
        .add-todo-section {
            padding: var(--space-4) var(--space-5);
        }
        
        .add-todo-container {
            flex-direction: column;
            gap: var(--space-3);
        }
        
        .new-todo-input {
            width: 100%;
        }
        
        .add-todo-button {
            width: 100%;
            padding: var(--space-3);
        }
        
        .todos-container {
            padding: 0 var(--space-5) var(--space-5);
        }
        
        .todo-item {
            padding: var(--space-3);
            gap: var(--space-2);
        }
        
        .drag-handle {
            padding: var(--space-2) var(--space-1);
        }
        
        .drag-handle .material-symbols-outlined {
            font-size: 20px;
        }
    }
</style>