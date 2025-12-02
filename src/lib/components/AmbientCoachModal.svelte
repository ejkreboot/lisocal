<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import { supabase } from '$lib/supabase.js'
    
    export let isOpen = false
    export let canEdit = true
    export let calendarId: string
    export let shareToken: string | null = null
    
    const dispatch = createEventDispatcher()
    
    // Goal types
    type Goal = {
        id: string
        title: string
        description: string
        target_date: string
        progress: number
        color: string
        category: string
        daily_action: string
        created_at: string
    }
    
    type GoalProgress = {
        id: string
        goal_id: string
        progress_date: string
        progress_value: number
        notes?: string
    }
    
    let goals: Goal[] = []
    let goalProgress: GoalProgress[] = []
    let loading = false
    let showAddGoal = false
    let editingGoalId: string | null = null
    let deletingGoalId: string | null = null
    
    // Form states
    let newGoal = {
        title: '',
        description: '',
        target_date: '',
        color: '#7c3aed',
        category: 'Personal',
        daily_action: ''
    }
    
    let editGoal = {
        title: '',
        description: '',
        target_date: '',
        color: '#7c3aed',
        category: 'Personal',
        daily_action: ''
    }
    
    // Categories and colors
    const categories = [
        'Personal', 'Health', 'Career', 'Learning', 'Financial', 'Creative', 'Relationships', 'Travel'
    ]
    
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
    
    // Load goals when modal opens
    $: if (isOpen && calendarId) {
        loadGoals()
    }
    
    async function loadGoals() {
        if (!calendarId) return
        
        loading = true
        try {
            const params = new URLSearchParams({ calendarId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/goals?${params}`, {
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to load goals')
            }
            
            const data = await response.json()
            goals = data.goals || []
            goalProgress = data.progress || []
        } catch (error) {
            console.error('Error loading goals:', error)
            goals = []
            goalProgress = []
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
        showAddGoal = false
        editingGoalId = null
        resetForms()
        dispatch('close')
    }
    
    function resetForms() {
        newGoal = {
            title: '',
            description: '',
            target_date: '',
            color: '#7c3aed',
            category: 'Personal',
            daily_action: ''
        }
        editGoal = {
            title: '',
            description: '',
            target_date: '',
            color: '#7c3aed',
            category: 'Personal',
            daily_action: ''
        }
    }
    
    function handleModalClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            closeModal()
        }
    }
    
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            if (editingGoalId) {
                cancelEditGoal()
            } else if (showAddGoal) {
                cancelAddGoal()
            } else {
                closeModal()
            }
        }
    }
    
    // Goal management functions
    function startAddGoal() {
        showAddGoal = true
        resetForms()
        setTimeout(() => {
            const input = document.querySelector('.new-goal-title-input') as HTMLInputElement
            if (input) input.focus()
        }, 0)
    }
    
    function cancelAddGoal() {
        showAddGoal = false
        resetForms()
    }
    
    async function addGoal() {
        if (!newGoal.title.trim() || !canEdit || !calendarId) return
        
        try {
            const params = shareToken ? `?shareToken=${shareToken}` : ''
            const response = await fetch(`/api/goals${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    calendarId,
                    title: newGoal.title.trim(),
                    description: newGoal.description.trim(),
                    target_date: newGoal.target_date,
                    color: newGoal.color,
                    category: newGoal.category,
                    daily_action: newGoal.daily_action.trim()
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to create goal')
            }
            
            const data = await response.json()
            goals = [...goals, data.goal]
            cancelAddGoal()
        } catch (error) {
            console.error('Error creating goal:', error)
        }
    }
    
    function startEditGoal(goalId: string) {
        const goal = goals.find(g => g.id === goalId)
        if (!goal || !canEdit) return
        
        editingGoalId = goalId
        editGoal = {
            title: goal.title,
            description: goal.description,
            target_date: goal.target_date,
            color: goal.color,
            category: goal.category,
            daily_action: goal.daily_action
        }
        
        setTimeout(() => {
            const input = document.querySelector('.edit-goal-title-input') as HTMLInputElement
            if (input) {
                input.focus()
                input.select()
            }
        }, 0)
    }
    
    function cancelEditGoal() {
        editingGoalId = null
        resetForms()
    }
    
    async function saveEditGoal() {
        if (!editGoal.title.trim() || editingGoalId === null) {
            cancelEditGoal()
            return
        }
        
        try {
            const params = new URLSearchParams({ goalId: editingGoalId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/goals?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    title: editGoal.title.trim(),
                    description: editGoal.description.trim(),
                    target_date: editGoal.target_date,
                    color: editGoal.color,
                    category: editGoal.category,
                    daily_action: editGoal.daily_action.trim()
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to update goal')
            }
            
            const data = await response.json()
            goals = goals.map(g => g.id === editingGoalId ? data.goal : g)
            cancelEditGoal()
        } catch (error) {
            console.error('Error updating goal:', error)
            cancelEditGoal()
        }
    }
    
    async function deleteGoal(goalId: string) {
        if (!canEdit) return
        
        const goal = goals.find(g => g.id === goalId)
        if (!goal) return
        
        if (!confirm(`Delete "${goal.title}"? This will remove all progress history for this goal.`)) {
            return
        }
        
        deletingGoalId = goalId
        
        try {
            const params = new URLSearchParams({ goalId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/goals?${params}`, {
                method: 'DELETE',
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (!response.ok) {
                throw new Error('Failed to delete goal')
            }
            
            goals = goals.filter(g => g.id !== goalId)
            goalProgress = goalProgress.filter(p => p.goal_id !== goalId)
        } catch (error) {
            console.error('Error deleting goal:', error)
        } finally {
            deletingGoalId = null
        }
    }
    
    async function updateProgress(goalId: string, newProgress: number) {
        if (!canEdit) return
        
        try {
            const params = new URLSearchParams({ goalId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/goals?${params}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify({
                    progress: Math.max(0, Math.min(100, newProgress))
                })
            })
            
            if (!response.ok) {
                throw new Error('Failed to update progress')
            }
            
            // Update local state
            goals = goals.map(g => g.id === goalId ? { ...g, progress: Math.max(0, Math.min(100, newProgress)) } : g)
        } catch (error) {
            console.error('Error updating progress:', error)
        }
    }
    
    function getProgressColor(progress: number): string {
        if (progress < 30) return '#ef4444'      // red
        if (progress < 70) return '#f59e0b'     // amber  
        return '#10b981'                        // green
    }
    
    function formatTargetDate(dateStr: string): string {
        const date = new Date(dateStr)
        const today = new Date()
        const diffTime = date.getTime() - today.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        
        if (diffDays < 0) return 'Overdue'
        if (diffDays === 0) return 'Due today'
        if (diffDays === 1) return 'Due tomorrow'
        if (diffDays < 30) return `${diffDays} days left`
        
        const months = Math.ceil(diffDays / 30)
        return `${months} month${months > 1 ? 's' : ''} left`
    }
    
    function getCategoryIcon(category: string): string {
        const icons: Record<string, string> = {
            'Personal': 'person',
            'Health': 'favorite',
            'Career': 'work',
            'Learning': 'school',
            'Financial': 'account_balance',
            'Creative': 'palette',
            'Relationships': 'group',
            'Travel': 'flight'
        }
        return icons[category] || 'flag'
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-backdrop" onclick={handleModalClick}>
        <div class="modal-content" role="dialog" aria-labelledby="coach-modal-title" aria-modal="true">
            <div class="modal-header">
                <div class="header-left">
                    <span class="material-symbols-outlined coach-icon">psychology</span>
                    <h2 id="coach-modal-title">Ambient Coach</h2>
                </div>
                <div class="header-actions">
                    {#if canEdit}
                        <button 
                            class="btn btn-sm btn-primary"
                            onclick={startAddGoal}
                            title="Add new goal"
                            disabled={loading || showAddGoal}
                        >
                            <span class="material-symbols-outlined">add</span>
                            Add Goal
                        </button>
                    {/if}
                    <button class="close-button" onclick={closeModal} aria-label="Close ambient coach">
                        ×
                    </button>
                </div>
            </div>
            
            <div class="modal-body">
                {#if loading}
                    <div class="loading-state">
                        <p>Loading goals...</p>
                    </div>
                {:else}
                    <!-- Add Goal Form -->
                    {#if showAddGoal}
                        <div class="add-goal-section">
                            <h3>Create New Goal</h3>
                            <div class="goal-form">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="new-goal-title">Goal Title</label>
                                        <input 
                                            id="new-goal-title"
                                            class="input new-goal-title-input"
                                            bind:value={newGoal.title}
                                            placeholder="What do you want to achieve?"
                                        />
                                    </div>
                                    <div class="form-group">
                                        <label for="new-goal-category">Category</label>
                                        <select id="new-goal-category" class="select" bind:value={newGoal.category}>
                                            {#each categories as category}
                                                <option value={category}>{category}</option>
                                            {/each}
                                        </select>
                                    </div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="new-goal-description">Description</label>
                                    <textarea 
                                        id="new-goal-description"
                                        class="textarea"
                                        bind:value={newGoal.description}
                                        placeholder="Describe your goal in more detail..."
                                        rows="3"
                                    ></textarea>
                                </div>
                                
                                <div class="form-row">
                                    <div class="form-group">
                                        <label for="new-goal-target">Target Date</label>
                                        <input 
                                            id="new-goal-target"
                                            type="date"
                                            class="input"
                                            bind:value={newGoal.target_date}
                                        />
                                    </div>
                                    <div class="form-group">
                                        <label for="new-goal-color">Color</label>
                                        <div id="new-goal-color" class="color-picker">
                                            {#each colorPalette as color}
                                                <button
                                                    type="button"
                                                    class="color-option"
                                                    class:selected={newGoal.color === color.value}
                                                    style="background-color: {color.value}"
                                                    onclick={() => newGoal.color = color.value}
                                                    title={color.name}
                                                    aria-label="Select {color.name} color"
                                                ></button>
                                            {/each}
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="form-group">
                                    <label for="new-goal-action">Daily Action</label>
                                    <input 
                                        id="new-goal-action"
                                        class="input"
                                        bind:value={newGoal.daily_action}
                                        placeholder="What small action can you take daily?"
                                    />
                                </div>
                                
                                <div class="form-actions">
                                    <button 
                                        class="btn btn-primary"
                                        onclick={addGoal}
                                        disabled={!newGoal.title.trim() || !newGoal.target_date}
                                    >
                                        Create Goal
                                    </button>
                                    <button 
                                        class="btn btn-secondary"
                                        onclick={cancelAddGoal}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/if}
                    
                    <!-- Goals List -->
                    {#if goals.length === 0 && !showAddGoal}
                        <div class="empty-state">
                            <span class="material-symbols-outlined empty-icon">psychology</span>
                            <h3>Welcome to your Ambient Coach!</h3>
                            <p>Start by setting meaningful, long-term goals that inspire you. Your ambient coach will help you stay focused and make daily progress.</p>
                            {#if canEdit}
                                <button class="btn btn-primary" onclick={startAddGoal}>
                                    Create Your First Goal
                                </button>
                            {/if}
                        </div>
                    {:else if goals.length > 0}
                        <div class="goals-container">
                            <div class="section-header">
                                <h3>Your Goals</h3>
                                <p class="section-subtitle">Track progress toward what matters most</p>
                            </div>
                            
                            <div class="goals-grid">
                                {#each goals as goal}
                                    <div class="goal-card" style="border-left-color: {goal.color}">
                                        <div class="goal-header">
                                            <div class="goal-meta">
                                                <span class="material-symbols-outlined category-icon" style="color: {goal.color}">
                                                    {getCategoryIcon(goal.category)}
                                                </span>
                                                <div class="goal-info">
                                                    {#if editingGoalId === goal.id}
                                                        <input 
                                                            class="input edit-goal-title-input"
                                                            bind:value={editGoal.title}
                                                        />
                                                    {:else}
                                                        <button class="goal-title-button" onclick={() => canEdit && startEditGoal(goal.id)} disabled={!canEdit}>
                                                            {goal.title}
                                                        </button>
                                                    {/if}
                                                    <div class="goal-category-date">
                                                        <span class="goal-category">{goal.category}</span>
                                                        <span class="goal-timeline">{formatTargetDate(goal.target_date)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {#if canEdit && editingGoalId !== goal.id}
                                                <div class="goal-actions">
                                                    <button 
                                                        class="action-btn edit-btn"
                                                        onclick={() => startEditGoal(goal.id)}
                                                        title="Edit goal"
                                                    >
                                                        <span class="material-symbols-outlined">edit</span>
                                                    </button>
                                                    <button 
                                                        class="action-btn delete-btn"
                                                        onclick={() => deleteGoal(goal.id)}
                                                        title="Delete goal"
                                                        disabled={deletingGoalId === goal.id}
                                                    >
                                                        <span class="material-symbols-outlined">delete</span>
                                                    </button>
                                                </div>
                                            {/if}
                                        </div>
                                        
                                        {#if editingGoalId === goal.id}
                                            <div class="edit-goal-form">
                                                <textarea 
                                                    class="textarea"
                                                    bind:value={editGoal.description}
                                                    placeholder="Goal description..."
                                                    rows="2"
                                                ></textarea>
                                                <input 
                                                    class="input"
                                                    bind:value={editGoal.daily_action}
                                                    placeholder="Daily action..."
                                                />
                                                <div class="form-actions">
                                                    <button class="btn btn-sm btn-primary" onclick={saveEditGoal}>Save</button>
                                                    <button class="btn btn-sm btn-secondary" onclick={cancelEditGoal}>Cancel</button>
                                                </div>
                                            </div>
                                        {:else}
                                            <div class="goal-content">
                                                <p class="goal-description">{goal.description}</p>
                                                
                                                <div class="progress-section">
                                                    <div class="progress-header">
                                                        <span class="progress-label">Progress</span>
                                                        <span class="progress-percentage" style="color: {getProgressColor(goal.progress)}">
                                                            {goal.progress}%
                                                        </span>
                                                    </div>
                                                    <div class="progress-bar-container">
                                                        <div class="progress-bar">
                                                            <div 
                                                                class="progress-fill" 
                                                                style="width: {goal.progress}%; background-color: {getProgressColor(goal.progress)}"
                                                            ></div>
                                                        </div>
                                                        {#if canEdit}
                                                            <div class="progress-controls">
                                                                <button 
                                                                    class="progress-btn"
                                                                    onclick={() => updateProgress(goal.id, goal.progress - 5)}
                                                                    disabled={goal.progress <= 0}
                                                                    title="Decrease progress"
                                                                >−</button>
                                                                <button 
                                                                    class="progress-btn"
                                                                    onclick={() => updateProgress(goal.id, goal.progress + 5)}
                                                                    disabled={goal.progress >= 100}
                                                                    title="Increase progress"
                                                                >+</button>
                                                            </div>
                                                        {/if}
                                                    </div>
                                                </div>
                                                
                                                {#if goal.daily_action}
                                                    <div class="daily-action">
                                                        <span class="material-symbols-outlined action-icon">lightbulb</span>
                                                        <span class="action-text">{goal.daily_action}</span>
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
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
        max-width: 900px;
        width: 100%;
        max-height: 90vh;
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
        animation: modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: var(--font-primary);
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
    
    .header-left {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }
    
    .coach-icon {
        color: #7c3aed;
        font-size: 24px;
    }
    
    .modal-header h2 {
        font-size: 20px;
        font-weight: 600;
        color: var(--gray-800);
        margin: 0;
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
        padding: var(--space-2) var(--space-4);
        font-family: inherit;
    }
    
    .btn-sm {
        padding: var(--space-2);
        font-size: 12px;
    }
    
    .btn-primary {
        background: var(--primary-color);
        color: var(--white);
    }
    
    .btn-primary:hover:not(:disabled) {
        background: var(--primary-hover);
        transform: translateY(-1px);
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
        transform: none;
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
    
    /* Loading and Empty States */
    .loading-state,
    .empty-state {
        text-align: center;
        padding: var(--space-8) var(--space-4);
        color: var(--gray-500);
    }
    
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-4);
    }
    
    .empty-icon {
        font-size: 48px;
        color: var(--gray-400);
    }
    
    .empty-state h3 {
        margin: 0;
        color: var(--gray-700);
        font-size: 18px;
    }
    
    .empty-state p {
        margin: 0;
        max-width: 400px;
        line-height: 1.6;
    }
    
    /* Add Goal Form */
    .add-goal-section {
        margin-bottom: var(--space-6);
        padding: var(--space-5);
        background: var(--gray-50);
        border-radius: var(--radius-small-default);
        border: 2px dashed var(--gray-300);
    }
    
    .add-goal-section h3 {
        margin: 0 0 var(--space-4) 0;
        color: var(--gray-800);
        font-size: 16px;
    }
    
    .goal-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
    }
    
    .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4);
    }
    
    .form-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    
    .form-group label {
        font-size: 13px;
        font-weight: 600;
        color: var(--gray-700);
    }
    
    .input,
    .textarea,
    .select {
        background: var(--white);
        border: 1px solid var(--gray-300);
        border-radius: var(--radius-small-default);
        padding: var(--space-3);
        font-size: 14px;
        transition: all var(--transition-normal);
        font-family: inherit;
    }
    
    .input:focus,
    .textarea:focus,
    .select:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
        outline: none;
    }
    
    .textarea {
        resize: vertical;
        min-height: 80px;
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
    
    /* Goals Container */
    .goals-container {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
    }
    
    .section-header {
        text-align: center;
        margin-bottom: var(--space-4);
    }
    
    .section-header h3 {
        margin: 0 0 var(--space-2) 0;
        color: var(--gray-800);
        font-size: 18px;
    }
    
    .section-subtitle {
        margin: 0;
        color: var(--gray-600);
        font-size: 14px;
    }
    
    .goals-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: var(--space-5);
    }
    
    /* Goal Cards */
    .goal-card {
        background: var(--white);
        border: 1px solid var(--gray-200);
        border-left-width: 4px;
        border-radius: var(--radius-small-default);
        padding: var(--space-5);
        transition: all var(--transition-normal);
    }
    
    .goal-card:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
    }
    
    .goal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--space-4);
    }
    
    .goal-meta {
        display: flex;
        gap: var(--space-3);
        flex: 1;
    }
    
    .category-icon {
        font-size: 20px;
        margin-top: 2px;
    }
    
    .goal-info {
        flex: 1;
    }
    
    .goal-title-button {
        background: none;
        border: none;
        text-align: left;
        width: 100%;
        font-family: inherit;
        margin: 0 0 var(--space-1) 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--gray-800);
        cursor: pointer;
        padding: var(--space-1);
        margin: calc(-1 * var(--space-1));
        border-radius: var(--radius-sm);
        transition: background-color var(--transition-normal);
    }
    
    .goal-title-button:hover:not(:disabled) {
        background: rgba(0, 0, 0, 0.05);
    }
    
    .goal-title-button:disabled {
        cursor: default;
    }
    
    .edit-goal-title-input {
        font-size: 16px;
        font-weight: 600;
        padding: var(--space-1) var(--space-2);
        margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
    }
    
    .goal-category-date {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-2);
    }
    
    .goal-category {
        font-size: 12px;
        color: var(--gray-600);
        background: var(--gray-100);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-sm);
        font-weight: 500;
    }
    
    .goal-timeline {
        font-size: 11px;
        color: var(--gray-500);
        font-weight: 500;
    }
    
    .goal-actions {
        display: flex;
        gap: var(--space-1);
    }
    
    .action-btn {
        background: none;
        border: none;
        color: var(--gray-400);
        cursor: pointer;
        padding: var(--space-1);
        border-radius: var(--radius-sm);
        transition: all var(--transition-normal);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .edit-btn:hover {
        background: #e3f2fd;
        color: #1976d2;
    }
    
    .delete-btn:hover:not(:disabled) {
        background: #ffebee;
        color: #f44336;
    }
    
    .action-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
    
    .action-btn .material-symbols-outlined {
        font-size: 16px;
    }
    
    /* Goal Content */
    .goal-content {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
    }
    
    .goal-description {
        margin: 0;
        font-size: 14px;
        color: var(--gray-600);
        line-height: 1.5;
    }
    
    .edit-goal-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    
    .edit-goal-form .form-actions {
        flex-direction: row;
        justify-content: flex-end;
    }
    
    /* Progress Section */
    .progress-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    
    .progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .progress-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--gray-700);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .progress-percentage {
        font-size: 14px;
        font-weight: 700;
    }
    
    .progress-bar-container {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }
    
    .progress-bar {
        flex: 1;
        height: 8px;
        background: var(--gray-200);
        border-radius: 4px;
        overflow: hidden;
    }
    
    .progress-fill {
        height: 100%;
        border-radius: 4px;
        transition: width var(--transition-normal);
    }
    
    .progress-controls {
        display: flex;
        gap: var(--space-1);
    }
    
    .progress-btn {
        background: var(--gray-100);
        border: 1px solid var(--gray-300);
        color: var(--gray-600);
        width: 24px;
        height: 24px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 12px;
        font-weight: bold;
        transition: all var(--transition-normal);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .progress-btn:hover:not(:disabled) {
        background: var(--gray-200);
        color: var(--gray-800);
    }
    
    .progress-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    /* Daily Action */
    .daily-action {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3);
        background: rgba(16, 185, 129, 0.1);
        border-radius: var(--radius-small-default);
        border: 1px solid rgba(16, 185, 129, 0.2);
    }
    
    .action-icon {
        color: #10b981;
        font-size: 16px;
    }
    
    .action-text {
        font-size: 13px;
        color: var(--gray-700);
        font-weight: 500;
    }
    
    /* Mobile responsiveness */
    @media (max-width: 768px) {
        .modal-content {
            max-width: 95vw;
            max-height: 95vh;
        }
        
        .modal-header {
            padding: var(--space-4) var(--space-5);
        }
        
        .modal-body {
            padding: var(--space-4) var(--space-5);
        }
        
        .goals-grid {
            grid-template-columns: 1fr;
            gap: var(--space-4);
        }
        
        .form-row {
            grid-template-columns: 1fr;
            gap: var(--space-3);
        }
        
        .goal-card {
            padding: var(--space-4);
        }
        
        .goal-header {
            flex-direction: column;
            gap: var(--space-3);
        }
        
        .goal-actions {
            align-self: flex-end;
        }
    }
</style>