/**
 * Date utilities for calendar functionality
 */

export interface CalendarEvent {
    id: string
    title: string
    description?: string
    startDate: string
    endDate?: string
    startTime?: string
    endTime?: string
    isAllDay: boolean
    externalId?: string // UID from external ICS calendar
    externalCalendarUrl?: string // URL of external calendar
    isExternal?: boolean // Helper flag to identify external events
}

export interface CalendarDay {
    date: Date
    dayNumber: number
    isCurrentMonth: boolean
    isToday: boolean
    events: CalendarEvent[]
}

/**
 * Get the calendar grid for a given month and year
 */
export function getCalendarGrid(year: number, month: number): CalendarDay[] {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const firstDayOfWeek = firstDay.getDay() // 0 = Sunday
    
    const grid: CalendarDay[] = []
    const today = new Date()
    
    // Add days from previous month to fill the first week
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const date = new Date(year, month, -i)
        grid.push({
            date,
            dayNumber: date.getDate(),
            isCurrentMonth: false,
            isToday: isSameDay(date, today),
            events: []
        })
    }
    
    // Add days from current month
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day)
        grid.push({
            date,
            dayNumber: day,
            isCurrentMonth: true,
            isToday: isSameDay(date, today),
            events: []
        })
    }
    
    // Add days from next month to fill the last week (up to 42 days total = 6 weeks)
    const remainingDays = 42 - grid.length
    for (let day = 1; day <= remainingDays; day++) {
        const date = new Date(year, month + 1, day)
        grid.push({
            date,
            dayNumber: day,
            isCurrentMonth: false,
            isToday: isSameDay(date, today),
            events: []
        })
    }
    
    return grid
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate()
}

/**
 * Format date as YYYY-MM-DD for database storage
 */
export function formatDateForDb(date: Date): string {
    return date.toISOString().split('T')[0]
}

/**
 * Parse a date string from the database
 */
export function parseDateFromDb(dateString: string): Date {
    return new Date(dateString + 'T00:00:00')
}

/**
 * Get month name
 */
export function getMonthName(monthIndex: number): string {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ]
    return months[monthIndex]
}

/**
 * Parse time input like "8A", "9:30P", "14:30", etc.
 */
export function parseTimeInput(input: string): string | null {
    if (!input.trim()) return null
    
    const timeStr = input.trim().toUpperCase()
    
    // Match patterns like 8A, 9:30P, 14:30, 2:00PM, etc.
    const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s*([AP]M?)?$/
    const match = timeStr.match(timeRegex)
    
    if (!match) return null
    
    let hours = parseInt(match[1])
    const minutes = parseInt(match[2] || '0')
    const period = match[3]
    
    if (minutes >= 60) return null
    
    // Handle 12-hour format
    if (period) {
        if (period.startsWith('P') && hours !== 12) {
            hours += 12
        } else if (period.startsWith('A') && hours === 12) {
            hours = 0
        }
    }
    
    if (hours >= 24) return null
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Parse event input like "8A-9A Meeting" or "9:30P-11P Dinner"
 */
export function parseEventInput(input: string): {
    title: string
    startTime: string | null
    endTime: string | null
    isAllDay: boolean
} {
    const trimmed = input.trim()
    
    // Look for time range pattern at the beginning
    const timeRangeRegex = /^([^-\s]+)\s*-\s*([^-\s]+)\s+(.+)$/
    const match = trimmed.match(timeRangeRegex)
    
    if (match) {
        const startTime = parseTimeInput(match[1])
        const endTime = parseTimeInput(match[2])
        
        if (startTime && endTime) {
            return {
                title: match[3].trim(),
                startTime,
                endTime,
                isAllDay: false
            }
        }
    }
    
    // Look for single time at the beginning
    const singleTimeRegex = /^([^-\s]+)\s+(.+)$/
    const singleMatch = trimmed.match(singleTimeRegex)
    
    if (singleMatch) {
        const time = parseTimeInput(singleMatch[1])
        if (time) {
            return {
                title: singleMatch[2].trim(),
                startTime: time,
                endTime: null,
                isAllDay: false
            }
        }
    }
    
    // No time specified, treat as all-day event
    return {
        title: trimmed,
        startTime: null,
        endTime: null,
        isAllDay: true
    }
}

/**
 * Format time for display (24-hour to 12-hour)
 */
export function formatTimeForDisplay(time: string): string {
    const [hours, minutes] = time.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
    
    return `${displayHours}${minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : ''}${period}`
}