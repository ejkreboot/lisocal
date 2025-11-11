# Habit Tracker Setup

## Database Migration

To enable the habit tracker feature, you need to run the database migration in Supabase:

1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Copy and paste the contents of `habits_migration.sql`
4. Click "Run" to execute the migration

This will create the necessary tables:
- `habits` - Stores habit definitions (name, color, sort order)
- `habit_completions` - Tracks which days each habit was completed

## Features

- **Track multiple habits** with custom names and colors
- **30-day view** showing the past month including today
- **Visual grid layout** with 2 columns of 15 boxes per habit
- **Streak tracking** showing consecutive days of completion
- **Click to toggle** completion status for any day
- **Color-coded** habits for easy identification
- **Today's box** is highlighted with an accent border
- **Persistent storage** in your calendar database
- **Share-link compatible** - habits work with view/edit shared calendars

## Usage

1. Click the "Self Improvement" icon in the header to open the habit tracker
2. Initially, you'll have no habits - you'll need to add the ability to create them (coming soon!)
3. Click any box to mark a habit as complete for that day
4. Build streaks by completing habits consistently!

## API Endpoints

### GET `/api/habits`
Fetch all habits and completions for a calendar
- Query params: `calendarId`, optional `shareToken`
- Returns: `{ habits: [], completions: [] }`

### POST `/api/habits`
Create a new habit
- Body: `{ calendarId, name, color }`
- Returns: `{ habit: {...} }`

### PUT `/api/habits?habitId=<id>`
Toggle completion or update habit
- For completion: Body `{ completionDate, completed }`
- For update: Body `{ name?, color? }`
- For reorder: Body `{ reorderData: { habitIds, calendarId } }`

### DELETE `/api/habits?habitId=<id>`
Delete a habit (completions cascade delete)

## Next Steps

To make the habit tracker fully functional, you'll want to add:
1. UI to create new habits
2. UI to edit habit names and colors
3. UI to delete habits
4. UI to reorder habits
5. More date range options (week view, custom ranges)
6. Statistics and insights (completion rate, best streaks, etc.)
