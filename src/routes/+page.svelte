<script lang="ts">
    import { getMonthName } from '$lib/calendar-utils.js'
    import CalendarMonth from '$lib/components/CalendarMonth.svelte'
    import TodoSidebar from '$lib/components/TodoSidebar.svelte'
    import ScratchpadSidebar from '$lib/components/ScratchpadSidebar.svelte'
    import { user, session, loading, signOut } from '$lib/auth.js'
    import Header from '$lib/components/Header.svelte'
    import { onMount } from 'svelte'

    export let data: any
    
    // Initialize auth state immediately from server data to prevent flash
    if (data.hasServerAuth) {
        // We have definitive auth state from server, set it immediately
        if (data.user) {
            user.set(data.user)
        }
        loading.set(false)
    }
    // If no server auth, keep loading true until client-side auth completes
    
    let userCalendar: any = null
    
    // Initialize user calendar from server data if available
    if (data.user?.calendar) {
        userCalendar = data.user.calendar
    }
    
    // Load user's calendar when they sign in (for client-side auth changes)
    $: if ($user && $session && !userCalendar) {
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
    
    let currentDate = new Date()
    let currentYear = currentDate.getFullYear()
    let currentMonth = currentDate.getMonth()
    
    // Sidebar resizing state
    let todoHeight = 50 // Default to 50% for todo section
    let scratchpadHeight = 50 // Default to 50% for scratchpad section
    let sidebarContent: HTMLElement
    let isResizing = false
    let resizeHandle: HTMLElement
    
    // Load saved sidebar split ratio from localStorage on mount
    onMount(() => {
        const savedSplit = localStorage.getItem('lisocal-sidebar-split')
        if (savedSplit) {
            const split = parseFloat(savedSplit)
            if (split >= 20 && split <= 80) {
                todoHeight = split
                scratchpadHeight = 100 - split
            }
        }
    })
    
    function startResize(e: MouseEvent) {
        isResizing = true
        document.addEventListener('mousemove', handleResize)
        document.addEventListener('mouseup', stopResize)
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
        
        // Store reference to the handle for adding resizing class
        resizeHandle = e.currentTarget as HTMLElement
        
        e.preventDefault()
    }
    
    function handleResize(e: MouseEvent) {
        if (!isResizing || !sidebarContent) return
        
        const rect = sidebarContent.getBoundingClientRect()
        const containerHeight = rect.height
        const mouseY = e.clientY - rect.top
        
        // Calculate percentage based on mouse position
        const newTodoHeight = Math.max(20, Math.min(80, (mouseY / containerHeight) * 100))
        const newScratchpadHeight = 100 - newTodoHeight
        
        todoHeight = newTodoHeight
        scratchpadHeight = newScratchpadHeight
        
        // Save to localStorage
        localStorage.setItem('lisocal-sidebar-split', newTodoHeight.toString())
    }
    
    function stopResize() {
        isResizing = false
        resizeHandle = null
        document.removeEventListener('mousemove', handleResize)
        document.removeEventListener('mouseup', stopResize)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }
    
    function handleResizeKeydown(e: KeyboardEvent) {
        let adjustment = 0
        
        switch (e.key) {
            case 'ArrowUp':
                adjustment = -5 // Make todo section smaller
                break
            case 'ArrowDown':
                adjustment = 5 // Make todo section larger
                break
            case 'Home':
                todoHeight = 20
                scratchpadHeight = 80
                localStorage.setItem('lisocal-sidebar-split', todoHeight.toString())
                e.preventDefault()
                return
            case 'End':
                todoHeight = 80
                scratchpadHeight = 20
                localStorage.setItem('lisocal-sidebar-split', todoHeight.toString())
                e.preventDefault()
                return
            case ' ':
            case 'Enter':
                // Reset to 50/50 split
                todoHeight = 50
                scratchpadHeight = 50
                localStorage.setItem('lisocal-sidebar-split', todoHeight.toString())
                e.preventDefault()
                return
            default:
                return
        }
        
        if (adjustment !== 0) {
            const newTodoHeight = Math.max(20, Math.min(80, todoHeight + adjustment))
            todoHeight = newTodoHeight
            scratchpadHeight = 100 - newTodoHeight
            localStorage.setItem('lisocal-sidebar-split', todoHeight.toString())
            e.preventDefault()
        }
    }
    
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
    // Share link permissions take precedence to allow testing of view-only links
    $: canEdit = data.sharedCalendar 
        ? data.sharedCalendar.permissions === 'edit'
        : !!$user
    $: calendarId = userCalendar?.id || data.sharedCalendar?.id

</script>

<svelte:head>
    <title>lisocal - {monthName} {currentYear}</title>
    <meta name="description" content="The zero friction personal planner" />
</svelte:head>

<Header data={data} calendarName={userCalendar?.name} calendarId={userCalendar?.id} />

<div class="page-wrapper">
    {#if calendarId}
        <div class="sidebar-container">
            <div class="sidebar-content" bind:this={sidebarContent}>
                <div class="todo-container" style="height: {todoHeight}%;">
                    <TodoSidebar 
                        {canEdit}
                        {calendarId}
                        shareToken={data.sharedCalendar?.shareToken || null}
                    />
                </div>
                <button class="resize-handle" 
                        class:resizing={isResizing}
                        bind:this={resizeHandle}
                        on:mousedown={startResize} 
                        on:keydown={handleResizeKeydown}
                        aria-label="Resize sidebar sections"
                        title="Drag to resize To-Do and Scratchpad sections, or use arrow keys">
                    <div class="resize-handle-line"></div>
                </button>
                <div class="scratchpad-container" style="height: {scratchpadHeight}%;">
                    <ScratchpadSidebar 
                        {canEdit}
                        {calendarId}
                        shareToken={data.sharedCalendar?.shareToken || null}
                    />
                </div>
            </div>
        </div>
    {/if}
    
    <div class="calendar-container">
        <main class="calendar-main">
            {#if $loading}
                <div class="loading-container">
                    <div class="loading-spinner">Loading...</div>
                </div>
            {:else if calendarId}
                <div class="calendar-navigation">
                    <div class="month-navigation">
                        <button class="nav-button" on:click={previousMonth}>‹</button>
                        <h2 class="month-year">{monthName} {currentYear}</h2>
                        <button class="nav-button" on:click={nextMonth}>›</button>
                    </div>
                    <button class="today-button" on:click={goToToday}>Today</button>
                </div>
                <CalendarMonth 
                    year={currentYear} 
                    month={currentMonth} 
                    {calendarId}
                    {canEdit}
                    shareToken={data.sharedCalendar?.shareToken || null}
                />
            {:else if !$user}
                <!-- Landing page for non-authenticated users -->
                    <div class="landing-page">
                        <div class="hero-section">
                            <div class="hero-content">
                                <h1 class="hero-title">lisocal</h1>
                                <p class="hero-description">
                                    Effortless calendar management. Just click and type. 
                                    Password free, no registration needed. Enter your email,
                                    get a code, and start scheduling in seconds. 
                                </p>
                                <blockquote class="hero-quote">
                                    "Simplicity is the ultimate sophistication"
                                    <cite>— Leonardo da Vinci</cite>
                                </blockquote>
                                <a href="/auth" class="cta-button">Get Started</a>
                            </div>
                        </div>
                        
                        <div class="features-section">
                            <div class="features-grid">
                                <div class="feature-card">
                                    <div class="feature-icon">
                                        <span class="material-symbols-outlined">bolt</span>
                                    </div>
                                    <h3>Simple. Efficient.</h3>
                                    <p>Click and type. No forms, no dialogs, no hassle.</p>
                                </div>
                                <div class="feature-card">
                                    <div class="feature-icon">
                                        <span class="material-symbols-outlined">check_box</span>
                                    </div>
                                    <h3>To Do and Schedule Side By Side</h3>
                                    <p>Manage your tasks and events in one place.</p>
                                </div>                                
                                <div class="feature-card">
                                    <div class="feature-icon">
                                        <span class="material-symbols-outlined">hub</span>
                                    </div>
                                    <h3>Everything in one place.</h3>
                                    <p>Import external calendars with two clicks.</p>
                                </div>                                
                                <div class="feature-card">
                                    <div class="feature-icon">
                                        <span class="material-symbols-outlined">share</span>
                                    </div>
                                    <h3>Easy Sharing</h3>
                                    <p>Share your calendar with a simple link.</p>
                                </div>
                            </div>
                        </div>
                    </div>
            {/if}
        </main>
    </div>
</div>

<style>
    /* Main page styles - uses global styles from global.css */
    
    /* Typography overrides */
    .month-year,
    .today-button,
    .nav-button {
        font-family: var(--font-primary);
    }
    
    .page-wrapper {
        display: flex;
        min-height: calc(100vh - 60px);
        background: transparent;
    }
    
    .sidebar-container {
        display: none;
        flex-shrink: 0;
        width: 25%;
        min-width: 330px;
        max-width: 400px;
        height: calc(100vh - 60px);
        overflow: hidden;
    }
    
    .sidebar-content {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
    }
    
    .todo-container {
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    
    .scratchpad-container {
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    
    .resize-handle {
        height: 8px;
        width: 100%;
        background: var(--gray-100);
        border: none;
        border-top: 1px solid var(--gray-200);
        border-bottom: 1px solid var(--gray-200);
        cursor: row-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color var(--transition-normal);
        flex-shrink: 0;
        position: relative;
        z-index: 10;
        padding: 0;
    }
    
    .resize-handle:hover {
        background: var(--gray-200);
    }
    
    .resize-handle:active,
    .resize-handle.resizing {
        background: var(--primary-light);
    }
    
    .resize-handle-line {
        width: 40px;
        height: 2px;
        background: var(--gray-400);
        border-radius: 1px;
        transition: all var(--transition-normal);
    }
    
    .resize-handle:hover .resize-handle-line {
        background: var(--gray-600);
        width: 60px;
    }
    
    .resize-handle:active .resize-handle-line,
    .resize-handle.resizing .resize-handle-line {
        background: var(--primary-color);
        width: 60px;
    }
    
    .resize-handle:focus {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
    }
    
    .resize-handle:focus .resize-handle-line {
        background: var(--primary-color);
        width: 50px;
    }
    
    .calendar-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    
    .calendar-navigation {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-4);
        padding: var(--space-4) 0;
        border-bottom: 1px solid var(--gray-200);
        background: var(--white);
        min-height: 70px;
        max-height: 70px;
        height: 70px;
    }
    
    .month-navigation {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }
    
    .nav-button {
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-small-default);
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        color: var(--gray-600);
        transition: all var(--transition-normal);
        box-sizing: border-box;
    }
    
    .nav-button:hover {
        background: #e9ecef;
        border-color: #dee2e6;
        color: #495057;
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
    }
    
    .month-year {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: var(--dark-text);
        min-width: 180px;
        text-align: center;
    }
    
    .today-button {
        background: transparent;
        color: #2563eb;
        border: 1px solid transparent;
        border-radius: var(--radius-small-default);
        padding: var(--space-2) var(--space-4);
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all var(--transition-normal);
        box-sizing: border-box;
    }
    
    .today-button:hover {
        background: #dbeafe;
        border-color: #bfdbfe;
        color: #1d4ed8;
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
    }
    
    .loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 60px var(--space-5);
        background: var(--white);
        border-radius: var(--radius-small-default);
        box-shadow: var(--shadow-sm);
    }
    
    .loading-spinner {
        color: var(--gray-600);
        font-size: 16px;
    }
    
    .calendar-main {
        flex: 1;
        padding: 20px;
        background: var(--white);
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
    }
    

    
    /* Landing page styles */
    .landing-page {
        background: var(--white);
        border-radius: var(--radius-small-default);
        box-shadow: var(--shadow-sm);
        overflow: hidden;
    }
    
    .hero-section {
        text-align: center;
        padding: 80px var(--space-6) 60px;
        background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        border-bottom: 1px solid var(--gray-200);
    }
    
    .hero-content {
        max-width: 600px;
        margin: 0 auto;
    }
    
    .hero-title {
        font-size: 48px;
        font-weight: 300;
        color: var(--dark-text);
        margin: 0 0 var(--space-4) 0;
        font-family: var(--font-primary);
        letter-spacing: -0.02em;
    }
        
    .hero-description {
        font-size: 18px;
        color: var(--gray-600);
        line-height: 1.6;
        margin: 0 0 var(--space-6) 0;
        max-width: 500px;
        margin-left: auto;
        margin-right: auto;
    }
    
    .hero-quote {
        font-style: italic;
        font-size: 16px;
        color: var(--gray-500);
        margin: 0 0 var(--space-8) 0;
        padding: 0;
        border: none;
        text-align: center;
    }
    
    .hero-quote cite {
        display: block;
        font-size: 14px;
        margin-top: var(--space-2);
        font-style: normal;
        color: var(--gray-400);
    }
    
    .cta-button {
        display: inline-block;
        background: var(--primary-color);
        color: var(--white);
        padding: var(--space-3) var(--space-6);
        border-radius: var(--radius-small-default);
        text-decoration: none;
        font-weight: 600;
        font-size: 16px;
        transition: all var(--transition-normal);
        box-shadow: var(--shadow-sm);
    }
    
    .cta-button:hover {
        background: var(--primary-hover);
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
    }
    
    .features-section {
        padding: 60px var(--space-6);
    }
    
    .features-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: var(--space-8);
        max-width: 800px;
        margin: 0 auto;
    }
    
    .feature-card {
        text-align: center;
        padding: var(--space-4);
    }
    
    .feature-icon {
        margin-bottom: var(--space-4);
        display: block;
    }
    
    .feature-icon .material-symbols-outlined {
        font-size: 32px;
        color: var(--gray-600);
    }
    
    .feature-card h3 {
        font-size: 18px;
        font-weight: 600;
        color: var(--dark-text);
        margin: 0 0 var(--space-3) 0;
        font-family: var(--font-primary);
    }
    
    .feature-card p {
        font-size: 14px;
        color: var(--gray-600);
        line-height: 1.5;
        margin: 0;
    }
    
    /* Show sidebar for larger screens */
    @media (min-width: 1200px) {
        .sidebar-container {
            display: block;
        }
    }
    
    @media (max-width: 768px) {
        .calendar-navigation {
            flex-direction: row;
            gap: var(--space-3);
            padding: var(--space-3) var(--space-2);
        }
        
        .month-navigation {
            gap: var(--space-2);
        }
        
        .month-year {
            font-size: 18px;
            min-width: 140px;
        }
        
        .calendar-main {
            padding: var(--space-4);
        }
        
        .month-year {
            min-width: auto;
            font-size: 18px;
        }
        
        /* Landing page mobile styles */
        .hero-section {
            padding: 60px var(--space-4) 40px;
        }
        
        .hero-title {
            font-size: 36px;
        }
                
        .hero-description {
            font-size: 16px;
            margin-bottom: var(--space-4);
        }
        
        .hero-quote {
            font-size: 14px;
            margin-bottom: var(--space-6);
        }
        
        .hero-quote cite {
            font-size: 12px;
        }
        
        .features-section {
            padding: 40px var(--space-4);
        }
        
        .features-grid {
            grid-template-columns: 1fr;
            gap: var(--space-6);
        }
    }
</style>
