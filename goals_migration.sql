-- Goals Migration
-- Run this script in the Supabase SQL editor to add goal tracking functionality for the Ambient Coach

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
    
    -- Ensure only one progress entry per goal per day
    UNIQUE(goal_id, progress_date)
);

-- Goal milestones table (optional checkpoints for larger goals)
CREATE TABLE IF NOT EXISTS public.goal_milestones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    target_date DATE,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_goals_calendar_id ON public.goals(calendar_id);
CREATE INDEX IF NOT EXISTS idx_goals_sort_index ON public.goals(calendar_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_goals_category ON public.goals(calendar_id, category);
CREATE INDEX IF NOT EXISTS idx_goals_target_date ON public.goals(target_date);
CREATE INDEX IF NOT EXISTS idx_goal_progress_goal_id ON public.goal_progress(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_progress_date ON public.goal_progress(goal_id, progress_date);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal_id ON public.goal_milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_sort_index ON public.goal_milestones(goal_id, sort_index);

-- Enable Row Level Security
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;

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

-- Triggers for updated_at
CREATE TRIGGER handle_updated_at_goals BEFORE UPDATE ON public.goals
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at_goal_milestones BEFORE UPDATE ON public.goal_milestones
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