/**
 * Color utilities for external calendars
 */

// Predefined color palette for external calendars
const EXTERNAL_CALENDAR_COLORS = [
    { bg: '#ef4444', text: '#ffffff' }, // Red
    { bg: '#f97316', text: '#ffffff' }, // Orange
    { bg: '#6a6a6aff', text: '#ffffff' }, // Yellow
    { bg: '#22c55e', text: '#ffffff' }, // Green
    { bg: '#06b6d4', text: '#ffffff' }, // Cyan
    { bg: '#61789fff', text: '#ffffff' }, // Blue
    { bg: '#e29c07ff', text: '#ffffff' }, // Purple
    { bg: '#ec4899', text: '#ffffff' }, // Pink
    { bg: '#10b981', text: '#ffffff' }, // Emerald
    { bg: '#f54d0bff', text: '#ffffff' }, // Amber
    { bg: '#84cc16', text: '#ffffff' }, // Lime
    { bg: '#14b8a6', text: '#ffffff' }, // Teal
    { bg: '#f68426ff', text: '#ffffff' }, // Indigo
    { bg: '#a855f7', text: '#ffffff' }, // Violet
    { bg: '#d946ef', text: '#ffffff' }, // Fuchsia
]

/**
 * Simple hash function to convert a string to a number
 */
function hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
}

/**
 * Get a consistent color for an external calendar URL
 */
export function getExternalCalendarColor(url: string): { bg: string; text: string } {
    if (!url) {
        return { bg: '#6b7280', text: '#ffffff' } // Default gray
    }
    
    const hash = hashString(url)
    const colorIndex = hash % EXTERNAL_CALENDAR_COLORS.length
    return EXTERNAL_CALENDAR_COLORS[colorIndex]
}

/**
 * Get a lighter version of the external calendar color for backgrounds
 */
export function getExternalCalendarColorLight(url: string): { bg: string; text: string } {
    const color = getExternalCalendarColor(url)
    
    // Convert hex to RGB, then lighten it
    const hex = color.bg.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // Create a lighter version (mix with white)
    const lightR = Math.round(r + (255 - r) * 0.8)
    const lightG = Math.round(g + (255 - g) * 0.8)
    const lightB = Math.round(b + (255 - b) * 0.8)
    
    const lightHex = `#${lightR.toString(16).padStart(2, '0')}${lightG.toString(16).padStart(2, '0')}${lightB.toString(16).padStart(2, '0')}`
    
    return {
        bg: lightHex,
        text: color.bg // Use the original color as text
    }
}

/**
 * Get all available colors for display purposes
 */
export function getAllExternalCalendarColors(): Array<{ bg: string; text: string }> {
    return [...EXTERNAL_CALENDAR_COLORS]
}