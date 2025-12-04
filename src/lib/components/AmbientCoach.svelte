<script lang="ts">
    import { onMount } from 'svelte'
    import quotes from '$lib/assets/quotes.json'
    import { supabase } from '$lib/supabase.js'
    
    let { visible = true, calendarId = '', shareToken = null } = $props()
    
    // Goal type
    type Goal = {
        id: string
        title: string
        description?: string
        progress: number
        color: string
        target_date: string
        daily_action?: string
        category?: string
    }
    
    // Daily inspiration
    let currentQuote = $state({ quote: '', author: '' })
    let showQuote = $state(false)
    
    // Goals - loaded from API
    let goals = $state<Goal[]>([])
    let transformationalGoal = $state<Goal | null>(null)
    let todaysNudge = $state('')
    let editingGoal = $state(false)
    let editGoalText = $state('')
    
    onMount(() => {
        // Select a daily quote based on the day
        const today = new Date()
        const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000)
        const quoteIndex = dayOfYear % quotes.length
        currentQuote = {
            quote: quotes[quoteIndex].quote,
            author: quotes[quoteIndex].author
        }
        
        // Load goals if calendar ID is available
        if (calendarId) {
            loadGoals()
        }
    })
    
    // Load goals when calendarId changes
    $effect(() => {
        if (calendarId && visible) {
            loadGoals()
        }
    })
    
    async function loadGoals() {
        if (!calendarId) return
        
        try {
            const params = new URLSearchParams({ calendarId })
            if (shareToken) params.append('shareToken', shareToken)
            
            const response = await fetch(`/api/goals?${params}`, {
                headers: shareToken ? {} : {
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            })
            
            if (response.ok) {
                const data = await response.json()
                const allGoals = data.goals || []
                
                // Separate transformational goal
                transformationalGoal = allGoals.find((g: Goal) => g.category === 'Transformational') || null
                goals = allGoals.filter((g: Goal) => g.category !== 'Transformational')
                
                // Generate today's nudge
                if (goals.length > 0) {
                    const randomGoal = goals[Math.floor(Math.random() * goals.length)]
                    todaysNudge = randomGoal.daily_action || `Work on: ${randomGoal.title}`
                }
            }
        } catch (error) {
            console.error('Error loading goals:', error)
            goals = []
        }
    }
    
    async function getAuthToken() {
        const { data: { session } } = await supabase.auth.getSession()
        return session?.access_token || ''
    }
    
    function toggleQuote() {
        showQuote = !showQuote
    }

    function startEditGoal() {
        editGoalText = transformationalGoal?.title || ''
        editingGoal = true
        
        setTimeout(() => {
            const input = document.querySelector('.goal-edit-input') as HTMLInputElement
            if (input) {
                input.focus()
                input.select()
            }
        }, 0)
    }
    
    function cancelEditGoal() {
        editingGoal = false
        editGoalText = ''
    }

    async function saveGoal() {
        if (!editGoalText.trim() || !calendarId) {
            cancelEditGoal()
            return
        }

        try {
            const method = transformationalGoal ? 'PUT' : 'POST';
            let url = '/api/goals';
            if (transformationalGoal) {
                const params = new URLSearchParams({ goalId: transformationalGoal.id });
                if (shareToken) params.append('shareToken', shareToken);
                url += `?${params}`;
            }
            
            const body: any = {
                calendarId,
                title: editGoalText.trim(),
                category: 'Transformational',
                color: '#7c3aed' // Purple for transformational
            };

            // If creating, we need these
            if (!transformationalGoal) {
                // Set target date to 10 years from now
                const targetDate = new Date();
                targetDate.setFullYear(targetDate.getFullYear() + 10);
                body.target_date = targetDate.toISOString();
            }

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(shareToken ? {} : { 'Authorization': `Bearer ${await getAuthToken()}` })
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                await loadGoals()
                editingGoal = false
                editGoalText = ''
            }
        } catch (error) {
            console.error('Error saving transformational goal:', error);
        }
    }
    
    function handleGoalKeydown(event: KeyboardEvent) {
        event.stopPropagation()
        if (event.key === 'Escape') {
            event.preventDefault()
            cancelEditGoal()
        } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            saveGoal()
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
</script>

{#if visible}
    <div class="ambient-coach" role="complementary" aria-label="Ambient Coach">
        <!-- Transformational Goal Card -->
        {#if showQuote}
            <div class="inspiration-card">
                <div class="card-header">
                    <span class="material-symbols-outlined inspiration-icon">hiking</span>
                    <span class="card-title">Where I am headed</span>
                    <button class="minimize-btn" onclick={toggleQuote} aria-label="Minimize goal">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                {#if editingGoal}
                    <input
                        type="text"
                        class="goal-edit-input"
                        bind:value={editGoalText}
                        onkeydown={handleGoalKeydown}
                        onblur={saveGoal}
                        placeholder="In 10 years, I will be a person who..."
                    />
                {:else}
                    <div 
                        class="transformational-goal" 
                        onclick={startEditGoal} 
                        role="button" 
                        tabindex="0" 
                        onkeydown={(e) => e.key === 'Enter' && startEditGoal()}
                    >
                        {#if transformationalGoal}
                            <p class="goal-text">"{transformationalGoal.title}"</p>
                        {:else}
                            <p class="goal-placeholder">In 10 years, I will be a person who...</p>
                        {/if}
                    </div>
                {/if}
            </div>
        {:else}
            <button class="inspiration-toggle" onclick={toggleQuote} aria-label="Show goal">
                <span class="material-symbols-outlined">hiking</span>
            </button>
        {/if}
        
        <!-- Today's Nudge -->
        {#if todaysNudge}
            <div class="nudge-card">
                <div class="card-header">
                    <span class="material-symbols-outlined nudge-icon">lightbulb</span>
                    <span class="card-title">Today's Focus</span>
                </div>
                <p class="nudge-text">{todaysNudge}</p>
            </div>
        {/if}
        
        <!-- Goals Progress (compact) -->
        {#if goals.length > 0}
            <div class="goals-progress-card">
                <div class="card-header">
                    <span class="material-symbols-outlined goals-icon">flag</span>
                    <span class="card-title">Goals Progress</span>
                </div>
                <div class="goals-list">
                    {#each goals.slice(0, 3) as goal}
                        <div class="goal-item">
                            <div class="goal-info">
                                <span class="goal-title">{goal.title}</span>
                                <span class="goal-timeline">{formatTargetDate(goal.target_date)}</span>
                            </div>
                            <div class="goal-progress">
                                <div class="progress-bar">
                                    <div 
                                        class="progress-fill" 
                                        style="width: {goal.progress}%; background-color: {getProgressColor(goal.progress)}"
                                    ></div>
                                </div>
                                <span class="progress-text">{goal.progress}%</span>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>    
{/if}

<style>
    .ambient-coach {
        position: fixed;
        top: 102px;
        right: 20px;
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        max-width: 400px;
        min-width: 400px;
        pointer-events: auto;
    }
    
    .inspiration-card,
    .nudge-card,
    .goals-progress-card {
        background: rgba(254, 243, 226, 0.6);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(251, 146, 60, 0.3);
        border-radius: var(--radius-small-default);
        padding: var(--space-3);
        box-shadow: 0 2px 6px rgba(251, 146, 60, 0.08);
        transition: all var(--transition-normal);
        font-family: var(--font-primary);
    }
    
    .inspiration-card:hover,
    .nudge-card:hover,
    .goals-progress-card:hover {
        box-shadow: 0 4px 12px rgba(251, 146, 60, 0.12);
        transform: translateY(-1px);
    }
    
    .card-header {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
        font-weight: 600;
        color: var(--gray-700);
    }
    
    .card-title {
        flex: 1;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--gray-600);
        font-weight: 500;
    }
    
    .inspiration-icon {
        color: rgba(255, 152, 0, 0.7);
        font-size: 16px;
        font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 16;
    }
    
    .nudge-icon {
        color: #10b981;
        font-size: 18px;
    }
    
    .goals-icon {
        color: #3b82f6; /* Blue for other goals */
        font-size: 18px;
    }
    
    .minimize-btn {
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
    
    .minimize-btn:hover {
        background: var(--gray-100);
        color: var(--gray-600);
    }
    
    .minimize-btn .material-symbols-outlined {
        font-size: 16px;
    }
    
    .inspiration-toggle {
        position: fixed;
        top: 102px;
        right: 20px;
        background: rgba(254, 243, 226, 0.8);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(251, 146, 60, 0.3);
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--transition-normal);
        box-shadow: 0 2px 6px rgba(251, 146, 60, 0.08);
        z-index: 100;
    }
    
    .inspiration-toggle:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(251, 146, 60, 0.15);
    }
    
    .inspiration-toggle .material-symbols-outlined {
        color: rgba(255, 152, 0, 0.7);
        font-size: 20px;
        font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20;
    }
    
    .transformational-goal {
        cursor: pointer;
        padding: var(--space-2);
        margin: 0 -var(--space-2);
        border-radius: var(--radius-sm);
        transition: background-color var(--transition-fast);
    }
    
    .transformational-goal:hover {
        background-color: rgba(124, 58, 237, 0.05);
    }
    
    .goal-text {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--gray-600);
        font-weight: 400;
        font-style: italic;
    }
    
    .goal-placeholder {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--gray-400);
        font-weight: 300;
        font-style: italic;
    }
    
    .goal-edit-input {
        width: 100%;
        border: 2px solid #fb923c;
        border-radius: var(--radius-small-default);
        padding: var(--space-3);
        font-size: 14px;
        font-family: 'Sorts Mill Goudy', serif;
        font-style: italic;
        color: var(--gray-700);
        background: var(--white);
        outline: none;
        transition: all var(--transition-normal);
    }
    
    .goal-edit-input:focus {
        border-color: #f97316;
        box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.1);
    }
    
    .nudge-text {
        margin: 0;
        font-size: 14px;
        color: var(--gray-600);
        font-weight: 500;
    }
    
    .goals-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    
    .goal-item {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    
    .goal-info {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--space-2);
    }
    
    .goal-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--gray-700);
        flex: 1;
    }
    
    .goal-timeline {
        font-size: 11px;
        color: var(--gray-500);
        white-space: nowrap;
    }
    
    .goal-progress {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }
    
    .progress-bar {
        flex: 1;
        height: 6px;
        background: var(--gray-200);
        border-radius: 3px;
        overflow: hidden;
    }
    
    .progress-fill {
        height: 100%;
        border-radius: 3px;
        transition: width var(--transition-normal);
    }
    
    .progress-text {
        font-size: 11px;
        font-weight: 600;
        color: var(--gray-600);
        min-width: 30px;
        text-align: right;
    }
    
    /* Mobile responsiveness */
    @media (max-width: 1200px) {
        .ambient-coach {
            display: none;
        }        
    }
    
    @media (max-width: 768px) {
        .ambient-coach {
            gap: var(--space-2);
            padding: 0 var(--space-3);
        }
        
        .inspiration-card,
        .nudge-card,
        .goals-progress-card {
            padding: var(--space-3);
        }
        
        .goal-text, .goal-placeholder {
            font-size: 13px;
        }
        
        .goal-item {
            gap: var(--space-1);
        }
        
        .goal-title {
            font-size: 12px;
        }
    }
</style>