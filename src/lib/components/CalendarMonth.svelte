<script lang="ts">
    import { getCalendarGrid, formatTimeForDisplay, parseEventInput, formatDateForDb, toUtcTimestamp, getLocalDateFromUtc, getLocalTimeFromUtc, isUtcTimestampOnLocalDate, type CalendarEvent, type CalendarDay } from '$lib/calendar-utils.js'
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
    let isOpening = false
    
    // Drag and drop state
    let draggedEvent: CalendarEvent | null = null
    let draggedFromDate: string | null = null
    let isDragging = false
    let dropTargetDay: CalendarDay | null = null
    
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
        
        // Add global click handler to close editors when clicking outside
        const handleGlobalClick = (event: Event) => {
            // Don't process if we're in the middle of opening an editor
            if (isOpening) return
            
            if (editingCell && event.target instanceof HTMLElement) {
                // Check if the click was on an input field or inside the calendar
                const isInsideCalendar = event.target.closest('.calendar-grid, .calendar-agenda')
                const isInputField = event.target.closest('.event-input, .agenda-event-input')
                
                // If clicking outside the calendar or not on an input field, close the editor
                if (!isInsideCalendar || (!isInputField && !event.target.closest('.calendar-day, .agenda-day, .agenda-content'))) {
                    if (editText.trim()) {
                        saveEvent()
                    } else {
                        cancelEdit()
                    }
                }
            }
        }
        
        document.addEventListener('click', handleGlobalClick)
        
        return () => {
            document.removeEventListener('click', handleGlobalClick)
        }
    })
    
    async function loadEvents() {
        if (!calendarId) return
        
        // Auto-sync external calendars if user is authenticated (not via share link)
        if (!shareToken && canEdit) {
            try {
                const syncResults = await autoSync.checkAndSyncExternalCalendars(calendarId)
                if (syncResults.some(r => r.hasChanges)) {
                    // Could show a subtle notification here if desired
                }
            } catch (error) {
                console.warn('Auto-sync failed:', error)
                // Don't block calendar loading if sync fails
            }
        }
        
        // Query by UTC timestamps for the month range
        const startOfMonth = new Date(year, month, 1)
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59)
        const startDate = toUtcTimestamp(startOfMonth)
        const endDate = toUtcTimestamp(endOfMonth)
        
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
                .gte('start_datetime_utc', startDate)
                .lte('start_datetime_utc', endDate)
                .order('start_datetime_utc')
            
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
            startDatetimeUtc: event.start_datetime_utc,
            endDatetimeUtc: event.end_datetime_utc,
            isAllDay: event.is_all_day,
            externalId: event.external_id,
            externalCalendarUrl: event.external_calendar_url,
            isExternal: !!event.external_id
        }))
        
        // Distribute events to calendar days (convert UTC to local date)
        calendarGrid = calendarGrid.map(day => ({
            ...day,
            events: events
                .filter(event => isUtcTimestampOnLocalDate(event.startDatetimeUtc, day.date))
                .sort((a, b) => {
                    // All-day events should appear first
                    if (a.isAllDay && !b.isAllDay) return -1
                    if (!a.isAllDay && b.isAllDay) return 1
                    
                    // Among scheduled events, sort by start time
                    if (!a.isAllDay && !b.isAllDay) {
                        return a.startDatetimeUtc.localeCompare(b.startDatetimeUtc)
                    }
                    
                    return 0
                })
        }))
    }
    
    async function startEditing(row: number, col: number) {
        if (!canEdit) return
        
        // Set flag to prevent immediate closure
        isOpening = true
        
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
            // Clear the opening flag after the event loop completes
            setTimeout(() => {
                isOpening = false
            }, 100)
        }, 0)
    }
    
    async function startEditingEvent(event: CalendarEvent, row: number, col: number) {
        if (!canEdit) return
        if (event.isExternal) return // External events cannot be edited
        
        // Set flag to prevent immediate closure
        isOpening = true
        
        // If we're already editing a different cell, save the current edit first
        if (editingCell && (editingCell.row !== row || editingCell.col !== col)) {
            await saveEvent()
        }
        
        editingCell = { row, col }
        editingEventId = event.id
        
        // Convert event back to input format (convert UTC to local time)
        let eventText = event.title
        if (!event.isAllDay) {
            const startTime = formatTimeForDisplay(getLocalTimeFromUtc(event.startDatetimeUtc))
            const endTime = event.endDatetimeUtc ? formatTimeForDisplay(getLocalTimeFromUtc(event.endDatetimeUtc)) : ''
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
            // Clear the opening flag after the event loop completes
            setTimeout(() => {
                isOpening = false
            }, 100)
        }, 0)
    }
    
    async function saveEvent() {
        if (!editingCell || !editText.trim() || !calendarId || isSaving) return
        
        isSaving = true
        
        const dayIndex = editingCell.row * 7 + editingCell.col
        const selectedDay = calendarGrid[dayIndex]
        
        const parsed = parseEventInput(editText)
        
        // Convert local date/time to UTC timestamps
        const startDatetimeUtc = toUtcTimestamp(selectedDay.date, parsed.startTime)
        const endDatetimeUtc = parsed.endTime ? toUtcTimestamp(selectedDay.date, parsed.endTime) : null
        
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
                            start_datetime_utc: startDatetimeUtc,
                            end_datetime_utc: endDatetimeUtc,
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
                            start_datetime_utc: startDatetimeUtc,
                            end_datetime_utc: endDatetimeUtc,
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
                        start_datetime_utc: startDatetimeUtc,
                        end_datetime_utc: endDatetimeUtc,
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
                        start_datetime_utc: startDatetimeUtc,
                        end_datetime_utc: endDatetimeUtc,
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
    
    function handleBlur() {
        // If there's text content, save the event
        if (editText.trim()) {
            saveEvent()
        } else {
            // If empty, just cancel the edit
            cancelEdit()
        }
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
        // Only intercept keys if we're not already editing and the target is not an input field
        const target = event.target as HTMLElement
        const isInputField = target.tagName === 'INPUT' || target.closest('.event-input, .agenda-event-input')
        
        // If user starts typing a letter/number/space, start editing and capture the input
        // but only if we're not already in an input field
        if (!isInputField && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
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
        const startTime = getLocalTimeFromUtc(event.startDatetimeUtc)
        timeStr = formatTimeForDisplay(startTime)
        
        if (event.endDatetimeUtc) {
            const endTime = getLocalTimeFromUtc(event.endDatetimeUtc)
            timeStr += ` - ${formatTimeForDisplay(endTime)}`
        }
        return timeStr
    }
    
    function getEventStyle(event: CalendarEvent): string {
        if (event.isExternal && event.externalCalendarUrl) {
            const colors = getExternalCalendarColor(event.externalCalendarUrl)
            return `background-color: transparent; border-color: ${colors.bg};`
        }
        return ''
    }
    
    function showTooltip(event: MouseEvent, title: string, time?: string, eventObj?: CalendarEvent) {
        if (!title) return
        
        // Check if the element is actually truncated
        const target = event.target as HTMLElement
        const eventTitleElement = target.closest('.event-title, .agenda-event-title') || target
        
        // Only show tooltip when the text is actually truncated (overflow with ellipsis)
        if (eventTitleElement && eventTitleElement.scrollWidth > eventTitleElement.clientWidth) {
            let tooltipText = title
            if (time && time.trim()) {
                tooltipText = `${time} - ${title}`
            }
            
            // Get event styling to match the events
            let style = ''
            if (eventObj?.isExternal && eventObj?.externalCalendarUrl) {
                const colors = getExternalCalendarColor(eventObj.externalCalendarUrl)
                style = `border-color: ${colors.bg}; color: var(--dark-text);`
            } else {
                style = `border-color: var(--primary-color); color: var(--dark-text);`
            }
            
            // Find the closest event element (either .event or .agenda-event)
            const eventElement = target.closest('.event, .agenda-event') as HTMLElement
            if (eventElement) {
                const rect = eventElement.getBoundingClientRect()
                
                tooltip = {
                    visible: true,
                    text: tooltipText,
                    x: rect.left + rect.width / 2, // Center horizontally on the event
                    y: rect.top - 5, // Position directly above the event
                    style: style
                }
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
    

    
    // Drag and drop handlers
    function handleDragStart(event: DragEvent, eventObj: CalendarEvent) {
        if (!canEdit || eventObj.isExternal) {
            event.preventDefault()
            return
        }
        
        draggedEvent = eventObj
        draggedFromDate = getLocalDateFromUtc(eventObj.startDatetimeUtc)
        isDragging = true
        
        // Set drag effect
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', eventObj.id)
        }
        
        // Hide tooltip if visible
        hideTooltip()
    }
    
    function handleDragEnd(event: DragEvent) {
        // Reset drag state
        draggedEvent = null
        draggedFromDate = null
        isDragging = false
        dropTargetDay = null
    }
    
    function handleDragOver(event: DragEvent) {
        if (!isDragging || !draggedEvent) return
        
        event.preventDefault()
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move'
        }
    }
    
    function handleDragEnter(event: DragEvent, day: CalendarDay) {
        if (!isDragging || !draggedEvent) return
        
        event.preventDefault()
        dropTargetDay = day
    }
    
    function handleDragLeave(event: DragEvent, day: CalendarDay) {
        if (!isDragging || !draggedEvent) return
        
        // Only clear if we're actually leaving this specific day
        if (dropTargetDay === day) {
            dropTargetDay = null
        }
    }
    
    async function handleDrop(event: DragEvent, day: CalendarDay) {
        if (!isDragging || !draggedEvent) return
        
        event.preventDefault()
        dropTargetDay = null
        
        const newDate = formatDateForDb(day.date)
        
        // Don't do anything if dropping on the same date
        if (newDate === draggedFromDate) {
            handleDragEnd(event)
            return
        }
        
        // Store original event data for potential rollback
        const originalEvent = { ...draggedEvent }
        const originalDate = draggedFromDate
        
        // Calculate the new UTC timestamp preserving the time
        const localTime = getLocalTimeFromUtc(draggedEvent.startDatetimeUtc)
        const newStartDatetimeUtc = toUtcTimestamp(day.date, localTime)
        const endDatetimeUtc = draggedEvent.endDatetimeUtc ? (
            draggedEvent.endDatetimeUtc
                ? toUtcTimestamp(day.date, getLocalTimeFromUtc(draggedEvent.endDatetimeUtc))
                : null
        ) : null
        
        // Optimistically update the local state immediately
        updateEventInLocalState(draggedEvent.id, newStartDatetimeUtc, endDatetimeUtc)
        
        try {
            // Update the database in the background
            await updateEventDate(draggedEvent.id, newStartDatetimeUtc, endDatetimeUtc)
            dispatch('eventMoved', { event: draggedEvent, newDate })
        } catch (error) {
            console.error('Error moving event:', error)
            // Revert the optimistic update if database update fails
            if (originalEvent.startDatetimeUtc) {
                updateEventInLocalState(draggedEvent.id, originalEvent.startDatetimeUtc, originalEvent.endDatetimeUtc)
            }
        }
        
        handleDragEnd(event)
    }
    
    function updateEventInLocalState(eventId: string, newStartDatetimeUtc: string, newEndDatetimeUtc?: string | null) {
        // Find and update the event in the events array
        const eventIndex = events.findIndex(e => e.id === eventId)
        if (eventIndex === -1) return
        
        // Update the event's UTC timestamps
        events[eventIndex].startDatetimeUtc = newStartDatetimeUtc
        if (newEndDatetimeUtc !== undefined) {
            events[eventIndex].endDatetimeUtc = newEndDatetimeUtc
        }
        
        // Redistribute events to calendar days
        calendarGrid = calendarGrid.map(day => ({
            ...day,
            events: events
                .filter(event => isUtcTimestampOnLocalDate(event.startDatetimeUtc, day.date))
                .sort((a, b) => {
                    // All-day events should appear first
                    if (a.isAllDay && !b.isAllDay) return -1
                    if (!a.isAllDay && b.isAllDay) return 1
                    
                    // Among scheduled events, sort by start time
                    if (!a.isAllDay && !b.isAllDay) {
                        return a.startDatetimeUtc.localeCompare(b.startDatetimeUtc)
                    }
                    
                    return 0
                })
        }))
    }

    async function updateEventDate(eventId: string, newStartDatetimeUtc: string, newEndDatetimeUtc?: string | null) {
        let error
        
        const updateData: any = {
            start_datetime_utc: newStartDatetimeUtc
        }
        
        if (newEndDatetimeUtc !== undefined) {
            updateData.end_datetime_utc = newEndDatetimeUtc
        }
        
        if (shareToken) {
            // Use shared calendar API
            try {
                const response = await fetch(`/api/shared/events?shareToken=${shareToken}&eventId=${eventId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updateData)
                })
                
                if (!response.ok) {
                    throw new Error('Failed to update event date')
                }
                error = null
            } catch (err) {
                error = err
            }
        } else {
            // Use regular Supabase client for authenticated users
            const { error: updateError } = await supabase
                .from('events')
                .update(updateData)
                .eq('id', eventId)
            
            error = updateError
        }
        
        if (error) {
            throw error
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
                            class:drag-target={dropTargetDay === day}
                            class:dragging={isDragging}
                            role="gridcell"
                            aria-label="{day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}{day.events.length > 0 ? `, ${day.events.length} event${day.events.length === 1 ? '' : 's'}` : ', no events'}{canEdit ? ', click to add event' : ''}"
                            aria-selected={day.isToday}
                            tabindex={canEdit ? 0 : undefined}
                            on:click={() => canEdit && startEditing(row, col)}
                            on:keydown={(e) => canEdit && !editingCell && handleDayKeydown(e, row, col)}
                            on:dragover={handleDragOver}
                            on:dragenter={(e) => handleDragEnter(e, day)}
                            on:dragleave={(e) => handleDragLeave(e, day)}
                            on:drop={(e) => handleDrop(e, day)}
                        >
                            <div class="day-number">{day.dayNumber}</div>
                            
                            <div class="events">
                                {#each day.events as event}
                                    {#if editingEventId === event.id}
                                        <!-- Show input field when editing this specific event -->
                                        <input 
                                            class="event-input editing-inline"
                                            bind:value={editText}
                                            on:keydown|stopPropagation={handleKeydown}
                                            on:blur={handleBlur}
                                            on:click|stopPropagation
                                            placeholder="8A-9A Meeting or All day event"
                                            aria-label="Editing event: {event.title}. Enter time and title, or just title for all-day event. Press Enter to save, Escape to cancel."
                                        />
                                    {:else}
                                        <!-- Show normal event display -->
                                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                                        <div 
                                            class="event" 
                                            class:all-day={event.isAllDay} 
                                            class:external={event.isExternal} 
                                            class:dragging={draggedEvent?.id === event.id}
                                            style={getEventStyle(event)}
                                            draggable={canEdit && !event.isExternal}
                                            role={canEdit && !event.isExternal ? "button" : "listitem"}
                                            on:dragstart={(e) => handleDragStart(e, event)}
                                            on:dragend={handleDragEnd}
                                        >
                                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                                            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                            <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                                            <div 
                                                class="event-content" 
                                                role={canEdit ? "button" : undefined}
                                                tabindex={canEdit ? 0 : undefined}
                                                aria-label="{event.isAllDay ? 'All day event' : formatEventTime(event)}: {event.title}{event.isExternal ? ' (imported from external calendar)' : ''}{canEdit ? ', click to edit or drag to move' : ''}"
                                                on:click|stopPropagation={() => canEdit && startEditingEvent(event, row, col)}
                                                on:keydown={(e) => {
                                                    if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                                                        // Only prevent default if we're not in an input field
                                                        const target = e.target as HTMLElement;
                                                        const isInInputField = target.tagName === 'INPUT' || target.closest('.event-input, .agenda-event-input');
                                                        
                                                        if (!isInInputField && !editingCell) {
                                                            e.preventDefault();
                                                            startEditingEvent(event, row, col);
                                                        }
                                                    }
                                                }}
                                            >
                                                {#if !event.isAllDay}
                                                    <div class="event-time">{formatEventTime(event)}</div>
                                                {/if}
                                                <div 
                                                    class="event-title"
                                                    role="button"
                                                    tabindex="0"
                                                    on:mouseenter={(e) => showTooltip(e, event.title, formatEventTime(event), event)}
                                                    on:mouseleave={hideTooltip}
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
                                        on:keydown|stopPropagation={handleKeydown}
                                        on:blur={handleBlur}
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
            class:drag-target={dropTargetDay === day}
            class:dragging={isDragging}
            role="listitem"
            aria-label="{day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}{dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ', no events'}"
            on:dragover={handleDragOver}
            on:dragenter={(e) => handleDragEnter(e, day)}
            on:dragleave={(e) => handleDragLeave(e, day)}
            on:drop={(e) => handleDrop(e, day)}
        >
            <div class="agenda-date">
                <div class="agenda-day-number">{day.dayNumber}</div>
                <div class="agenda-day-name">{new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}</div>
            </div>
            
            <div 
                class="agenda-content"
                on:click|self={(e) => {
                    if (canEdit && !isEditing) {
                        startEditing(Math.floor(calendarGrid.indexOf(day) / 7), calendarGrid.indexOf(day) % 7)
                    }
                }}
            >
                {#if dayEvents.length > 0}
                    <div class="agenda-events">                        
                        {#each dayEvents as event}
                            {#if editingEventId === event.id}
                                <!-- Show input field when editing this specific event -->
                                <input 
                                    class="agenda-event-input editing-inline"
                                    bind:value={editText}
                                    on:keydown|stopPropagation={handleKeydown}
                                    on:blur={handleBlur}
                                    on:click|stopPropagation
                                    placeholder="8A-9A Meeting or All day event"
                                    aria-label="Editing event: {event.title}. Enter time and title, or just title for all-day event. Press Enter to save, Escape to cancel."
                                />
                            {:else}
                                <!-- Show normal event display -->
                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                <div 
                                    class="agenda-event" 
                                    class:all-day={event.isAllDay} 
                                    class:external={event.isExternal}
                                    class:dragging={draggedEvent?.id === event.id}
                                    style={getEventStyle(event)}
                                    role={canEdit ? "button" : "listitem"}
                                    tabindex={canEdit ? 0 : undefined}
                                    draggable={canEdit && !event.isExternal}
                                    aria-label="{event.isAllDay ? 'All day event' : formatEventTime(event)}: {event.title}{event.isExternal ? ' (imported from external calendar)' : ''}{canEdit ? ', click to edit or drag to move' : ''}"
                                    on:click={() => canEdit && startEditingEvent(event, Math.floor(calendarGrid.indexOf(day) / 7), calendarGrid.indexOf(day) % 7)}
                                    on:keydown={(e) => {
                                        if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                                            // Only prevent default if we're not in an input field
                                            const target = e.target as HTMLElement;
                                            const isInInputField = target.tagName === 'INPUT' || target.closest('.event-input, .agenda-event-input');
                                            
                                            if (!isInInputField && !editingCell) {
                                                e.preventDefault();
                                                startEditingEvent(event, Math.floor(calendarGrid.indexOf(day) / 7), calendarGrid.indexOf(day) % 7);
                                            }
                                        }
                                    }}
                                    on:dragstart={(e) => handleDragStart(e, event)}
                                    on:dragend={handleDragEnd}
                                >
                                    <div class="agenda-event-content">
                                        {#if !event.isAllDay}
                                            <div class="agenda-event-time">{formatEventTime(event)}</div>
                                        {/if}
                                        <div 
                                            class="agenda-event-title"
                                            role="button"
                                            tabindex="0"
                                            on:mouseenter={(e) => showTooltip(e, event.title, formatEventTime(event), event)}
                                            on:mouseleave={hideTooltip}
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
                            on:keydown|stopPropagation={handleKeydown}
                            on:blur={handleBlur}
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
    /* Component-specific calendar styles - most styles now in global.css */
  

    /* Calendar grid specific layout */
    .calendar-grid {
        width: 100%;
        min-width: 800px;
        border-radius: var(--radius-small-default);
        overflow: hidden;
        background: var(--white);
    }
    
    .calendar-header {
        background: var(--white);
        border-bottom: 0.5px solid var(--gray-600);
        width: 100%;
    }
    
    .calendar-header [role="row"] {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        width: 100%;
    }
    
    .day-header {
        padding: var(--space-3) var(--space-2);
        text-align: center;
        font-weight: 600;
        font-size: 14px;
        color: var(--gray-1000);
        background: var(--white);
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .calendar-body {
        display: flex;
        flex-direction: column;
    }
    
    .calendar-row {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        width: 100%;
        border-left: 0.5px solid var(--gray-300);
    }
    
    .calendar-day {
        min-height: 110px;
        min-width: 10px;
        border-right: .5px solid var(--gray-300);
        border-bottom: .5px solid var(--gray-500);
        padding: var(--space-2);
        position: relative;
        cursor: pointer;
        transition: background-color var(--transition-normal);
        outline: none;
        box-sizing: border-box;
    }
    
    .calendar-day:hover {
        background: #f9f9f9;
    }
    
    .calendar-day:focus {
        background: var(--primary-ultra-light);
        box-shadow: inset 0 0 0 2px var(--primary-color);
    }
    
    .calendar-day.other-month {
        background: #fafafa;
    }
    
    .calendar-day.today {
        background: var(--primary-light);
    }
    
    .calendar-day.editing {
        background: var(--primary-ultra-light);
    }

    .day-number {
        font-weight: 600;
        margin-bottom: var(--space-1);
        font-size: 14px;
    }

    .calendar-day.other-month .day-number {
        color: #5a6577;
        font-weight: 200;
    }
    
    .events {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-width: 100%;
        overflow: hidden;
    }
    
    .event-input {
        width: 100%;
        max-width: 100%;
        border: 0px solid var(--primary-color);
        border-radius: var(--radius-small-default);
        padding: var(--space-1) var(--space-2);
        font-size: 12px;
        background: var(--white);
        outline: none;
        box-sizing: border-box;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }
    
    .event-input::placeholder {
        color: var(--gray-1000);
        font-size: 11px;
    }

    .event-input.editing-inline {
        border-radius: var(--radius-small-default);
        padding: 2px 6px;
        font-size: 12px;
        border: 1px solid var(--primary-color);
        background: var(--white);
        color: var(--primary-color);
    }

    /* Mobile agenda view styles */
    .mobile-view {
        display: none;
    }
    
    .calendar-agenda {
        background: var(--white);
        border-radius: var(--radius-small-default);
        overflow: hidden;
        border: 1px solid var(--gray-1000);
    }
    
    .agenda-day {
        display: flex;
        border-bottom: 1px solid #f0f0f0;
        min-height: 60px;
        transition: background-color var(--transition-normal);
        width: 100%;
        overflow: hidden;
    }
    
    .agenda-day:last-child {
        border-bottom: none;
    }
    
    .agenda-day.today {
        background: var(--primary-light);
    }
    
    .agenda-day.editing {
        background: var(--primary-ultra-light);
    }
    
    .agenda-date {
        flex-shrink: 0;
        width: 60px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-3) var(--space-2);
        background: var(--gray-1000);
        border-right: 1px solid var(--gray-1000);
    }
    
    .agenda-day.today .agenda-date {
        background: var(--primary-color);
        color: var(--white);
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
        padding: var(--space-3) var(--space-4);
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-width: 0;
        overflow: hidden;
    }
    
    .agenda-events {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        width: 100%;
        overflow: hidden;
    }
    
    .agenda-event {
        background: transparent;
        color: var(--primary-color);
        border-width: 1px !important;
        border-style: solid;
        border-color: var(--primary-color);
        border-radius:0;
        padding: var(--space-2) var(--space-3);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: border-color var(--transition-normal), color var(--transition-normal);
        margin: 0;
        font: inherit;
        text-align: left;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
    }
    
    .agenda-event:hover {
        border-color: var(--primary-hover);
        color: var(--primary-hover);
    }
    
    .agenda-event.external {
        cursor: default;
    }

    .agenda-event.external:hover {
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
        margin-bottom: 0;
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
        padding: var(--space-1) var(--space-2);
        margin-left: var(--space-2);
        font-size: 16px;
        font-weight: bold;
        opacity: 0.7;
        transition: opacity var(--transition-normal);
        flex-shrink: 0;
        border-radius: var(--radius-small-default);
    }
    
    .agenda-delete-event:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.2);
    }
    
    .agenda-external-indicator {
        color: currentColor;
        margin-left: var(--space-2);
        font-size: 16px;
        font-weight: normal;
        opacity: 0.7;
        flex-shrink: 0;
        padding: var(--space-1) var(--space-2);
        display: inline-flex;
        align-items: center;
        border-radius: var(--radius-small-default);
    }
    
    .agenda-empty {
        display: flex;
        align-items: center;
    }
    
    .agenda-add-event {
        background: none;
        border: 2px dashed var(--gray-1000);
        color: var(--gray-1000);
        border-radius: var(--radius-small-default);
        padding: var(--space-2) var(--space-3);
        cursor: pointer;
        font-size: 14px;
        transition: all var(--transition-normal);
        width: 100%;
    }
    
    .agenda-add-event:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
        background: var(--primary-ultra-light);
    }
    
    .no-events {
        color: var(--gray-1000);
        font-size: 14px;
        font-style: italic;
    }
    
    .agenda-input-container {
        margin-top: var(--space-2);
    }
    
    .agenda-event-input {
        width: 100%;
        border: 2px solid var(--primary-color);
        border-radius: var(--radius-small-default);
        padding: var(--space-2) var(--space-3);
        font-size: 14px;
        background: var(--white);
        outline: none;
        box-sizing: border-box;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    .agenda-event-input.editing-inline {
        color: var(--primary-color);
        border: 1px solid var(--primary-color);
        background: transparent;
    }

    .agenda-event-input::placeholder {
        color: var(--gray-1000);
        font-size: 13px;
    }
    
    /* Responsive overrides */
    @media (max-width: 768px) {
        .desktop-view {
            display: none;
        }
        
        .mobile-view {
            display: block;
        }
        
        .calendar-grid {
            min-width: auto;
        }
        
        .calendar-day {
            min-width: auto;
        }
        
        .calendar-agenda {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
        }
        
        .agenda-content {
            padding: var(--space-2) var(--space-3);
        }
        
        .agenda-event {
            padding: var(--space-2);
        }
        
        .agenda-event-title {
            font-size: 13px;
        }
        
        .agenda-event-time {
            font-size: 11px;
        }
    }
    
    @media (min-width: 769px) {
        .calendar-grid.desktop-view {
            overflow-x: auto;
        }
    }
    
    /* Custom tooltip - component specific */
    .custom-tooltip {
        position: fixed;
        background: white;
        border: none;
        color: var(--dark-text);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-small-default);
        font-family: var(--font-secondary);
        font-size: 14px;
        font-weight: 500;
        max-width: 300px;
        word-wrap: break-word;
        z-index: 1000;
        pointer-events: none;
        box-shadow: var(--shadow-sm);
        transform: translateX(-50%) translateY(-100%);
        opacity: 1;
        transition: opacity var(--transition-fast) ease-out;
    }
    
    /* Drag and drop styles */
    .calendar-day.drag-target {
        background: var(--primary-ultra-light) !important;
        box-shadow: inset 0 0 0 2px var(--primary-color);
    }
    
    .agenda-day.drag-target {
        background: var(--primary-ultra-light) !important;
        box-shadow: inset 0 0 0 2px var(--primary-color);
    }
    
    .event.dragging {
        opacity: 0.5;
        transform: scale(0.98);
        cursor: grabbing !important;
    }
    
    .agenda-event.dragging {
        opacity: 0.5;
        transform: scale(0.98);
        cursor: grabbing !important;
    }
    
    .calendar-day.dragging {
        cursor: copy;
    }
    
    .agenda-day.dragging {
        cursor: copy;
    }
    
    /* Add grab cursor for draggable events */
    .event[draggable="true"]:not(.dragging) {
        cursor: grab;
    }
    
    .agenda-event[draggable="true"]:not(.dragging) {
        cursor: grab;
    }
    
    /* Improve visual feedback when hovering draggable events */
    .event[draggable="true"]:hover:not(.dragging) {
        transform: scale(1.02);
        box-shadow: var(--shadow-sm);
        transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    }
    
    .agenda-event[draggable="true"]:hover:not(.dragging) {
        transform: scale(1.01);
        box-shadow: var(--shadow-sm);
        transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    }
</style>