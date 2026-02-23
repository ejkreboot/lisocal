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
    start_datetime_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime_utc TIMESTAMP WITH TIME ZONE,
    is_all_day BOOLEAN DEFAULT false NOT NULL,
    external_id TEXT,
    external_calendar_url TEXT,
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
    priority_level INTEGER,
    priority_date DATE,
    daily_priority BOOLEAN,
    goal_id UUID,
    stage TEXT DEFAULT 'Ready' CHECK (stage IN ('Contemplation', 'Ready', 'In Progress', 'Done')),
    project TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Notes table for scratchpad functionality
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    title TEXT,
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habits table
CREATE TABLE IF NOT EXISTS public.habits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#7c3aed',
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habit completions table (tracks which days a habit was completed)
CREATE TABLE IF NOT EXISTS public.habit_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    habit_id UUID REFERENCES public.habits(id) ON DELETE CASCADE NOT NULL,
    completion_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(habit_id, completion_date)
);

-- Goals table
CREATE TABLE IF NOT EXISTS public.goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    target_date DATE,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    color TEXT NOT NULL DEFAULT '#7c3aed',
    category TEXT NOT NULL DEFAULT 'Personal',
    daily_action TEXT,
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Goal progress history table (tracks progress over time)
CREATE TABLE IF NOT EXISTS public.goal_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
    progress_date DATE NOT NULL DEFAULT CURRENT_DATE,
    progress_value INTEGER NOT NULL CHECK (progress_value >= 0 AND progress_value <= 100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(goal_id, progress_date)
);

-- Goal milestones table (optional checkpoints for larger goals)
CREATE TABLE IF NOT EXISTS public.goal_milestones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    target_date DATE,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- External calendar sync metadata tracking
CREATE TABLE IF NOT EXISTS public.external_calendar_sync (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calendar_id UUID REFERENCES public.calendars(id) ON DELETE CASCADE NOT NULL,
    external_url TEXT NOT NULL,
    etag TEXT,
    last_modified TEXT,
    last_synced TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    sync_interval_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(calendar_id, external_url)
);

-- Coaching prompts table
CREATE TABLE IF NOT EXISTS public.coaching_prompts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    prompt TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendars_user_id ON public.calendars(user_id);
CREATE INDEX IF NOT EXISTS idx_events_calendar_id ON public.events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_events_start_datetime ON public.events(start_datetime_utc);
CREATE INDEX IF NOT EXISTS idx_events_external_id ON public.events(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_external_url ON public.events(external_calendar_url) WHERE external_calendar_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shared_links_token ON public.shared_links(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_links_calendar_id ON public.shared_links(calendar_id);
CREATE INDEX IF NOT EXISTS idx_todos_calendar_id ON public.todos(calendar_id);
CREATE INDEX IF NOT EXISTS idx_todos_sort_index ON public.todos(calendar_id, completed, sort_index);
CREATE INDEX IF NOT EXISTS idx_todos_stage ON public.todos(calendar_id, stage);
CREATE INDEX IF NOT EXISTS idx_todos_project ON public.todos(calendar_id, project) WHERE project IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_calendar_id ON public.notes(calendar_id);
CREATE INDEX IF NOT EXISTS idx_notes_sort_index ON public.notes(calendar_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_habits_calendar_id ON public.habits(calendar_id);
CREATE INDEX IF NOT EXISTS idx_habits_sort_index ON public.habits(calendar_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_id ON public.habit_completions(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_completions_date ON public.habit_completions(habit_id, completion_date);
CREATE INDEX IF NOT EXISTS idx_goals_calendar_id ON public.goals(calendar_id);
CREATE INDEX IF NOT EXISTS idx_goals_sort_index ON public.goals(calendar_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_goals_category ON public.goals(calendar_id, category);
CREATE INDEX IF NOT EXISTS idx_goals_target_date ON public.goals(target_date);
CREATE INDEX IF NOT EXISTS idx_goal_progress_goal_id ON public.goal_progress(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_progress_date ON public.goal_progress(goal_id, progress_date);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal_id ON public.goal_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_sort_index ON public.goal_milestones(goal_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_external_sync_calendar_url ON public.external_calendar_sync(calendar_id, external_url);
CREATE INDEX IF NOT EXISTS idx_external_sync_last_synced ON public.external_calendar_sync(last_synced);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_calendar_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_prompts ENABLE ROW LEVEL SECURITY;

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

-- RLS Policies for events table
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

-- RLS Policies for todos table
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

-- RLS Policies for notes table
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

-- RLS Policies for habits table
CREATE POLICY "Users can view habits in own calendars" ON public.habits
    FOR SELECT USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert habits in own calendars" ON public.habits
    FOR INSERT WITH CHECK (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update habits in own calendars" ON public.habits
    FOR UPDATE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete habits in own calendars" ON public.habits
    FOR DELETE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for habit_completions table
CREATE POLICY "Users can view completions for habits in own calendars" ON public.habit_completions
    FOR SELECT USING (
        habit_id IN (
            SELECT h.id FROM public.habits h
            JOIN public.calendars c ON h.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert completions for habits in own calendars" ON public.habit_completions
    FOR INSERT WITH CHECK (
        habit_id IN (
            SELECT h.id FROM public.habits h
            JOIN public.calendars c ON h.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete completions for habits in own calendars" ON public.habit_completions
    FOR DELETE USING (
        habit_id IN (
            SELECT h.id FROM public.habits h
            JOIN public.calendars c ON h.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

-- RLS Policies for goals table
CREATE POLICY "Users can view goals in own calendars" ON public.goals
    FOR SELECT USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert goals in own calendars" ON public.goals
    FOR INSERT WITH CHECK (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update goals in own calendars" ON public.goals
    FOR UPDATE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete goals in own calendars" ON public.goals
    FOR DELETE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for goal_progress table
CREATE POLICY "Users can view progress for goals in own calendars" ON public.goal_progress
    FOR SELECT USING (
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert progress for goals in own calendars" ON public.goal_progress
    FOR INSERT WITH CHECK (
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update progress for goals in own calendars" ON public.goal_progress
    FOR UPDATE USING (
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete progress for goals in own calendars" ON public.goal_progress
    FOR DELETE USING (
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

-- RLS Policies for goal_milestones table
CREATE POLICY "Users can view milestones for goals in own calendars" ON public.goal_milestones
    FOR SELECT USING (
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert milestones for goals in own calendars" ON public.goal_milestones
    FOR INSERT WITH CHECK (
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update milestones for goals in own calendars" ON public.goal_milestones
    FOR UPDATE USING (
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete milestones for goals in own calendars" ON public.goal_milestones
    FOR DELETE USING (
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

-- RLS Policy for external_calendar_sync table
CREATE POLICY "Users can manage sync metadata for own calendars" ON public.external_calendar_sync
    FOR ALL USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- RLS Policy for coaching_prompts table (read-only for all authenticated users)
CREATE POLICY "All authenticated users can read coaching prompts" ON public.coaching_prompts
    FOR SELECT TO authenticated USING (true);

-- Functions and Triggers
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

CREATE TRIGGER handle_updated_at_notes BEFORE UPDATE ON public.notes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_habits BEFORE UPDATE ON public.habits
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_goals BEFORE UPDATE ON public.goals
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_goal_milestones BEFORE UPDATE ON public.goal_milestones
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_external_sync BEFORE UPDATE ON public.external_calendar_sync
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to automatically update goal progress when progress entries are made
CREATE OR REPLACE FUNCTION update_goal_progress_on_entry()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the goals table with the latest progress value
    UPDATE public.goals 
    SET progress = NEW.progress_value,
        updated_at = NOW()
    WHERE id = NEW.goal_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update goal progress
CREATE TRIGGER trigger_update_goal_progress 
    AFTER INSERT OR UPDATE ON public.goal_progress
    FOR EACH ROW 
    EXECUTE FUNCTION update_goal_progress_on_entry();


-- Writing bucket
insert into storage.buckets (id, name, public)
    values ('lisocal_write', 'lisocal_write', false)
    on conflict (id) do nothing;

create policy "Users can manage their own writings"
on storage.objects
for all
using (
  bucket_id = 'lisocal_write' 
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'lisocal_write' 
  and auth.uid()::text = (storage.foldername(name))[1]
);