<script lang="ts">
    import { getCalendarGrid, formatTimeForDisplay, parseEventInput, formatDateForDb, type CalendarEvent, type CalendarDay } from '$lib/calendar-utils.js'
    import { supabase } from '$lib/supabase.js'
    import { onMount, createEventDispatcher } from 'svelte'
    import { browser } from '$app/environment'
    import { getExternalCalendarColor } from '$lib/external-calendar-colors.js'
    import { autoSync, type SyncResult } from '$lib/external-calendar-auto-sync.js'
    
    export let year: number
    export let month: number
    export let calendarId: string
    export let canEdit: boolean = true
    export let shareToken: string | null = null
    
    const dispatch = createEventDispatcher()
    
    let calendarGrid: CalendarDay[] = []
    let events: CalendarEvent[] = []
    let editingCell: { row: number, col: number } | null = null
    let editText = ''
    let isSaving = false
    let editingEventId: string | null = null
    
    // Tooltip functionality
    let tooltip = {
        visible: false,
        text: '',
        x: 0,
        y: 0,
        style: ''
    }
    
    // Reactive statement to update grid when year/month changes
    $: {
        calendarGrid = getCalendarGrid(year, month)
        // Only load events on client side
        if (browser) {
            loadEvents()
        }
    }
    
    onMount(() => {
        loadEvents()
    })
    
    async function loadEvents() {
        if (!calendarId) return
        
        // Auto-sync external calendars if user is authenticated (not via share link)
        if (!shareToken && canEdit) {
            try {
                const syncResults = await autoSync.checkAndSyncExternalCalendars(calendarId)
                if (syncResults.some(r => r.hasChanges)) {
                    console.log('External calendars updated:', syncResults.filter(r => r.hasChanges))
                    // Could show a subtle notification here if desired
                }
            } catch (error) {
                console.warn('Auto-sync failed:', error)
                // Don't block calendar loading if sync fails
            }
        }
        
        const startDate = formatDateForDb(new Date(year, month, 1))
        const endDate = formatDateForDb(new Date(year, month + 1, 0))
        
        let data, error
        
        if (shareToken) {
            // Use shared calendar API
            try {
                const response = await fetch(`/api/shared/events?shareToken=${shareToken}&startDate=${startDate}&endDate=${endDate}`)
                if (!response.ok) {
                    throw new Error('Failed to load shared events')
                }
                const result = await response.json()
                data = result.events
                error = null
            } catch (err) {
                console.error('Error loading shared events:', err)
                error = err
                data = null
            }
        } else {
            // Use regular Supabase client for authenticated users
            const result = await supabase
                .from('events')
                .select('*')
                .eq('calendar_id', calendarId)
                .gte('start_date', startDate)
                .lte('start_date', endDate)
                .order('start_date')
                .order('start_time')
            
            data = result.data
            error = result.error
        }
        
        if (error) {
            console.error('Error loading events:', error)
            return
        }
        
        events = (data || []).map((event: any) => ({
            id: event.id,
            title: event.title,
            description: event.description,
            startDate: event.start_date,
            endDate: event.end_date,
            startTime: event.start_time,
            endTime: event.end_time,
            isAllDay: event.is_all_day,
            externalId: event.external_id,
            externalCalendarUrl: event.external_calendar_url,
            isExternal: !!event.external_id
        }))
        
        // Distribute events to calendar days
        calendarGrid = calendarGrid.map(day => ({
            ...day,
            events: events.filter(event => event.startDate === formatDateForDb(day.date))
        }))
    }
    
    async function startEditing(row: number, col: number) {
        if (!canEdit) return
        
        // If we're already editing a different cell, save the current edit first
        if (editingCell && (editingCell.row !== row || editingCell.col !== col)) {
            await saveEvent()
        }
        
        editingCell = { row, col }
        editText = ''
        editingEventId = null
        
        // Focus the input after it's rendered
        setTimeout(() => {
            const input = document.querySelector('.event-input, .agenda-event-input') as HTMLInputElement
            if (input) {
                input.focus()
            }
        }, 0)
    }
    
    async function startEditingEvent(event: CalendarEvent, row: number, col: number) {
        if (!canEdit) return
        if (event.isExternal) return // External events cannot be edited
        
        // If we're already editing a different cell, save the current edit first
        if (editingCell && (editingCell.row !== row || editingCell.col !== col)) {
            await saveEvent()
        }
        
        editingCell = { row, col }
        editingEventId = event.id
        
        // Convert event back to input format
        let eventText = event.title
        if (!event.isAllDay && event.startTime) {
            const startTime = formatTimeForDisplay(event.startTime)
            const endTime = event.endTime ? formatTimeForDisplay(event.endTime) : ''
            eventText = endTime ? `${startTime}-${endTime} ${event.title}` : `${startTime} ${event.title}`
        }
        
        editText = eventText
        
        // Focus the input after it's rendered
        setTimeout(() => {
            const input = document.querySelector('.event-input, .agenda-event-input') as HTMLInputElement
            if (input) {
                input.focus()
                // Select all text for easy editing
                input.select()
            }
        }, 0)
    }
    
    async function saveEvent() {
        if (!editingCell || !editText.trim() || !calendarId || isSaving) return
        
        isSaving = true
        
        const dayIndex = editingCell.row * 7 + editingCell.col
        const selectedDay = calendarGrid[dayIndex]
        
        const parsed = parseEventInput(editText)
        
        let error
        
        if (shareToken) {
            // Use shared calendar API
            try {
                if (editingEventId) {
                    // Update existing event
                    const response = await fetch(`/api/shared/events?shareToken=${shareToken}&eventId=${editingEventId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            title: parsed.title,
                            start_date: formatDateForDb(selectedDay.date),
                            start_time: parsed.startTime,
                            end_time: parsed.endTime,
                            is_all_day: parsed.isAllDay
                        })
                    })
                    
                    if (!response.ok) {
                        throw new Error('Failed to update event')
                    }
                } else {
                    // Create new event
                    const response = await fetch(`/api/shared/events?shareToken=${shareToken}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            title: parsed.title,
                            start_date: formatDateForDb(selectedDay.date),
                            start_time: parsed.startTime,
                            end_time: parsed.endTime,
                            is_all_day: parsed.isAllDay
                        })
                    })
                    
                    if (!response.ok) {
                        throw new Error('Failed to create event')
                    }
                }
                error = null
            } catch (err) {
                error = err
            }
        } else {
            // Use regular Supabase client for authenticated users
            if (editingEventId) {
                // Update existing event
                const { error: updateError } = await supabase
                    .from('events')
                    .update({
                        title: parsed.title,
                        start_date: formatDateForDb(selectedDay.date),
                        start_time: parsed.startTime,
                        end_time: parsed.endTime,
                        is_all_day: parsed.isAllDay
                    })
                    .eq('id', editingEventId)
                
                error = updateError
            } else {
                // Create new event
                const { error: insertError } = await supabase
                    .from('events')
                    .insert({
                        calendar_id: calendarId,
                        title: parsed.title,
                        start_date: formatDateForDb(selectedDay.date),
                        start_time: parsed.startTime,
                        end_time: parsed.endTime,
                        is_all_day: parsed.isAllDay
                    })
                
                error = insertError
            }
        }
        
        if (error) {
            console.error('Error saving event:', error)
            isSaving = false
            return
        }
        
        editingCell = null
        editText = ''
        editingEventId = null
        isSaving = false
        await loadEvents()
        dispatch(editingEventId ? 'eventUpdated' : 'eventCreated')
    }
    
    function cancelEdit() {
        editingCell = null
        editText = ''
        editingEventId = null
        isSaving = false
    }
    
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            saveEvent()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelEdit()
        }
    }
    
    function handleDayKeydown(event: KeyboardEvent, row: number, col: number) {
        // If user starts typing a letter/number, start editing and capture the input
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault()
            startEditing(row, col)
            // Set the initial text to the typed character
            editText = event.key
            
            // Focus the input after it's rendered and set cursor to end
            setTimeout(() => {
                const input = document.querySelector('.event-input, .agenda-event-input') as HTMLInputElement
                if (input) {
                    input.focus()
                    input.setSelectionRange(editText.length, editText.length)
                }
            }, 0)
        }
    }
    
    async function deleteEvent(eventId: string) {
        if (!canEdit) return
        
        let error
        
        if (shareToken) {
            // Use shared calendar API
            try {
                const response = await fetch(`/api/shared/events?shareToken=${shareToken}&eventId=${eventId}`, {
                    method: 'DELETE'
                })
                
                if (!response.ok) {
                    throw new Error('Failed to delete event')
                }
                error = null
            } catch (err) {
                error = err
            }
        } else {
            // Use regular Supabase client for authenticated users
            const result = await supabase
                .from('events')
                .delete()
                .eq('id', eventId)
            
            error = result.error
        }
        
        if (error) {
            console.error('Error deleting event:', error)
            return
        }
        
        await loadEvents()
        dispatch('eventDeleted')
    }
    
    function formatEventTime(event: CalendarEvent): string {
        if (event.isAllDay) return ''
        
        let timeStr = ''
        if (event.startTime) {
            timeStr = formatTimeForDisplay(event.startTime)
        }
        if (event.endTime) {
            timeStr += ` - ${formatTimeForDisplay(event.endTime)}`
        }
        return timeStr
    }
    
    function getEventStyle(event: CalendarEvent): string {
        if (event.isExternal && event.externalCalendarUrl) {
            const colors = getExternalCalendarColor(event.externalCalendarUrl)
            return `background-color: transparent; color: ${colors.bg}; border: 1px solid ${colors.bg};`
        }
        return ''
    }
    
    function showTooltip(event: MouseEvent, title: string, time?: string, eventObj?: CalendarEvent) {
        if (!title) return
        
        // Check if the element is actually truncated
        const target = event.target as HTMLElement
        const eventTitleElement = target.closest('.event-title, .agenda-event-title') || target
        
        if (eventTitleElement && eventTitleElement.scrollWidth > eventTitleElement.clientWidth) {
            let tooltipText = title
            if (time && time.trim()) {
                tooltipText = `${time} - ${title}`
            }
            
            // Get event styling
            let style = ''
            if (eventObj?.isExternal && eventObj?.externalCalendarUrl) {
                const colors = getExternalCalendarColor(eventObj.externalCalendarUrl)
                style = `border-color: ${colors.bg}; color: ${colors.bg};`
            } else {
                style = 'border-color: #2196f3; color: #2196f3;'
            }
            
            tooltip = {
                visible: true,
                text: tooltipText,
                x: event.clientX,
                y: event.clientY - 10,
                style: style
            }
        }
    }
    
    function hideTooltip() {
        tooltip = {
            visible: false,
            text: '',
            x: 0,
            y: 0,
            style: ''
        }
    }
    
    function moveTooltip(event: MouseEvent) {
        if (tooltip.visible) {
            tooltip = {
                ...tooltip,
                x: event.clientX,
                y: event.clientY - 10
            }
        }
    }
</script>

<!-- Desktop View -->
<div class="calendar-grid desktop-view" role="grid" aria-label="Calendar grid for {new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}">
    <!-- Header with day names -->
    <div class="calendar-header" role="rowgroup">
        <div role="row">
            <div class="day-header" role="columnheader">Sun</div>
            <div class="day-header" role="columnheader">Mon</div>
            <div class="day-header" role="columnheader">Tue</div>
            <div class="day-header" role="columnheader">Wed</div>
            <div class="day-header" role="columnheader">Thu</div>
            <div class="day-header" role="columnheader">Fri</div>
            <div class="day-header" role="columnheader">Sat</div>
        </div>
    </div>
    
    <!-- Calendar body -->
    <div class="calendar-body" role="rowgroup">
        {#each Array(6) as _, row}
            <div class="calendar-row" role="row">
                {#each Array(7) as _, col}
                    {@const dayIndex = row * 7 + col}
                    {@const day = calendarGrid[dayIndex]}
                    {#if day}
                        <div 
                            class="calendar-day" 
                            class:other-month={!day.isCurrentMonth}
                            class:today={day.isToday}
                            class:editing={editingCell?.row === row && editingCell?.col === col}
                            role="gridcell"
                            aria-label="{day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}{day.events.length > 0 ? `, ${day.events.length} event${day.events.length === 1 ? '' : 's'}` : ', no events'}{canEdit ? ', click to add event' : ''}"
                            aria-selected={day.isToday}
                            tabindex={canEdit ? 0 : undefined}
                            on:click={() => canEdit && startEditing(row, col)}
                            on:keydown={(e) => canEdit && !editingCell && handleDayKeydown(e, row, col)}
                        >
                            <div class="day-number">{day.dayNumber}</div>
                            
                            <div class="events">
                                {#each day.events as event}
                                    {#if editingEventId === event.id}
                                        <!-- Show input field when editing this specific event -->
                                        <input 
                                            class="event-input editing-inline"
                                            bind:value={editText}
                                            on:keydown={handleKeydown}
                                            on:blur={saveEvent}
                                            on:click|stopPropagation
                                            placeholder="8A-9A Meeting or All day event"
                                            aria-label="Editing event: {event.title}. Enter time and title, or just title for all-day event. Press Enter to save, Escape to cancel."
                                        />
                                    {:else}
                                        <!-- Show normal event display -->
                                        <div class="event" class:all-day={event.isAllDay} class:external={event.isExternal} style={getEventStyle(event)}>
                                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                                            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                            <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                                            <div 
                                                class="event-content" 
                                                role={canEdit ? "button" : undefined}
                                                tabindex={canEdit ? 0 : undefined}
                                                aria-label="{event.isAllDay ? 'All day event' : formatEventTime(event)}: {event.title}{event.isExternal ? ' (imported from external calendar)' : ''}{canEdit ? ', click to edit' : ''}"
                                                on:click|stopPropagation={() => canEdit && startEditingEvent(event, row, col)}
                                                on:keydown={(e) => {
                                                    if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                                                        e.preventDefault();
                                                        startEditingEvent(event, row, col);
                                                    }
                                                }}
                                            >
                                                {#if !event.isAllDay && event.startTime}
                                                    <div class="event-time">{formatEventTime(event)}</div>
                                                {/if}
                                                <div 
                                                    class="event-title"
                                                    role="button"
                                                    tabindex="0"
                                                    on:mouseenter={(e) => showTooltip(e, event.title, formatEventTime(event), event)}
                                                    on:mouseleave={hideTooltip}
                                                    on:mousemove={moveTooltip}
                                                >{event.title}</div>
                                            </div>
                                            {#if canEdit}
                                                {#if event.isExternal}
                                                    <span 
                                                        class="external-indicator material-symbols-outlined"
                                                        title="Imported from external calendar"
                                                    >captive_portal</span>
                                                {:else}
                                                    <button 
                                                        class="delete-event"
                                                        on:click|stopPropagation={() => deleteEvent(event.id)}
                                                        aria-label="Delete event: {event.title}"
                                                        title="Delete event"
                                                    >×</button>
                                                {/if}
                                            {/if}
                                        </div>
                                    {/if}
                                {/each}
                                
                                {#if editingCell?.row === row && editingCell?.col === col && !editingEventId}
                                    <!-- Show input field when adding new event (not editing existing) -->
                                    <input 
                                        class="event-input"
                                        bind:value={editText}
                                        on:keydown={handleKeydown}
                                        on:blur={saveEvent}
                                        on:click|stopPropagation
                                        placeholder="8A-9A Meeting or All day event"
                                        aria-label="Event details for {day.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Enter time and title, or just title for all-day event. Press Enter to save, Escape to cancel."
                                    />
                                {/if}
                            </div>
                        </div>
                    {/if}
                {/each}
            </div>
        {/each}
    </div>
</div>

<!-- Mobile View - Agenda/List Layout -->
<div class="calendar-agenda mobile-view" role="list" aria-label="Calendar events for {new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}">
    {#each calendarGrid.filter(day => day.isCurrentMonth) as day, index}
        {@const dayEvents = day.events}
        {@const hasEvents = dayEvents.length > 0}
        {@const isEditing = editingCell && (editingCell.row * 7 + editingCell.col) === calendarGrid.indexOf(day)}
        
        <div 
            class="agenda-day" 
            class:today={day.isToday}
            class:has-events={hasEvents}
            class:editing={isEditing}
            role="listitem"
            aria-label="{day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}{dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ', no events'}"
        >
            <div class="agenda-date">
                <div class="agenda-day-number">{day.dayNumber}</div>
                <div class="agenda-day-name">{new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}</div>
            </div>
            
            <div class="agenda-content">
                {#if dayEvents.length > 0}
                    <div class="agenda-events">
                        {#each dayEvents as event}
                            {#if editingEventId === event.id}
                                <!-- Show input field when editing this specific event -->
                                <input 
                                    class="agenda-event-input editing-inline"
                                    bind:value={editText}
                                    on:keydown={handleKeydown}
                                    on:blur={saveEvent}
                                    on:click|stopPropagation
                                    placeholder="8A-9A Meeting or All day event"
                                    aria-label="Editing event: {event.title}. Enter time and title, or just title for all-day event. Press Enter to save, Escape to cancel."
                                />
                            {:else}
                                <!-- Show normal event display -->
                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                                <div 
                                    class="agenda-event" 
                                    class:all-day={event.isAllDay} 
                                    class:external={event.isExternal}
                                    style={getEventStyle(event)}
                                    role={canEdit ? "button" : "listitem"}
                                    tabindex={canEdit ? 0 : undefined}
                                    aria-label="{event.isAllDay ? 'All day event' : formatEventTime(event)}: {event.title}{event.isExternal ? ' (imported from external calendar)' : ''}{canEdit ? ', click to edit' : ''}"
                                    on:click={() => canEdit && startEditingEvent(event, Math.floor(calendarGrid.indexOf(day) / 7), calendarGrid.indexOf(day) % 7)}
                                    on:keydown={(e) => {
                                        if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                                            e.preventDefault();
                                            startEditingEvent(event, Math.floor(calendarGrid.indexOf(day) / 7), calendarGrid.indexOf(day) % 7);
                                        }
                                    }}
                                >
                                    <div class="agenda-event-content">
                                        {#if !event.isAllDay && event.startTime}
                                            <div class="agenda-event-time">{formatEventTime(event)}</div>
                                        {/if}
                                        <div 
                                            class="agenda-event-title"
                                            role="button"
                                            tabindex="0"
                                            on:mouseenter={(e) => showTooltip(e, event.title, formatEventTime(event), event)}
                                            on:mouseleave={hideTooltip}
                                            on:mousemove={moveTooltip}
                                        >{event.title}</div>
                                    </div>
                                    {#if canEdit}
                                        {#if event.isExternal}
                                            <span 
                                                class="agenda-external-indicator material-symbols-outlined"
                                                title="Imported from external calendar"
                                            >captive_portal</span>
                                        {:else}
                                            <button 
                                                class="agenda-delete-event"
                                                on:click|stopPropagation={() => deleteEvent(event.id)}
                                                aria-label="Delete event: {event.title}"
                                                title="Delete event"
                                            >×</button>
                                        {/if}
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                    </div>
                {:else}
                    <div class="agenda-empty">
                        {#if canEdit}
                            <button 
                                class="agenda-add-event"
                                on:click={() => startEditing(Math.floor(calendarGrid.indexOf(day) / 7), calendarGrid.indexOf(day) % 7)}
                                aria-label="Add event for {day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}"
                            >
                                + Add Event
                            </button>
                        {:else}
                            <span class="no-events">No events</span>
                        {/if}
                    </div>
                {/if}
                
                {#if isEditing}
                    <div class="agenda-input-container">
                        <input 
                            class="agenda-event-input"
                            bind:value={editText}
                            on:keydown={handleKeydown}
                            on:blur={saveEvent}
                            on:click|stopPropagation
                            placeholder="8A-9A Meeting or All day event"
                            aria-label="Event details for {day.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Enter time and title, or just title for all-day event. Press Enter to save, Escape to cancel."
                        />
                    </div>
                {/if}
            </div>
        </div>
    {/each}
</div>

<!-- Custom Tooltip -->
{#if tooltip.visible}
    <div 
        class="custom-tooltip" 
        style="left: {tooltip.x}px; top: {tooltip.y}px; {tooltip.style}"
    >
        {tooltip.text}
    </div>
{/if}

<style>
    /* Date numbers and headers use DM Sans */
    .day-header,
    .day-number,
    .agenda-day-number,
    .agenda-day-name {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    /* Events use Dosis */
    .event,
    .event-title,
    .event-time,
    .agenda-event,
    .agenda-event-title,
    .agenda-event-time,
    .event-input,
    .agenda-event-input,
    .agenda-add-event {
        font-family: 'Dosis', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .calendar-grid {
        width: 100%;
        min-width: 980px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        overflow: hidden;
        background: white;
    }
    
    .calendar-header {
        background: #f5f5f5;
        border-bottom: 1px solid #e0e0e0;
    }
    
    .calendar-header [role="row"] {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
    }
    
    .day-header {
        padding: 12px 8px;
        text-align: center;
        font-weight: 600;
        font-size: 14px;
        color: #666;
    }
    
    .calendar-body {
        display: flex;
        flex-direction: column;
    }
    
    .calendar-row {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
    }
    
    .calendar-day {
        min-height: 100px;
        min-width: 140px;
        border-right: 1px solid #e0e0e0;
        border-bottom: 1px solid #e0e0e0;
        padding: 8px;
        position: relative;
        cursor: pointer;
        transition: background-color 0.2s;
        outline: none;
    }
    
    .calendar-day:hover {
        background: #f9f9f9;
    }
    
    .calendar-day:focus {
        background: #f0f8ff;
        box-shadow: inset 0 0 0 2px #2196f3;
    }
    
    .calendar-day.other-month {
        background: #fafafa;
        color: #ccc;
    }
    
    .calendar-day.today {
        background: #e3f2fd;
    }
    
    .calendar-day.editing {
        background: #f0f8ff;
        box-shadow: inset 0 0 0 2px #2196f3;
    }
    
    .day-number {
        font-weight: 600;
        margin-bottom: 4px;
        font-size: 14px;
    }
    
    .events {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-width: 100%;
        overflow: hidden;
    }
    
    .event {
        background: transparent;
        color: #2196f3;
        border: 1px solid #2196f3;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    
    .event-content {
        cursor: pointer;
        flex: 1;
        min-width: 0;
        /* Reset button styles when used as button */
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        color: inherit;
        text-align: left;
        width: 100%;
    }
    
    .event-time {
        font-size: 10px;
        opacity: 0.9;
        margin-bottom: 1px;
    }
    
    .event-title {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .delete-event {
        background: none;
        border: none;
        color: currentColor;
        cursor: pointer;
        padding: 0;
        margin-left: 4px;
        font-size: 14px;
        font-weight: bold;
        opacity: 0.7;
        transition: opacity 0.2s;
        flex-shrink: 0;
    }
    
    .delete-event:hover {
        opacity: 1;
    }
    
    .external-indicator {
        color: currentColor;
        margin-left: 4px;
        font-size: 12px;
        font-weight: normal;
        opacity: 0.7;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        transform: rotate(0deg);
    }
    
    .event-input {
        width: 100%;
        max-width: 100%;
        border: 1px solid #2196f3;
        border-radius: 4px;
        padding: 4px 6px;
        font-size: 12px;
        background: white;
        outline: none;
        box-sizing: border-box;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }
    
    .event-input::placeholder {
        color: #999;
        font-size: 11px;
    }

    .event-input.editing-inline {
        /* Style to match the event it's replacing */
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 12px;
        border: 1px solid #2196f3;
        background: white;
        color: #2196f3;
    }

    .agenda-event-input {
        width: 100%;
        max-width: 100%;
        border: 1px solid #2196f3;
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 14px;
        background: white;
        outline: none;
        box-sizing: border-box;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    .agenda-event-input.editing-inline {
        /* Style to match the agenda event it's replacing */
        color: #2196f3;
        border: 1px solid #2196f3;
        background: transparent;
    }

    .agenda-event-input::placeholder {
        color: #999;
        font-size: 13px;
    }
    
    /* Mobile View Styles */
    .mobile-view {
        display: none;
    }
    
    .calendar-agenda {
        background: white;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #e0e0e0;
    }
    
    .agenda-day {
        display: flex;
        border-bottom: 1px solid #f0f0f0;
        min-height: 60px;
        transition: background-color 0.2s;
    }
    
    .agenda-day:last-child {
        border-bottom: none;
    }
    
    .agenda-day.today {
        background: #e3f2fd;
    }
    
    .agenda-day.editing {
        background: #f0f8ff;
    }
    
    .agenda-date {
        flex-shrink: 0;
        width: 60px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px 8px;
        background: #f8f9fa;
        border-right: 1px solid #e0e0e0;
    }
    
    .agenda-day.today .agenda-date {
        background: #2196f3;
        color: white;
    }
    
    .agenda-day-number {
        font-size: 18px;
        font-weight: 700;
        line-height: 1;
    }
    
    .agenda-day-name {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        margin-top: 2px;
        opacity: 0.8;
    }
    
    .agenda-content {
        flex: 1;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .agenda-events {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    
    .agenda-event {
        background: transparent;
        color: #2196f3;
        border: 1px solid #2196f3;
        border-radius: 6px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s;
        /* Reset button styles when used as button */
        margin: 0;
        font: inherit;
        text-align: left;
        width: 100%;
    }
    
    .agenda-event:hover {
        border-color: #1976d2;
        color: #1976d2;
    }
    
    .event.external {
        cursor: default;
    }

    .agenda-event.external {
        cursor: default;
    }

    .agenda-event.external:hover {
        /* Slightly darken the color on hover for external events */
        filter: brightness(0.9);
    }
    
    .agenda-event-content {
        flex: 1;
        min-width: 0;
    }
    
    .agenda-event-time {
        font-size: 12px;
        font-weight: 600;
        opacity: 0.9;
        margin-bottom: 2px;
    }
    
    .agenda-event-title {
        font-size: 14px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .agenda-delete-event {
        background: none;
        border: none;
        color: currentColor;
        cursor: pointer;
        padding: 4px 8px;
        margin-left: 8px;
        font-size: 16px;
        font-weight: bold;
        opacity: 0.7;
        transition: opacity 0.2s;
        flex-shrink: 0;
        border-radius: 4px;
    }
    
    .agenda-delete-event:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.2);
    }
    
    .agenda-external-indicator {
        color: currentColor;
        margin-left: 8px;
        font-size: 16px;
        font-weight: normal;
        opacity: 0.7;
        flex-shrink: 0;
        padding: 4px 8px;
        display: inline-flex;
        align-items: center;
        border-radius: 4px;
    }
    
    .agenda-empty {
        display: flex;
        align-items: center;
    }
    
    .agenda-add-event {
        background: none;
        border: 2px dashed #ddd;
        color: #666;
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
        width: 100%;
    }
    
    .agenda-add-event:hover {
        border-color: #2196f3;
        color: #2196f3;
        background: #f0f8ff;
    }
    
    .no-events {
        color: #999;
        font-size: 14px;
        font-style: italic;
    }
    
    .agenda-input-container {
        margin-top: 8px;
    }
    
    .agenda-event-input {
        width: 100%;
        border: 2px solid #2196f3;
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 14px;
        background: white;
        outline: none;
        box-sizing: border-box;
    }
    
    .agenda-event-input::placeholder {
        color: #999;
        font-size: 13px;
    }
    
    /* Responsive Breakpoint */
    @media (max-width: 768px) {
        .desktop-view {
            display: none;
        }
        
        .mobile-view {
            display: block;
        }
        
        /* Reset min-width for mobile */
        .calendar-grid {
            min-width: auto;
        }
        
        .calendar-day {
            min-width: auto;
        }
    }
    
    /* Desktop-only styles for consistent sizing */
    @media (min-width: 769px) {
        .calendar-grid.desktop-view {
            overflow-x: auto;
        }
    }
    
    /* Custom Tooltip */
    .custom-tooltip {
        position: fixed;
        background: white;
        border: 1px solid #2196f3;
        color: #2196f3;
        padding: 8px 12px;
        border-radius: 6px;
        font-family: 'Dosis', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        max-width: 300px;
        word-wrap: break-word;
        z-index: 1000;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transform: translateX(-50%);
        opacity: 0;
        animation: tooltipFadeIn 0.2s ease-out forwards;
    }
    
    @keyframes tooltipFadeIn {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-5px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
</style>