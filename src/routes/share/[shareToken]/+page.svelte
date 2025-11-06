<script lang="ts">
    import Header from '$lib/components/Header.svelte'
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

<Header data={data} calendarId={data.sharedCalendar?.id} calendarName={data.sharedCalendar?.name} />
<div class="calendar-container">

    <main class="calendar-main">
        {#if calendarId}
        <br>
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
    
    .calendar-main {
        padding-top: 40px;
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

        .calendar-main {
            padding: 16px;
        } 

    }
</style>