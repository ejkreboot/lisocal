<script lang="ts">
    import { getMonthName } from '$lib/calendar-utils.js'
    import CalendarMonth from '$lib/components/CalendarMonth.svelte'
    import TodoSidebar from '$lib/components/TodoSidebar.svelte'
    import { user, session, loading, signOut } from '$lib/auth.js'
    import Header from '$lib/components/Header.svelte'

    export let data: any
    
    let userCalendar: any = null
    
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
    <title>lisocal - {monthName} {currentYear}</title>
    <meta name="description" content="A personal calendar that shreds the gnar" />
</svelte:head>

<Header data={data} calendarName={userCalendar?.name} calendarId={userCalendar?.id} />

<div class="page-wrapper">
    {#if calendarId}
        <div class="sidebar-container">
            <TodoSidebar 
                {canEdit}
                {calendarId}
                shareToken={data.sharedCalendar?.shareToken || null}
            />
        </div>
    {/if}
    
    <div class="calendar-container">
        <main class="calendar-main">
            {#if $loading}
                <div class="loading-container">
                    <div class="loading-spinner">Loading your calendar...</div>
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
            {:else}
                {#if $user}
                    <div class="no-calendar">
                        <h2>Loading your calendar...</h2>
                    </div>
                {:else}
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
        background: var(--gray-50);
    }
    
    .sidebar-container {
        display: none;
        flex-shrink: 0;
        width: 25%;
        min-width: 240px;
        max-width: 400px;
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
    }
    
    .month-navigation {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }
    
    .nav-button {
        background: var(--gray-50);
        border: 1px solid transparent;
        border-radius: var(--radius-lg);
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
        color: var(--gray-700);
        min-width: 180px;
        text-align: center;
    }
    
    .today-button {
        background: #eff6ff;
        color: #2563eb;
        border: 1px solid transparent;
        border-radius: var(--radius-lg);
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
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-sm);
    }
    
    .loading-spinner {
        color: var(--gray-600);
        font-size: 16px;
    }
    
    .calendar-main {
        flex: 1;
        padding: var(--space-6);
        padding-top: 40px;
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
    }
    
    .no-calendar {
        text-align: center;
        padding: 60px var(--space-5);
        background: var(--white);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-sm);
    }
    
    .no-calendar h2 {
        color: var(--gray-700);
        margin-bottom: var(--space-4);
    }

    :global(.no-calendar p) { 
        color: var(--gray-600);
        margin-bottom: var(--space-6);
        font-size: 16px;
    }
    
    /* Landing page styles */
    .landing-page {
        background: var(--white);
        border-radius: var(--radius-xl);
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
        color: var(--gray-700);
        margin: 0 0 var(--space-4) 0;
        font-family: var(--font-primary);
        letter-spacing: -0.02em;
    }
        
    .hero-description {
        font-size: 18px;
        color: var(--gray-600);
        line-height: 1.6;
        margin: 0 0 var(--space-8) 0;
        max-width: 500px;
        margin-left: auto;
        margin-right: auto;
    }
    
    .cta-button {
        display: inline-block;
        background: var(--primary-color);
        color: var(--white);
        padding: var(--space-3) var(--space-6);
        border-radius: var(--radius-lg);
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
        color: var(--gray-700);
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
    @media (min-width: 1000px) {
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
            margin-bottom: var(--space-6);
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
