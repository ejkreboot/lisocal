<script lang="ts">
    import { onMount } from 'svelte'
    import { getMonthName } from '$lib/calendar-utils.js'
    import CalendarMonth from '$lib/components/CalendarMonth.svelte'
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

<div class="calendar-container">
    <header class="calendar-header">
        <div class="header-left">
            <div class="logo-title">
                <img src="/logo-navbar.png" alt="lisocal logo" class="navbar-logo" />
                <h1>lisocal</h1>
            </div>
            <div class="shared-calendar-info">
                <div class="calendar-title-row">
                    <span class="calendar-name">{data.sharedCalendar?.name || 'Shared Calendar'}</span>
                    {#if data.sharedCalendar?.ownerEmail}
                        <span class="owner-email">{data.sharedCalendar.ownerEmail}</span>
                    {/if}
                </div>
            </div>
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
            <a href="/auth" class="login-button">Sign In</a>
        </div>
    </header>
    
    <main class="calendar-main">
        {#if calendarId}
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
        font-family: "DM Sans";
        color: #868686;
        font-size: 24px;
        font-weight: 300;
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