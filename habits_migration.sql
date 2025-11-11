-- Habits Migration
-- Run this script in the Supabase SQL editor to add habit tracking functionality

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
    
    -- Ensure only one completion per habit per day
    UNIQUE(habit_id, completion_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_habits_calendar_id ON public.habits(calendar_id);
CREATE INDEX IF NOT EXISTS idx_habits_sort_index ON public.habits(calendar_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_id ON public.habit_completions(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_completions_date ON public.habit_completions(habit_id, completion_date);

-- Enable Row Level Security
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;

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

-- Trigger for updated_at on habits
CREATE TRIGGER handle_updated_at_habits BEFORE UPDATE ON public.habits
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
