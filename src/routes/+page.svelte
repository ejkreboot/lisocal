<script lang="ts">
    import { onMount } from 'svelte'
    import { getMonthName } from '$lib/calendar-utils.js'
    import CalendarMonth from '$lib/components/CalendarMonth.svelte'
    import ShareDialog from '$lib/components/ShareDialog.svelte'
    import ExternalCalendarModal from '$lib/components/ExternalCalendarModal.svelte'
    import TodoModal from '$lib/components/TodoModal.svelte'
    import { user, session, loading, signOut } from '$lib/auth.js'
    import { supabase } from '$lib/supabase.js'
    
    export let data: any
    
    let userCalendar: any = null
    let showShareDialog = false
    let showExternalCalendarModal = false
    let showTodoModal = false
    let editingTitle = false
    let titleInput = ''
    
    // Load user's calendar when they sign in
    $: if ($user && $session) {
        loadUserCalendar()
    }
    
    async function loadUserCalendar() {
        if (!$user || !$session) return
        
        try {
            const response = await fetch('/api/setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: $user.id,
                    userEmail: $user.email,
                    accessToken: $session.access_token
                })
            })
            
            if (response.ok) {
                const result = await response.json()
                if (result.success && result.calendar) {
                    userCalendar = result.calendar
                }
            }
        } catch (error) {
            console.error('Error setting up calendar:', error)
        }
    }
    
    async function handleSignOut() {
        await signOut()
        userCalendar = null
    }
    
    function startEditingTitle() {
        if (!$user || !userCalendar) return
        editingTitle = true
        titleInput = userCalendar.name
        setTimeout(() => {
            const input = document.querySelector('.title-input') as HTMLInputElement
            if (input) {
                input.focus()
                input.select()
            }
        }, 0)
    }
    
    async function saveTitle() {
        if (!$user || !userCalendar || !titleInput.trim()) {
            cancelEditingTitle()
            return
        }
        
        try {
            const response = await fetch('/api/calendar/title', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    calendarId: userCalendar.id,
                    name: titleInput.trim()
                })
            })
            
            if (response.ok) {
                userCalendar.name = titleInput.trim()
                editingTitle = false
            } else {
                console.error('Failed to update calendar title')
                cancelEditingTitle()
            }
        } catch (error) {
            console.error('Error updating calendar title:', error)
            cancelEditingTitle()
        }
    }
    
    function cancelEditingTitle() {
        editingTitle = false
        titleInput = ''
    }
    
    function handleTitleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            saveTitle()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelEditingTitle()
        }
    }
    
    let currentDate = new Date()
    let currentYear = currentDate.getFullYear()
    let currentMonth = currentDate.getMonth()
    
    function previousMonth() {
        if (currentMonth === 0) {
            currentMonth = 11
            currentYear--
        } else {
            currentMonth--
        }
    }
    
    function nextMonth() {
        if (currentMonth === 11) {
            currentMonth = 0
            currentYear++
        } else {
            currentMonth++
        }
    }
    
    function goToToday() {
        const today = new Date()
        currentYear = today.getFullYear()
        currentMonth = today.getMonth()
    }
    
    $: monthName = getMonthName(currentMonth)
    $: canEdit = !!$user || (data.sharedCalendar && data.sharedCalendar.permissions === 'edit')
    $: calendarId = userCalendar?.id || data.sharedCalendar?.id
</script>

<svelte:head>
    <title>Calendgnar - {monthName} {currentYear}</title>
    <meta name="description" content="A personal calendar that shreds the gnar" />
</svelte:head>

<div class="calendar-container">
    <header class="calendar-header">
        <div class="header-left">
            <div class="logo-title">
                <img src="/logo-navbar.png" alt="Calendgnar logo" class="navbar-logo" />
                <h1>Calendgnar</h1>
            </div>
            {#if data.sharedCalendar}
                <div class="shared-calendar-info">
                    <div class="calendar-title-row">
                        <span class="calendar-name">{data.sharedCalendar.name}</span>
                        {#if data.sharedCalendar.ownerEmail}
                            <span class="owner-email">{data.sharedCalendar.ownerEmail}</span>
                        {/if}
                    </div>
                </div>
            {:else if $user && userCalendar}
                <div class="shared-calendar-info">
                    <div class="calendar-title-row">
                        {#if editingTitle}
                            <input 
                                class="title-input"
                                bind:value={titleInput}
                                on:keydown={handleTitleKeydown}
                                on:blur={saveTitle}
                                placeholder="Calendar Name"
                            />
                        {:else}
                            <button class="calendar-name-button" on:click={startEditingTitle} title="Click to edit calendar name">
                                {userCalendar.name}
                            </button>
                        {/if}
                        {#if $user?.email}
                            <span class="owner-email">{$user.email}</span>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
        
        <div class="header-center">
            <div class="month-navigation">
                <button class="nav-button" on:click={previousMonth}>‹</button>
                <h2 class="month-year">{monthName} {currentYear}</h2>
                <button class="nav-button" on:click={nextMonth}>›</button>
            </div>
            <button class="today-button" on:click={goToToday}>Today</button>
        </div>
        
        <div class="header-right">
            {#if $loading}
                <div class="loading-spinner">Loading...</div>
            {:else if !$user && !data.sharedCalendar}
                <a href="/auth" class="login-button">Sign In</a>
            {:else if $user || data.sharedCalendar}
                <button 
                    on:click={() => showTodoModal = true} 
                    class="todo-button icon-button"
                    title="To-Do List"
                >
                    <span class="material-symbols-outlined" style="font-size: 16px;">task_alt</span>
                </button>
                {#if $user}
                    <button 
                        on:click={() => showExternalCalendarModal = true} 
                        class="external-cal-button icon-button"
                        title="External Calendars"
                    >
                        <span class="material-symbols-outlined" style="font-size: 16px;">captive_portal</span>
                    </button>
                    <button on:click={() => showShareDialog = true} class="share-button" disabled={!userCalendar?.id}>
                        Share
                    </button>
                    <button on:click={handleSignOut} class="logout-button">Sign Out</button>
                {/if}
            {/if}
        </div>
    </header>
    
    <main class="calendar-main">
        {#if $loading}
            <div class="loading-container">
                <div class="loading-spinner">Loading your calendar...</div>
            </div>
        {:else if calendarId}
            <CalendarMonth 
                year={currentYear} 
                month={currentMonth} 
                {calendarId}
                {canEdit}
                shareToken={data.sharedCalendar?.shareToken || null}
            />
        {:else}
            <div class="no-calendar">
                <h2>Setting up your calendar...</h2>
                <p>
                    {#if $user}
                        Creating your default calendar...
                    {:else}
                        Get started by signing in to access your calendar.
                    {/if}
                </p>
                {#if !$user}
                    <a href="/auth" class="cta-button">Sign In</a>
                {/if}
            </div>
        {/if}
    </main>
</div>

<ShareDialog 
    bind:isOpen={showShareDialog}
    calendarId={userCalendar?.id}
    on:close={() => showShareDialog = false}
/>

<ExternalCalendarModal 
    bind:showModal={showExternalCalendarModal}
    on:close={() => showExternalCalendarModal = false}
    on:calendarsChanged={() => location.reload()}
/>

<TodoModal 
    bind:isOpen={showTodoModal}
    {canEdit}
    calendarId={calendarId || ''}
    shareToken={data.sharedCalendar?.shareToken || null}
    on:close={() => showTodoModal = false}
/>

<style>
    :global(body) {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f8f9fa;
    }
    
    .calendar-container {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }
    
    .calendar-header {
        background: white;
        border-bottom: 1px solid #e0e0e0;
        padding: 16px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
    }
    
    .header-left h1 {
        margin: 0;
        color: #1976d2;
        font-size: 24px;
        font-weight: 700;
    }
    
    .logo-title {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    
    .navbar-logo {
        width: 40px;
        height: 40px;
        object-fit: contain;
    }
    
    .shared-calendar-info {
        margin-top: 4px;
    }
    
    .calendar-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .calendar-name {
        font-weight: 600;
        color: #333;
    }
    
    .calendar-name-button {
        background: none;
        border: none;
        font-weight: 600;
        color: #333;
        font-size: 14px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
        font-family: inherit;
    }
    
    .calendar-name-button:hover {
        background: #f0f0f0;
        color: #2196f3;
    }
    
    .title-input {
        font-weight: 600;
        color: #333;
        font-size: 14px;
        border: 2px solid #2196f3;
        border-radius: 4px;
        padding: 4px 8px;
        background: white;
        outline: none;
        font-family: inherit;
        min-width: 150px;
    }
    
    .owner-email {
        color: #2196f3;
        font-weight: 500;
        background: #e3f2fd;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
    }
    

    
    .header-center {
        display: flex;
        align-items: center;
        gap: 16px;
    }
    
    .month-navigation {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    
    .nav-button {
        background: #f5f5f5;
        border: 1px solid #ddd;
        border-radius: 6px;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 18px;
        color: #666;
        transition: all 0.2s;
    }
    
    .nav-button:hover {
        background: #e0e0e0;
        color: #333;
    }
    
    .month-year {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #333;
        min-width: 180px;
        text-align: center;
    }
    
    .today-button {
        background: #2196f3;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
    }
    
    .today-button:hover {
        background: #1976d2;
    }
    
    .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    
    .login-button, .cta-button {
        background: #2196f3;
        color: white;
        text-decoration: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 500;
        transition: background-color 0.2s;
    }
    
    .login-button:hover, .cta-button:hover {
        background: #1976d2;
    }
    
    .share-button {
        background: #ff9800;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        margin-right: 8px;
    }
    
    .share-button:hover:not(:disabled) {
        background: #f57c00;
    }
    
    .share-button:disabled {
        background: #ccc;
        cursor: not-allowed;
    }
    
    .icon-button {
        background: #f5f5f5;
        color: #666;
        border: none;
        padding: 8px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        margin-right: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
    }
    
    .todo-button {
        background: #9c27b0;
        color: white;
    }
    
    .todo-button:hover {
        background: #7b1fa2;
    }
    
    .external-cal-button {
        background: #4caf50;
        color: white;
    }
    
    .external-cal-button:hover {
        background: #45a049;
    }
    
    .icon-button:hover {
        background: #e5e5e5;
    }
    
    .todo-button:hover {
        background: #7b1fa2;
    }
    
    .external-cal-button:hover {
        background: #45a049;
    }
    
    .logout-button {
        background: #f5f5f5;
        color: #666;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .logout-button:hover {
        background: #e0e0e0;
        color: #333;
    }
    
    .loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 60px 20px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .loading-spinner {
        color: #666;
        font-size: 16px;
    }
    
    .calendar-main {
        flex: 1;
        padding: 24px;
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
    }
    
    .no-calendar {
        text-align: center;
        padding: 60px 20px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .no-calendar h2 {
        color: #333;
        margin-bottom: 16px;
    }
    
    .no-calendar p {
        color: #666;
        margin-bottom: 24px;
        font-size: 16px;
    }
    
    @media (max-width: 768px) {
        .calendar-header {
            flex-direction: column;
            align-items: stretch;
        }
        
        .header-center {
            justify-content: center;
        }
        
        .header-right {
            justify-content: center;
        }
        
        .calendar-main {
            padding: 16px;
        }
        
        .month-year {
            min-width: auto;
            font-size: 18px;
        }
    }
</style>
