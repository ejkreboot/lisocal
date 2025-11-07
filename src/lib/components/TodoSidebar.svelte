<script lang="ts">
    import { supabase } from '$lib/supabase.js'
    
    let { canEdit = true, calendarId, shareToken = null }: {
        canEdit?: boolean
        calendarId: string
        shareToken?: string | null
    } = $props()
    
    let todos: any[] = $state([])
    let loading = $state(false)
    
    let newTodoText = $state('')
    let editingId: string | null = $state(null)
    let editText = $state('')
    let draggedTodo: any = $state(null)
    let draggedTodoId: string | null = $state(null)
    let dragOverIndex = $state(-1)
    let dragOverSection: 'incomplete' | 'completed' | null = $state(null)
    
    // Tooltip state
    let tooltip = $state({
        visible: false,
        text: '',
        x: 0,
        y: 0
    })
    
    // Load todos when calendarId changes
    $effect(() => {
        if (calendarId) {
            loadTodos()
        }
    })
    
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
        const { data: { session } } = await supabase.auth.getSession()
        return session?.access_token || ''
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
            
            todos = todos.filter(todo => todo.id !== id)
        } catch (error) {
            console.error('Error deleting todo:', error)
        }
    }
    
    function startEdit(id: string, text: string) {
        if (!canEdit) return
        
        editingId = id
        editText = text
        
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
        
        dragOverIndex = index
        dragOverSection = 'incomplete'
    }
    
    function handleDragLeave() {
        setTimeout(() => {
            dragOverIndex = -1
            dragOverSection = null
        }, 50)
    }
    
    async function handleDrop(event: DragEvent, targetTodo: any, targetIndex: number) {
        if (!canEdit || !draggedTodo || draggedTodo.completed) return
        
        event.preventDefault()
        
        if (draggedTodo.id === targetTodo.id) {
            resetDrag()
            return
        }
        
        const draggedIndex = incompleteTodos.findIndex(t => t.id === draggedTodo.id)
        
        if (draggedIndex === -1) {
            resetDrag()
            return
        }
        
        const newIncompleteList = [...incompleteTodos]
        const [movedItem] = newIncompleteList.splice(draggedIndex, 1)
        newIncompleteList.splice(targetIndex, 0, movedItem)
        
        todos = [...newIncompleteList, ...completedTodos]
        
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
    
    function showTooltip(event: MouseEvent, text: string) {
        const target = event.currentTarget as HTMLElement
        
        // Only show tooltip when the text is actually truncated (overflow with ellipsis)
        if (target && target.scrollWidth > target.clientWidth) {
            const rect = target.getBoundingClientRect()
            
            tooltip = {
                visible: true,
                text: text,
                x: rect.left,
                y: rect.bottom + 5
            }
        }
    }
    
    function hideTooltip() {
        tooltip = {
            visible: false,
            text: '',
            x: 0,
            y: 0
        }
    }
    
    let completedTodos = $derived(todos.filter(t => t.completed))
    let incompleteTodos = $derived(todos.filter(t => !t.completed))
</script>

<aside class="todo-sidebar">
    <div class="sidebar-header">
        <h2>To-Do List</h2>
    </div>
    
    <div class="sidebar-content">
        {#if canEdit}
            <div class="add-todo-section">
                <div class="add-todo-input-container">
                    <input 
                        class="input new-todo-input"
                        bind:value={newTodoText}
                        onkeydown={handleNewTodoKeydown}
                        placeholder="Add a new task..."
                        aria-label="New task description"
                        disabled={loading}
                    />
                    <button 
                        class="btn btn-primary add-todo-button"
                        onclick={addTodo}
                        disabled={!newTodoText.trim() || loading}
                        aria-label="Add task"
                    >
                        <span class="material-symbols-outlined">add</span>
                    </button>
                </div>
            </div>
        {/if}
        
        <div class="todos-container">
            {#if loading}
                <div class="loading-state">
                    <p>Loading...</p>
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
                                    class:dragging={draggedTodoId === todo.id}
                                    draggable={canEdit}
                                    ondragstart={(e) => handleDragStart(e, todo)}
                                    ondragover={(e) => handleDragOver(e, index)}
                                    ondragleave={handleDragLeave}
                                    ondrop={(e) => handleDrop(e, todo, index)}
                                    ondragend={handleDragEnd}
                                    role="listitem"
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
                                                onclick={() => toggleTodo(todo.id)}
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
                                                onkeydown={handleEditKeydown}
                                                onblur={saveEdit}
                                            />
                                        {:else}
                                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                                            <span 
                                                class="todo-text"
                                                class:editable={canEdit}
                                                onclick={() => canEdit && startEdit(todo.id, todo.text)}
                                                onmouseenter={(e) => showTooltip(e, todo.text)}
                                                onmouseleave={hideTooltip}
                                                title={canEdit ? "Click to edit" : ""}
                                            >
                                                {todo.text}
                                            </span>
                                        {/if}
                                    </div>
                                    
                                    {#if canEdit}
                                        <button 
                                            class="delete-button"
                                            onclick={() => deleteTodo(todo.id)}
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
                            {#each completedTodos as todo (todo.id)}
                                <div class="todo-item completed" role="listitem">
                                    <div class="todo-content">
                                        {#if canEdit}
                                            <button 
                                                class="todo-checkbox"
                                                onclick={() => toggleTodo(todo.id)}
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
                                                onkeydown={handleEditKeydown}
                                                onblur={saveEdit}
                                            />
                                        {:else}
                                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                                            <span 
                                                class="todo-text completed"
                                                class:editable={canEdit}
                                                onclick={() => canEdit && startEdit(todo.id, todo.text)}
                                                onmouseenter={(e) => showTooltip(e, todo.text)}
                                                onmouseleave={hideTooltip}
                                                title={canEdit ? "Click to edit" : ""}
                                            >
                                                {todo.text}
                                            </span>
                                        {/if}
                                    </div>
                                    
                                    {#if canEdit}
                                        <button 
                                            class="delete-button"
                                            onclick={() => deleteTodo(todo.id)}
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
                            <p class="empty-hint">Add your first task above.</p>
                        {/if}
                    </div>
                {/if}
            {/if}
        </div>
    </div>
</aside>

{#if tooltip.visible}
    <div 
        class="tooltip" 
        style="left: {tooltip.x}px; top: {tooltip.y}px;"
    >
        {tooltip.text}
    </div>
{/if}

<style>
    .todo-sidebar {
        background: var(--white);
        border-right: 1px solid var(--gray-200);
        display: flex;
        flex-direction: column;
        height: 50%;
        width: 100%;
        min-width: 240px;
        max-width: 400px;
    }
    
    .sidebar-header {
        padding: var(--space-5) var(--space-5) var(--space-4);
        border-bottom: 1px solid var(--gray-200);
        flex-shrink: 0;
        min-height: 70px;
        max-height: 70px;
        height: 70px;
    }
    
    .sidebar-header h2 {
        margin: 0;
        color: var(--gray-700);
        font-size: 18px;
        font-weight: 600;
        font-family: var(--font-primary);
    }
    
    .sidebar-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
    }
    
    .add-todo-section {
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--gray-100);
        background: var(--gray-50);
        flex-shrink: 0;
    }
    
    .add-todo-input-container {
        display: flex;
        gap: var(--space-2);
        align-items: center;
    }
    
    .new-todo-input {
        flex: 1;
        font-size: 13px;
        padding: var(--space-2) var(--space-3);
        margin: 0;
    }
    
    .add-todo-button {
        width: 32px;
        height: 32px;
        font-size: 13px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    
    .add-todo-button .material-symbols-outlined {
        font-size: 16px;
    }
    
    .todos-container {
        overflow-y: auto;
        flex: 1;
        padding: var(--space-4) var(--space-5);
    }
    
    .todo-section {
        margin-bottom: var(--space-5);
    }
    
    .todo-section:last-child {
        margin-bottom: 0;
    }
    
    .section-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--gray-600);
        margin: 0 0 var(--space-3);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-family: var(--font-primary);
    }
    
    .section-title.completed-section {
        color: var(--gray-500);
    }
    
    .todos-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    
    .todo-item {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-small-default);
        background: var(--white);
        transition: all var(--transition-normal);
        font-size: 13px;
    }
    
    .todo-item:hover {
        border-color: #d0d0d0;
        background: var(--gray-50);
    }
    
    .todo-item.completed {
        background: var(--gray-50);
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
    }
    
    .todo-item.drag-over {
        border-color: var(--primary-color);
        background: var(--primary-light);
        transform: translateY(-2px);
    }
    
    .drag-handle {
        display: flex;
        align-items: center;
        color: var(--gray-400);
        cursor: grab;
        flex-shrink: 0;
    }
    
    .drag-handle:hover {
        color: var(--gray-600);
    }
    
    .drag-handle .material-symbols-outlined {
        font-size: 16px;
    }
    
    .todo-content {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex: 1;
        min-width: 0;
    }
    
    .todo-checkbox {
        width: 18px;
        height: 18px;
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
    }
    
    .todo-checkbox.readonly {
        cursor: default;
        background: var(--gray-100);
    }
    
    .todo-item.completed .todo-checkbox {
        background: #4caf50;
        border-color: #4caf50;
    }
    
    .checkbox-icon {
        font-size: 11px;
        font-weight: bold;
        color: var(--white);
        line-height: 1;
    }
    
    .todo-text {
        flex: 1;
        font-size: 13px;
        color: var(--gray-700);
        line-height: 1.4;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
        padding: var(--space-1) var(--space-2);
        border: 2px solid var(--primary-color);
        font-size: 13px;
    }
    
    .delete-button {
        background: none;
        border: none;
        color: var(--gray-400);
        cursor: pointer;
        padding: var(--space-1);
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
    }
    
    .empty-state {
        text-align: center;
        padding: var(--space-8) var(--space-4);
        color: var(--gray-500);
    }
    
    .empty-state p {
        margin: 0 0 var(--space-2);
        font-size: 14px;
    }
    
    .empty-hint {
        font-size: 12px;
        color: var(--gray-400);
    }
    
    .loading-state {
        text-align: center;
        padding: var(--space-8) var(--space-4);
        color: var(--gray-500);
    }
    
    .loading-state p {
        margin: 0;
        font-size: 14px;
    }
    
    .tooltip {
        position: fixed;
        background: var(--gray-800);
        color: var(--white);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-small-default);
        font-size: 12px;
        max-width: 300px;
        word-wrap: break-word;
        z-index: 10000;
        pointer-events: none;
        box-shadow: var(--shadow-lg);
        animation: fadeIn 0.15s ease-out;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-5px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
