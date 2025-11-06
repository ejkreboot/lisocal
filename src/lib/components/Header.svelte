<script lang="ts">
    import { user, session, loading, signOut } from '$lib/auth.js'
    import ShareDialog from '$lib/components/ShareDialog.svelte'
    import ExternalCalendarModal from '$lib/components/ExternalCalendarModal.svelte'
    import TodoModal from '$lib/components/TodoModal.svelte'

    let { data, calendarName, calendarId } = $props();

    let editingTitle = $state(false)
    let titleInput = $state('')
    let showTodoModal = $state(false)
    let showMobileMenu = $state(false)
    let showShareDialog = $state(false)
    let showExternalCalendarModal = $state(false)

    function startEditingTitle() {
        if (!$user || !calendarName) return
        editingTitle = true
        titleInput = calendarName
        setTimeout(() => {
            const input = document.querySelector('.title-input') as HTMLInputElement
            if (input) {
                input.focus()
                input.select()
            }
        }, 0)
    }
    
    async function saveTitle() {
        if (!$user || !calendarName || !titleInput.trim()) {
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
                    calendarId: calendarId,
                    name: titleInput.trim()
                })
            })
            
            if (response.ok) {
                calendarName = titleInput.trim()
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

    async function handleSignOut() {
        await signOut()
    }
    
    function toggleMobileMenu() {
        showMobileMenu = !showMobileMenu
    }
    
    function closeMobileMenu() {
        showMobileMenu = false
    }

    let canEdit = $derived( $user || (data.sharedCalendar && data.sharedCalendar.permissions === 'edit'))

</script>

    <header class="header">
        <div class="header-left">
            <a href="/" class="logo-link" aria-label="Home" style="text-decoration: none;">
                <div class="logo-title">
                    <img src="/logo_250.png" alt="lisocal logo" class="navbar-logo" />
                    <h1>lisocal</h1>
                </div>
            </a>
            <!-- Calendar name for mobile (next to icon) -->
            <div class="mobile-calendar-info">
                {#if data.sharedCalendar}
                    <span class="calendar-name">{data.sharedCalendar.name}</span>
                {:else if $user && calendarName}
                    {#if editingTitle}
                        <input 
                            class="title-input"
                            bind:value={titleInput}
                            onkeydown={handleTitleKeydown}
                            onblur={saveTitle}
                            placeholder="Calendar Name"
                        />
                    {:else}
                        <button class="calendar-name-button" onclick={startEditingTitle} title="Click to edit calendar name">
                            {calendarName}
                        </button>
                    {/if}
                {/if}
            </div>
        </div>
        
        <div class="header-center">
            {#if data.sharedCalendar}
                <div class="calendar-info-inline">
                    <span class="calendar-name">{data.sharedCalendar.name}</span>
                    {#if data.sharedCalendar.ownerEmail}
                        <span class="owner-email">{data.sharedCalendar.ownerEmail}</span>
                    {/if}
                </div>
            {:else if $user && calendarName}
                <div class="calendar-info-inline">
                    {#if editingTitle}
                        <input 
                            class="title-input"
                            bind:value={titleInput}
                            onkeydown={handleTitleKeydown}
                            onblur={saveTitle}
                            placeholder="Calendar Name"
                        />
                    {:else}
                        <button class="calendar-name-button" onclick={startEditingTitle} title="Click to edit calendar name">
                            {calendarName}
                        </button>
                    {/if}
                    {#if $user?.email}
                        <span class="owner-email">{$user.email}</span>
                    {/if}
                </div>
            {/if}
        </div>
        
        <div class="header-right">
            {#if $loading}
                <div class="loading-spinner">Loading...</div>
            {:else if !$user && !data.sharedCalendar}
                <a href="/auth" class="login-button">Sign In</a>
            {:else if $user || data.sharedCalendar}
                <!-- Desktop buttons -->
                <div class="desktop-menu">
                    {#if $user}
                        <button 
                            onclick={() => showTodoModal = true} 
                            class="todo-button icon-button"
                            title="To-Do List"
                        >
                            <span class="material-symbols-outlined" style="font-size: 16px;">task_alt</span>
                        </button>
                        <button 
                            onclick={() => showExternalCalendarModal = true} 
                            class="external-cal-button icon-button"
                            title="External Calendars"
                        >
                            <span class="material-symbols-outlined" style="font-size: 16px;">captive_portal</span>
                        </button>
                        <button 
                            onclick={() => showShareDialog = true} 
                            class="share-button icon-button" 
                            disabled={!calendarName}
                            title="Share Calendar"
                        >
                            <span class="material-symbols-outlined" style="font-size: 16px;">share</span>
                        </button>
                        <button 
                            onclick={handleSignOut} 
                            class="logout-button icon-button"
                            title="Sign Out"
                        >
                            <span class="material-symbols-outlined" style="font-size: 16px;">logout</span>
                        </button>
                    {/if}
                </div>
                
                <!-- Mobile hamburger menu -->
                <div class="mobile-menu">
                    <button 
                        onclick={toggleMobileMenu} 
                        class="hamburger-button icon-button"
                        title="Menu"
                    >
                        <span class="material-symbols-outlined" style="font-size: 20px;">
                            {showMobileMenu ? 'close' : 'menu'}
                        </span>
                    </button>
                    
                    {#if showMobileMenu}
                        <div 
                            class="mobile-dropdown" 
                            onclick={closeMobileMenu}
                            onkeydown={(e) => e.key === 'Escape' && closeMobileMenu()}
                            role="menu"
                            tabindex="-1"
                        >
                            <button 
                                onclick={() => { showTodoModal = true; closeMobileMenu(); }} 
                                class="mobile-menu-item"
                            >
                                <span class="material-symbols-outlined">task_alt</span>
                                To-Do List
                            </button>
                            {#if $user}
                                <button 
                                    onclick={() => { showExternalCalendarModal = true; closeMobileMenu(); }} 
                                    class="mobile-menu-item"
                                >
                                    <span class="material-symbols-outlined">captive_portal</span>
                                    External Calendars
                                </button>
                                <button 
                                    onclick={() => { showShareDialog = true; closeMobileMenu(); }} 
                                    class="mobile-menu-item"
                                    disabled={!calendarName}
                                >
                                    <span class="material-symbols-outlined">share</span>
                                    Share Calendar
                                </button>
                                <button 
                                    onclick={() => { handleSignOut(); closeMobileMenu(); }} 
                                    class="mobile-menu-item"
                                >
                                    <span class="material-symbols-outlined">logout</span>
                                    Sign Out
                                </button>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </header>

<ShareDialog 
    bind:isOpen={showShareDialog}
    calendarId={calendarId}
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
            /* Typography overrides */
    .header,
    .header h1,
    .calendar-name,
    .calendar-name-button {
        font-family: var(--font-primary);
    }
    
    .header-left h1 {
        margin: 0;
        color: #868686;
        font-size: 24px;
        font-weight: 300;
    }
    
    .logo-title {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
    }
    
    .mobile-calendar-info {
        display: none;
    }
    
    .navbar-logo {
        width: 30px;
        height: 30px;
        object-fit: contain;
    }
        
    .calendar-info-inline {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
    }
    
    .calendar-name {
        font-weight: 600;
        color: var(--accent-color);
    }
    
    .calendar-name-button {
        background: none;
        border: none;
        font-weight: 600;
        color: var(--accent-color);
        font-size: 14px;
        cursor: pointer;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-sm);
        transition: all var(--transition-normal);
        font-family: inherit;
    }
    
    .calendar-name-button:hover {
        background: var(--gray-100);
        color: var(--accent-hover);
    }
    
    .title-input {
        font-weight: 600;
        color: var(--gray-700);
        font-size: 14px;
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-sm);
        padding: var(--space-1) var(--space-2);
        background: var(--white);
        outline: none;
        font-family: inherit;
        min-width: 150px;
    }
    
    .owner-email {
        color: var(--primary-color);
        font-weight: 500;
        background: var(--primary-light);
        padding: 2px var(--space-2);
        border-radius: 12px;
        font-size: 12px;
    }

        .header-right {
        display: flex;
        align-items: center;
        gap: var(--space-1);
    }
    
    .login-button {
        background: var(--primary-color);
        color: var(--white);
        text-decoration: none;
        padding: var(--space-1) var(--space-4);
        font-weight: 500;
        transition: background-color var(--transition-normal);
    }
    
    .login-button:hover {
        background: var(--primary-hover);
    }
    
    .icon-button {
        background: var(--gray-50);
        color: var(--gray-600);
        border: 1px solid transparent;
        padding: 10px;
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all var(--transition-normal);
        margin-right: var(--space-2);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        box-sizing: border-box;
    }
    
    .icon-button:hover {
        background: #e9ecef;
        border-color: #dee2e6;
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
    }
    
    .icon-button:disabled {
        background: var(--gray-50);
        color: #adb5bd;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }
    
    .icon-button:disabled:hover {
        background: var(--gray-50);
        border-color: transparent;
    }
    
    .todo-button {
        background: #f8f5ff;
        color: #7c3aed;
    }
    
    .todo-button:hover {
        background: #f3f0ff;
        color: #6d28d9;
    }
    
    .external-cal-button {
        background: #f0fdf4;
        color: #16a34a;
    }
    
    .external-cal-button:hover {
        background: #dcfce7;
        color: #15803d;
    }
    
    .share-button {
        background: #fff7ed;
        color: #ea580c;
    }
    
    .share-button:hover:not(:disabled) {
        background: #fed7aa;
        color: #c2410c;
    }
    
    .logout-button {
        background: #fef2f2;
        color: #dc2626;
    }
    
    .logout-button:hover {
        background: #fecaca;
        color: #b91c1c;
    }
    
    /* Mobile menu styles */
    .desktop-menu {
        display: flex;
        gap: var(--space-1);
    }
    
    .mobile-menu {
        display: none;
        position: relative;
    }
    
    .hamburger-button {
        background: var(--gray-50);
        color: var(--gray-600);
    }
    
    .hamburger-button:hover {
        background: var(--gray-100);
        color: var(--gray-700);
    }
    
    .mobile-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        background: var(--white);
        border: 1px solid var(--gray-200);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-md);
        min-width: 200px;
        z-index: 1000;
        margin-top: var(--space-2);
    }
    
    .mobile-menu-item {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        width: 100%;
        padding: var(--space-3) var(--space-4);
        border: none;
        background: none;
        color: var(--gray-700);
        font-size: 14px;
        font-weight: 500;
        text-align: left;
        cursor: pointer;
        transition: background-color var(--transition-normal);
        border-radius: 0;
    }
    
    .mobile-menu-item:first-child {
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
    
    .mobile-menu-item:last-child {
        border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    }
    
    .mobile-menu-item:hover:not(:disabled) {
        background: var(--gray-50);
    }
    
    .mobile-menu-item:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .mobile-menu-item .material-symbols-outlined {
        font-size: 18px;
    }

    @media (max-width: 768px) {
        .header {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-3) var(--space-4);
            gap: var(--space-2);
        }
        
        .header-left {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: var(--space-3);
        }
        
        .header-left h1,
        .owner-email {
            display: none;
        }
        
        .mobile-calendar-info {
            display: block;
        }
        
        .header-center {
            display: none;
        }
        
        .header-right {
            justify-content: flex-end;
        }
        
        .desktop-menu {
            display: none;
        }
        
        .mobile-menu {
            display: block;
        }
    }

</style>