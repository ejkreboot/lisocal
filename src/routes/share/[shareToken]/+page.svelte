<script lang="ts">
    import Header from '$lib/components/Header.svelte'
    import { getMonthName } from '$lib/calendar-utils.js'
    import CalendarMonth from '$lib/components/CalendarMonth.svelte'
    import TodoSidebar from '$lib/components/TodoSidebar.svelte'
    export let data: any

    
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
    $: canEdit = data.sharedCalendar && data.sharedCalendar.permissions === 'edit'
    $: calendarId = data.sharedCalendar?.id
</script>

<svelte:head>
    <title>lisocal - {data.sharedCalendar?.name || 'Shared Calendar'} - {monthName} {currentYear}</title>
    <meta name="description" content="Shared calendar on lisocal" />
</svelte:head>

<Header data={data} calendarId={data.sharedCalendar?.id} calendarName={data.sharedCalendar?.name} />

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
            {#if calendarId}
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
                <div class="no-calendar">
                    <h2>Calendar Not Available</h2>
                    <p>This shared calendar link may have expired or been removed.</p>
                    <a href="/" class="cta-button">Go to lisocal</a>
                </div>
            {/if}
        </main>
    </div>
</div>

<style>
    :global(body) {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f8f9fa;
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
    }
    
    .nav-button:hover {
        background: var(--gray-100);
        border-color: var(--gray-200);
    }
    
    .month-year {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--gray-800);
        min-width: 180px;
        text-align: center;
    }
    
    .today-button {
        background: var(--primary-color);
        color: var(--white);
        border: none;
        border-radius: var(--radius-lg);
        padding: var(--space-2) var(--space-4);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background var(--transition-normal);
    }
    
    .today-button:hover {
        background: var(--primary-hover);
    }
    
    .calendar-main {
        flex: 1;
        padding: 0;
    }
    
    .no-calendar {
        text-align: center;
        padding: 60px 20px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        margin: var(--space-6);
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
            font-size: 16px;
            min-width: auto;
        }
        
        .nav-button {
            width: 32px;
            height: 32px;
            font-size: 14px;
        }
        
        .today-button {
            padding: var(--space-1) var(--space-3);
            font-size: 13px;
        }
        
        .no-calendar {
            margin: var(--space-4);
            padding: 40px 16px;
        }
    }
</style>