-- lisocal Database Schema
-- Run this script in the Supabase SQL editor to set up the database

-- Enable RLS (Row Level Security) by default
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Calendars table
CREATE TABLE IF NOT EXISTS public.calendars (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'My Calendar',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Events table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    is_all_day BOOLEAN DEFAULT false NOT NULL,
    external_id TEXT, -- UID from imported ICS events (null for user-created events)
    external_calendar_url TEXT, -- URL of the external calendar this event came from
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Shared links table for calendar sharing
CREATE TABLE IF NOT EXISTS public.shared_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    share_token UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
    permissions TEXT DEFAULT 'view' NOT NULL CHECK (permissions IN ('view', 'edit')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Todos table for unscheduled tasks
CREATE TABLE IF NOT EXISTS public.todos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT false NOT NULL,
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendars_user_id ON public.calendars(user_id);
CREATE INDEX IF NOT EXISTS idx_events_calendar_id ON public.events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON public.events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_external_id ON public.events(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_external_url ON public.events(external_calendar_url) WHERE external_calendar_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shared_links_token ON public.shared_links(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_links_calendar_id ON public.shared_links(calendar_id);
CREATE INDEX IF NOT EXISTS idx_todos_calendar_id ON public.todos(calendar_id);
CREATE INDEX IF NOT EXISTS idx_todos_sort_index ON public.todos(calendar_id, completed, sort_index);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for calendars table
CREATE POLICY "Users can view own calendars" ON public.calendars
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendars" ON public.calendars
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendars" ON public.calendars
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendars" ON public.calendars
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for events table (also allow access via shared links)
CREATE POLICY "Users can view events in own calendars" ON public.events
    FOR SELECT USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert events in own calendars" ON public.events
    FOR INSERT WITH CHECK (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update events in own calendars" ON public.events
    FOR UPDATE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete events in own calendars" ON public.events
    FOR DELETE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for shared_links table
CREATE POLICY "Users can view own shared links" ON public.shared_links
    FOR SELECT USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create shared links for own calendars" ON public.shared_links
    FOR INSERT WITH CHECK (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own shared links" ON public.shared_links
    FOR UPDATE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own shared links" ON public.shared_links
    FOR DELETE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for todos table (also allow access via shared links)
CREATE POLICY "Users can view todos in own calendars" ON public.todos
    FOR SELECT USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert todos in own calendars" ON public.todos
    FOR INSERT WITH CHECK (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update todos in own calendars" ON public.todos
    FOR UPDATE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete todos in own calendars" ON public.todos
    FOR DELETE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- Function to automatically create a user record when they sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email);
    
    -- Create a default calendar for the new user
    INSERT INTO public.calendars (user_id, name)
    VALUES (NEW.id, 'My Calendar');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user signs up
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER handle_updated_at_users BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_calendars BEFORE UPDATE ON public.calendars
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_events BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_todos BEFORE UPDATE ON public.todos
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- External calendar sync metadata tracking

CREATE TABLE IF NOT EXISTS public.external_calendar_sync (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    external_url TEXT NOT NULL,
    etag TEXT,
    last_modified TEXT,
    last_synced TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    sync_interval_minutes INTEGER DEFAULT 60, -- Default to 1 hour
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    
    UNIQUE(calendar_id, external_url)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_external_sync_calendar_url ON public.external_calendar_sync(calendar_id, external_url);
CREATE INDEX IF NOT EXISTS idx_external_sync_last_synced ON public.external_calendar_sync(last_synced);

-- Enable Row Level Security
ALTER TABLE public.external_calendar_sync ENABLE ROW LEVEL SECURITY;

-- RLS Policy for external_calendar_sync table
CREATE POLICY "Users can manage sync metadata for own calendars" ON public.external_calendar_sync
    FOR ALL USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at_external_sync BEFORE UPDATE ON public.external_calendar_sync
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add notes table for scratchpad functionality

-- Notes table for scratchpad functionality
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notes_calendar_id ON public.notes(calendar_id);
CREATE INDEX IF NOT EXISTS idx_notes_sort_index ON public.notes(calendar_id, sort_index);

-- Enable Row Level Security
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notes table (similar to todos)
CREATE POLICY "Users can view notes in own calendars" ON public.notes
    FOR SELECT USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert notes in own calendars" ON public.notes
    FOR INSERT WITH CHECK (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update notes in own calendars" ON public.notes
    FOR UPDATE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete notes in own calendars" ON public.notes
    FOR DELETE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- Trigger for updated_at
CREATE TRIGGER handle_updated_at_notes BEFORE UPDATE ON public.notes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();