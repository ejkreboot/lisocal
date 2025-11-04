<script lang="ts">
    import { getCalendarGrid, formatTimeForDisplay, parseEventInput, formatDateForDb, type CalendarEvent, type CalendarDay } from '$lib/calendar-utils.js'
    import { supabase } from '$lib/supabase.js'
    import { onMount, createEventDispatcher } from 'svelte'
    
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
    
    // Reactive statement to update grid when year/month changes
    $: {
        calendarGrid = getCalendarGrid(year, month)
        loadEvents()
    }
    
    onMount(() => {
        loadEvents()
    })
    
    async function loadEvents() {
        if (!calendarId) return
        
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
        
        events = (data || []).map(event => ({
            id: event.id,
            title: event.title,
            description: event.description,
            startDate: event.start_date,
            endDate: event.end_date,
            startTime: event.start_time,
            endTime: event.end_time,
            isAllDay: event.is_all_day
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
            const input = document.querySelector('.event-input') as HTMLInputElement
            if (input) {
                input.focus()
            }
        }, 0)
    }
    
    async function startEditingEvent(event: CalendarEvent, row: number, col: number) {
        if (!canEdit) return
        
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
            const input = document.querySelector('.event-input') as HTMLInputElement
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
                const input = document.querySelector('.event-input') as HTMLInputElement
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
</script>

<div class="calendar-grid">
    <!-- Header with day names -->
    <div class="calendar-header">
        <div class="day-header">Sun</div>
        <div class="day-header">Mon</div>
        <div class="day-header">Tue</div>
        <div class="day-header">Wed</div>
        <div class="day-header">Thu</div>
        <div class="day-header">Fri</div>
        <div class="day-header">Sat</div>
    </div>
    
    <!-- Calendar body -->
    <div class="calendar-body">
        {#each Array(6) as _, row}
            <div class="calendar-row">
                {#each Array(7) as _, col}
                    {@const dayIndex = row * 7 + col}
                    {@const day = calendarGrid[dayIndex]}
                    {#if day}
                        <div 
                            class="calendar-day" 
                            class:other-month={!day.isCurrentMonth}
                            class:today={day.isToday}
                            class:editing={editingCell?.row === row && editingCell?.col === col}
                            on:click={() => canEdit && startEditing(row, col)}
                            on:keydown={(e) => canEdit && !editingCell && handleDayKeydown(e, row, col)}
                            tabindex={canEdit ? 0 : -1}
                        >
                            <div class="day-number">{day.dayNumber}</div>
                            
                            <div class="events">
                                {#each day.events as event}
                                    <div class="event" class:all-day={event.isAllDay} class:editing-event={editingEventId === event.id}>
                                        <div class="event-content" on:click|stopPropagation={() => canEdit && startEditingEvent(event, row, col)}>
                                            {#if !event.isAllDay && event.startTime}
                                                <div class="event-time">{formatEventTime(event)}</div>
                                            {/if}
                                            <div class="event-title">{event.title}</div>
                                        </div>
                                        {#if canEdit}
                                            <button 
                                                class="delete-event"
                                                on:click|stopPropagation={() => deleteEvent(event.id)}
                                                title="Delete event"
                                            >×</button>
                                        {/if}
                                    </div>
                                {/each}
                                
                                {#if editingCell?.row === row && editingCell?.col === col}
                                    <input 
                                        class="event-input"
                                        bind:value={editText}
                                        on:keydown={handleKeydown}
                                        on:blur={saveEvent}
                                        on:click|stopPropagation
                                        placeholder="8A-9A Meeting or All day event"
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

<style>
    .calendar-grid {
        width: 100%;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        overflow: hidden;
        background: white;
    }
    
    .calendar-header {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        background: #f5f5f5;
        border-bottom: 1px solid #e0e0e0;
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
        min-height: 120px;
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
        background: #2196f3;
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    
    .event.all-day {
        background: #faa336;
    }
    
    .event.editing-event {
        background: #ff9800;
        box-shadow: 0 0 0 2px #ff9800;
    }
    
    .event-content {
        cursor: pointer;
        flex: 1;
        min-width: 0;
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
        color: white;
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
</style>