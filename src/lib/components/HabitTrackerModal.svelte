<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import { supabase } from '$lib/supabase.js'
    
    export let isOpen = false
    export let canEdit = true
    export let calendarId: string
    export let shareToken: string | null = null
    
    const dispatch = createEventDispatcher()
    
    // Habit type
    type Habit = {
        id: string
        name: string
        color: string
        sort_index: number
    }
    
    type Completion = {
        id: string
        habit_id: string
        completion_date: string
    }
    
    let habits: Habit[] = []
    let completions: Completion[] = []
    let loading = false
    let showAddHabit = false
    let newHabitName = ''
    let newHabitColor = '#7c3aed'
    let editingHabitId: string | null = null
    let editHabitName = ''
    let deletingHabitId: string | null = null
    
    // Track which completions we're currently toggling to prevent double-clicks
    let toggling = new Set<string>()
    
    // Color palette for habits
    const colorPalette = [
        { name: 'Purple', value: '#7c3aed' },
        { name: 'Blue', value: '#0284c7' },
        { name: 'Green', value: '#16a34a' },
        { name: 'Pink', value: '#ec4899' },
        { name: 'Orange', value: '#f97316' },
        { name: 'Red', value: '#ef4444' },
        { name: 'Teal', value: '#14b8a6' },
        { name: 'Indigo', value: '#6366f1' }
    ]
    
    // Get current date and generate month view (30 days back from today)
    const today = new Date()
    const daysToShow = 30
    
    // Generate array of dates for the past 30 days (including today)
    let dates = Array.from({ length: daysToShow }, (_, i) => {
        const date = new Date(today)
        date.setDate(today.getDate() - (daysToShow - 1 - i))
        return date
    })
    
    // Load habits when modal opens or calendarId changes
    $: if (isOpen && calendarId) {
        loadHabits()
    }
    
    async function loadHabits() {
        if (!calendarId) return
        
        loading = true
        try {
            const params = new URLSearchParams({ calendarId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/habits?${params}`, {
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to load habits')
            }
            
            const data = await response.json()
            habits = data.habits || []
            completions = data.completions || []
        } catch (error) {
            console.error('Error loading habits:', error)
            habits = []
            completions = []
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
        showAddHabit = false
        newHabitName = ''
        newHabitColor = '#7c3aed'
        editingHabitId = null
        editHabitName = ''
        dispatch('close')
    }
    
    function handleModalClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            closeModal()
        }
    }
    
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            if (editingHabitId) {
                cancelEditHabit()
            } else if (showAddHabit) {
                cancelAddHabit()
            } else {
                closeModal()
            }
        }
    }
    
    async function toggleHabit(habitId: string, date: Date) {
        if (!canEdit) return
        
        const dateStr = date.toISOString().split('T')[0]
        const toggleKey = `${habitId}-${dateStr}`
        
        // Prevent double-toggling
        if (toggling.has(toggleKey)) return
        toggling.add(toggleKey)
        
        const wasCompleted = isCompleted(habitId, date)
        
        try {
            const params = new URLSearchParams({ habitId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/habits?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    completionDate: dateStr,
                    completed: !wasCompleted
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to toggle habit')
            }
            
            // Update UI based on the action
            if (wasCompleted) {
                // Remove completion from local state
                completions = completions.filter(c => 
                    !(c.habit_id === habitId && c.completion_date === dateStr)
                )
            } else {
                // Add completion from server response
                const data = await response.json()
                console.log(completions)
                if (data.completion) {
                    completions = [...completions, data.completion]
                }
                console.log(completions)
            }
        } catch (error) {
            console.error('Error toggling habit:', error)
        } finally {
            toggling.delete(toggleKey)
        }
    }
    
    // Create a reactive map of completions for efficient lookup
    $: completionMap = new Map(
        completions.map(c => [`${c.habit_id}-${c.completion_date}`, true])
    )
    
    function isCompleted(habitId: string, date: Date): boolean {
        const dateStr = date.toISOString().split('T')[0]
        return completionMap.has(`${habitId}-${dateStr}`)
    }
    
    function formatDate(date: Date): string {
        const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
        return days[date.getDay()]
    }
    
    function formatDateShort(date: Date): string {
        return date.getDate().toString()
    }
    
    function formatDateFull(date: Date): string {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return `${months[date.getMonth()]} ${date.getDate()}`
    }
    
    function isToday(date: Date): boolean {
        const todayStr = today.toISOString().split('T')[0]
        const dateStr = date.toISOString().split('T')[0]
        return todayStr === dateStr
    }
    
    // Calculate streak for a habit
    function getStreak(habitId: string): number {
        let streak = 0
        const checkDate = new Date(today)
        
        while (true) {
            const dateStr = checkDate.toISOString().split('T')[0]
            if (completions.some(c => c.habit_id === habitId && c.completion_date === dateStr)) {
                streak++
                checkDate.setDate(checkDate.getDate() - 1)
            } else {
                break
            }
        }
        
        return streak
    }
    
    // Habit management functions
    function startAddHabit() {
        showAddHabit = true
        newHabitName = ''
        newHabitColor = '#7c3aed'
        setTimeout(() => {
            const input = document.querySelector('.new-habit-input') as HTMLInputElement
            if (input) input.focus()
        }, 0)
    }
    
    function cancelAddHabit() {
        showAddHabit = false
        newHabitName = ''
        newHabitColor = '#7c3aed'
    }
    
    async function addHabit() {
        if (!newHabitName.trim() || !canEdit || !calendarId) return
        
        try {
            const params = shareToken ? `?shareToken=${shareToken}` : ''
            const response = await fetch(`/api/habits${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    calendarId,
                    name: newHabitName.trim(),
                    color: newHabitColor
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to create habit')
            }
            
            const data = await response.json()
            habits = [...habits, data.habit]
            cancelAddHabit()
        } catch (error) {
            console.error('Error creating habit:', error)
        }
    }
    
    function handleNewHabitKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            addHabit()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelAddHabit()
        }
    }
    
    function startEditHabit(habitId: string, currentName: string) {
        if (!canEdit) return
        
        editingHabitId = habitId
        editHabitName = currentName
        setTimeout(() => {
            const input = document.querySelector('.edit-habit-input') as HTMLInputElement
            if (input) {
                input.focus()
                input.select()
            }
        }, 0)
    }
    
    function cancelEditHabit() {
        editingHabitId = null
        editHabitName = ''
    }
    
    async function saveEditHabit() {
        if (!editHabitName.trim() || editingHabitId === null) {
            cancelEditHabit()
            return
        }
        
        try {
            const params = new URLSearchParams({ habitId: editingHabitId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/habits?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    name: editHabitName.trim()
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to update habit')
            }
            
            const data = await response.json()
            habits = habits.map(h => h.id === editingHabitId ? data.habit : h)
            cancelEditHabit()
        } catch (error) {
            console.error('Error updating habit:', error)
            cancelEditHabit()
        }
    }
    
    function handleEditHabitKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            saveEditHabit()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelEditHabit()
        }
    }
    
    async function deleteHabit(habitId: string) {
        if (!canEdit) return
        
        // Confirm deletion
        const habit = habits.find(h => h.id === habitId)
        if (!habit) return
        
        if (!confirm(`Delete "${habit.name}"? This will remove all completion history for this habit.`)) {
            return
        }
        
        deletingHabitId = habitId
        
        try {
            const params = new URLSearchParams({ habitId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/habits?${params}`, {
                method: 'DELETE',
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to delete habit')
            }
            
            // Remove habit and its completions from state
            habits = habits.filter(h => h.id !== habitId)
            completions = completions.filter(c => c.habit_id !== habitId)
        } catch (error) {
            console.error('Error deleting habit:', error)
        } finally {
            deletingHabitId = null
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-backdrop" on:click={handleModalClick}>
        <div class="modal-content" role="dialog" aria-labelledby="habit-modal-title" aria-modal="true">
            <div class="modal-header">
                <h2 id="habit-modal-title">Habit Tracker</h2>
                <div class="header-actions">
                    {#if canEdit}
                        <button 
                            class="btn btn-sm btn-primary"
                            on:click={startAddHabit}
                            title="Add new habit"
                            disabled={loading || showAddHabit}
                        >
                            <span class="material-symbols-outlined">add</span>
                        </button>
                    {/if}
                    <button class="close-button" on:click={closeModal} aria-label="Close habit tracker">
                        ×
                    </button>
                </div>
            </div>
            
            <div class="modal-body">
                {#if loading}
                    <div class="loading-state">
                        <p>Loading habits...</p>
                    </div>
                {:else if habits.length === 0 && !showAddHabit}
                    <div class="empty-state">
                        <p>No habits yet!</p>
                        {#if canEdit}
                            <p class="empty-hint">Click the + button to create your first habit.</p>
                        {/if}
                    </div>
                {:else}
                    {#if showAddHabit}
                        <div class="add-habit-section">
                            <div class="add-habit-form">
                                <input 
                                    class="input new-habit-input"
                                    bind:value={newHabitName}
                                    on:keydown={handleNewHabitKeydown}
                                    placeholder="Habit name..."
                                    aria-label="New habit name"
                                />
                                <div class="color-picker">
                                    {#each colorPalette as color}
                                        <button
                                            class="color-option"
                                            class:selected={newHabitColor === color.value}
                                            style="background-color: {color.value}"
                                            on:click={() => newHabitColor = color.value}
                                            title={color.name}
                                            aria-label="Select {color.name} color"
                                        ></button>
                                    {/each}
                                </div>
                                <div class="form-actions">
                                    <button 
                                        class="btn btn-sm btn-primary"
                                        on:click={addHabit}
                                        disabled={!newHabitName.trim()}
                                    >
                                        Add Habit
                                    </button>
                                    <button 
                                        class="btn btn-sm btn-secondary"
                                        on:click={cancelAddHabit}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/if}
                    
                    {#if habits.length > 0}
                    <div class="habits-container">
                    {#each habits as habit}
                        <div class="habit-section">
                            <div class="habit-header">
                                <div class="habit-name">
                                    <span class="habit-color-dot" style="background-color: {habit.color}"></span>
                                    {#if editingHabitId === habit.id}
                                        <input 
                                            class="input edit-habit-input"
                                            bind:value={editHabitName}
                                            on:keydown={handleEditHabitKeydown}
                                            on:blur={saveEditHabit}
                                        />
                                    {:else}
                                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                                        <span 
                                            class="habit-text"
                                            class:editable={canEdit}
                                            on:click={() => canEdit && startEditHabit(habit.id, habit.name)}
                                            title={canEdit ? "Click to edit" : ""}
                                        >
                                            {habit.name}
                                        </span>
                                    {/if}
                                </div>
                                <div class="habit-actions">
                                    {#if getStreak(habit.id) > 0}
                                        <span class="streak-badge">{getStreak(habit.id)}</span>
                                    {/if}
                                    {#if canEdit}
                                        <button 
                                            class="delete-habit-button"
                                            on:click={() => deleteHabit(habit.id)}
                                            title="Delete habit"
                                            disabled={deletingHabitId === habit.id}
                                        >
                                            <span class="material-symbols-outlined">delete</span>
                                        </button>
                                    {/if}
                                </div>
                            </div>
                            
                            <div class="habit-grid">
                                {#each dates as date (date.getTime())}
                                    {@const dateStr = date.toISOString().split('T')[0]}
                                    {@const completionKey = `${habit.id}-${dateStr}`}
                                    {@const completed = completionMap.has(completionKey)}
                                    <button 
                                        class="habit-cell"
                                        class:completed
                                        class:today={isToday(date)}
                                        style="--habit-color: {habit.color}"
                                        on:click={() => toggleHabit(habit.id, date)}
                                        title="{formatDateFull(date)} - {formatDate(date)}"
                                        aria-label="{completed ? 'Unmark' : 'Mark'} {habit.name} for {formatDateFull(date)}"
                                    >
                                        <span class="cell-content">
                                            {#if completed}
                                                <span class="check-mark">✓</span>
                                            {:else}
                                                <span class="date-label">{formatDateShort(date)}</span>
                                            {/if}
                                        </span>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/each}
                    </div>
                    {/if}
                {/if}
                
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
        padding: var(--space-4);
    }
    
    .modal-content {
        background: var(--white);
        border-radius: var(--radius-small-default);
        max-width: 800px;
        width: 100%;
        max-height: 90vh;
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
        animation: modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    @keyframes modalSlideIn {
        from {
            opacity: 0;
            transform: translateY(12px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
    
    .modal-header {
        padding: var(--space-5) var(--space-6);
        border-bottom: 1px solid var(--gray-200);
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
    
    .btn-primary {
        background: var(--primary-color);
        color: var(--white);
    }
    
    .btn-primary:hover:not(:disabled) {
        background: var(--primary-hover);
    }
    
    .btn-secondary {
        background: var(--gray-100);
        color: var(--dark-text);
    }
    
    .btn-secondary:hover:not(:disabled) {
        background: var(--gray-200);
    }
    
    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .modal-header h2 {
        font-size: 18px;
        font-weight: 600;
        color: var(--gray-800);
        margin: 0;
        font-family: var(--font-primary);
    }
    
    .close-button {
        background: none;
        border: none;
        font-size: 24px;
        color: var(--gray-500);
        cursor: pointer;
        padding: var(--space-2);
        line-height: 1;
        transition: all var(--transition-normal);
        border-radius: var(--radius-small-default);
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .close-button:hover {
        background: var(--gray-100);
        color: var(--dark-text);
    }
    
    .modal-body {
        padding: var(--space-6);
        overflow-y: auto;
        flex: 1;
        min-height: 0;
    }
    
    .add-habit-section {
        padding: var(--space-5);
        background: var(--gray-50);
        border-radius: var(--radius-small-default);
        margin-bottom: var(--space-6);
        border: 2px dashed var(--gray-300);
    }
    
    .add-habit-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    
    .new-habit-input,
    .edit-habit-input {
        padding: var(--space-3);
        font-size: 14px;
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-small-default);
        outline: none;
        background: var(--white);
    }
    
    .color-picker {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
    }
    
    .color-option {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        transition: all var(--transition-normal);
    }
    
    .color-option:hover {
        transform: scale(1.15);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .color-option.selected {
        border-color: var(--gray-800);
        box-shadow: 0 0 0 2px var(--white), 0 0 0 4px var(--gray-800);
        transform: scale(1.1);
    }
    
    .form-actions {
        display: flex;
        gap: var(--space-2);
    }
    
    .form-actions .btn {
        flex: 1;
        width: auto;
        padding: var(--space-2) var(--space-4);
    }
    
    .input {
        background: var(--white);
        border: 1px solid var(--gray-300);
        border-radius: var(--radius-small-default);
        padding: var(--space-2) var(--space-3);
        font-size: 14px;
        transition: all var(--transition-normal);
        width: 100%;
        box-sizing: border-box;
    }
    
    .input:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
        outline: none;
    }

    
    .habits-container {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        margin-bottom: var(--space-6);
    }
    
    .habit-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    
    .habit-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: var(--space-2);
        border-bottom: 2px solid var(--gray-200);
    }
    
    .habit-name {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: 15px;
        font-weight: 600;
        color: var(--dark-text);
        flex: 1;
        min-width: 0;
    }
    
    .habit-name .edit-habit-input {
        flex: 1;
        font-weight: 600;
        font-size: 15px;
        padding: var(--space-1) var(--space-2);
    }
    
    .habit-text {
        flex: 1;
        min-width: 0;
    }
    
    .habit-text.editable {
        cursor: pointer;
        padding: var(--space-1) var(--space-2);
        margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
        border-radius: var(--radius-small-default);
        transition: background-color var(--transition-normal);
    }
    
    .habit-text.editable:hover {
        background: rgba(33, 150, 243, 0.1);
    }
    
    .habit-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }
    
    .delete-habit-button {
        background: none;
        border: none;
        color: var(--gray-400);
        cursor: pointer;
        padding: var(--space-1);
        border-radius: var(--radius-small-default);
        transition: all var(--transition-normal);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .delete-habit-button:hover:not(:disabled) {
        background: #ffebee;
        color: #f44336;
    }
    
    .delete-habit-button:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
    
    .delete-habit-button .material-symbols-outlined {
        font-size: 18px;
    }
    
    .habit-grid {
        display: grid;
        grid-template-columns: repeat(15, 1fr);
        gap: var(--space-2);
    }
    
    .habit-color-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    
    .habit-text {
        flex: 1;
    }
    
    .streak-badge {
        font-size: 11px;
        padding: 2px var(--space-2);
        background: var(--success-bg);
        color: var(--success-text);
        border-radius: 12px;
        font-weight: 600;
    }
    
    .habit-cell {
        aspect-ratio: 1;
        border: 1.5px solid var(--gray-200);
        border-radius: var(--radius-sm);
        background: var(--white);
        cursor: pointer;
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        min-height: 36px;
        position: relative;
    }
    
    .habit-cell:hover {
        border-color: var(--habit-color);
        background: rgba(0, 0, 0, 0.02);
        transform: scale(1.1);
        z-index: 1;
    }
    
    .habit-cell.today {
        border-color: var(--accent-color);
        border-width: 2px;
        box-shadow: 0 0 0 2px rgba(244, 113, 9, 0.15);
    }
    
    .habit-cell.completed {
        background: var(--habit-color);
        border-color: var(--habit-color);
        animation: habitCheck 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .habit-cell.completed.today {
        box-shadow: 0 0 0 2px rgba(244, 113, 9, 0.3);
    }
    
    @keyframes habitCheck {
        0% { transform: scale(1); }
        40% { transform: scale(1.15); }
        100% { transform: scale(1); }
    }
    
    .cell-content {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }
    
    .check-mark {
        color: var(--white);
        font-size: 14px;
        font-weight: bold;
    }
    
    .date-label {
        font-size: 11px;
        color: var(--gray-400);
        font-weight: 500;
    }
    
    .habit-cell:hover .date-label {
        color: var(--habit-color);
        font-weight: 600;
    }
    
    .habit-cell.today .date-label {
        color: var(--accent-color);
        font-weight: 700;
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
    
    /* Mobile responsiveness */
    @media (max-width: 768px) {
        .modal-content {
            max-width: 95vw;
        }
        
        .add-habit-section {
            padding: var(--space-4);
        }
        
        .color-picker {
            justify-content: center;
        }
        
        .color-option {
            width: 28px;
            height: 28px;
        }
        
        .habit-grid {
            grid-template-columns: repeat(10, 1fr);
        }
        
        .habit-name {
            font-size: 13px;
        }
        
        .habit-name .edit-habit-input {
            font-size: 13px;
        }
        
        .habit-color-dot {
            width: 10px;
            height: 10px;
        }
        
        .streak-badge {
            font-size: 10px;
            padding: 1px var(--space-1);
        }
        
        .delete-habit-button .material-symbols-outlined {
            font-size: 16px;
        }
        
        .habit-cell {
            min-height: 30px;
        }
        
        .check-mark {
            font-size: 12px;
        }
        
        .date-label {
            font-size: 10px;
        }
    }
    
    @media (max-width: 576px) {
        .modal-backdrop {
            padding: var(--space-2);
        }
        
        .modal-body {
            padding: var(--space-4);
        }
        
        .add-habit-section {
            padding: var(--space-3);
        }
        
        .new-habit-input {
            font-size: 13px;
            padding: var(--space-2);
        }
        
        .color-picker {
            gap: var(--space-1);
        }
        
        .color-option {
            width: 26px;
            height: 26px;
        }
        
        .form-actions {
            flex-direction: column;
        }
        
        .form-actions .btn {
            width: 100%;
        }
        
        .habits-container {
            gap: var(--space-5);
        }
        
        .habit-grid {
            grid-template-columns: repeat(7, 1fr);
            gap: var(--space-1);
        }
        
        .habit-name {
            font-size: 12px;
            gap: var(--space-1);
        }
        
        .habit-cell {
            min-height: 28px;
        }
        
    }
</style>
