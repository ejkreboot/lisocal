# Calendgnar 🎿

A personal calendar that shreds the gnar! Built with SvelteKit and Supabase.

## Features

- **Effortless Event Entry**: Click any day and start typing. Use natural time formats like "8A-9A Meeting" or just "All day event"
- **OTP Authentication**: Passwordless sign-in with 6-digit email codes
- **Shared Calendars**: Generate UUID-based shareable links for view or edit access
- **Clean Month View**: Focus on the calendar with minimal UI friction
- **Responsive Design**: Works great on desktop and mobile

## Quick Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd calendgnar
   npm install
   ```

2. **Set up Supabase**:
   - Create a new Supabase project
   - Copy the provided `.env` file and update with your Supabase credentials:
     ```
     PUBLIC_SUPABASE_URL=your_supabase_url
     PUBLIC_SUPABASE_ANON_KEY=your_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```

3. **Initialize the database**:
   - Run the SQL script in `database_schema.sql` in your Supabase SQL editor
   - This creates all necessary tables, RLS policies, and triggers

4. **Start developing**:
   ```bash
   npm run dev
   ```

## Architecture

- **Frontend**: SvelteKit with TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Authentication**: OTP via Supabase Auth
- **Calendar Logic**: Custom utilities for date handling and event parsing
- **Sharing**: UUID-based secure links with configurable permissions

## Usage

### Basic Event Entry
- Click on any calendar day
- Type naturally: "8A-9A Meeting", "9:30P Dinner", or "All day event"
- Press Enter to save, Escape to cancel

### Time Format Examples
- `8A Meeting` → 8:00 AM Meeting
- `9:30P-11P Dinner` → 9:30 PM - 11:00 PM Dinner
- `14:00 Conference` → 2:00 PM Conference
- `Holiday party` → All-day event

### Sharing Calendars
- Sign in and use the API endpoint `/api/share` to create shared links
- Share the generated URL for view or edit access
- Links can optionally expire after a set number of days

## Development

The codebase follows the guiding principle of minimizing friction. Key files:

- `src/lib/calendar-utils.ts` - Date and event parsing logic
- `src/lib/components/CalendarMonth.svelte` - Main calendar component
- `src/hooks.server.ts` - Authentication and shared link handling
- `database_schema.sql` - Complete database setup

## Deployment

1. **Build for production**:
   ```bash
   npm run build
   ```

2. **Configure your deployment platform** with the same environment variables

3. **Deploy** using your preferred adapter (Vercel, Netlify, etc.)

---

*Built with the philosophy that using a calendar should feel as smooth as carving fresh powder. No unnecessary complexity, just pure functionality.*
