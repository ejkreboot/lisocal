-- Enhanced Todos Migration
-- Run this script in Supabase SQL editor to add goal connections and priority features to todos

-- Add new columns to existing todos table
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS priority_level INTEGER DEFAULT 0 CHECK (priority_level >= 0 AND priority_level <= 3),
ADD COLUMN IF NOT EXISTS daily_priority BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS priority_date DATE;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_todos_goal_id ON public.todos(goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todos_priority_level ON public.todos(calendar_id, priority_level) WHERE priority_level > 0;
CREATE INDEX IF NOT EXISTS idx_todos_daily_priority ON public.todos(calendar_id, daily_priority, priority_date) WHERE daily_priority = TRUE;

-- Function to automatically clear daily_priority when date changes
CREATE OR REPLACE FUNCTION clear_old_daily_priorities()
RETURNS TRIGGER AS $$
BEGIN
    -- If daily_priority is being set to true, clear other daily priorities for this calendar on this date
    IF NEW.daily_priority = TRUE THEN
        -- First, clear any old daily priorities from previous dates
        UPDATE public.todos 
        SET daily_priority = FALSE, priority_date = NULL
        WHERE calendar_id = NEW.calendar_id 
        AND daily_priority = TRUE 
        AND (priority_date IS NULL OR priority_date < CURRENT_DATE);
        
        -- Set the priority date to today
        NEW.priority_date = CURRENT_DATE;
        
        -- Limit to 3 daily priorities per calendar per day
        IF (
            SELECT COUNT(*) 
            FROM public.todos 
            WHERE calendar_id = NEW.calendar_id 
            AND daily_priority = TRUE 
            AND priority_date = CURRENT_DATE
            AND id != NEW.id
        ) >= 3 THEN
            RAISE EXCEPTION 'Cannot set more than 3 daily priorities per day';
        END IF;
    ELSIF NEW.daily_priority = FALSE THEN
        NEW.priority_date = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to manage daily priorities
DROP TRIGGER IF EXISTS trigger_manage_daily_priorities ON public.todos;
CREATE TRIGGER trigger_manage_daily_priorities 
    BEFORE INSERT OR UPDATE ON public.todos
    FOR EACH ROW 
    EXECUTE FUNCTION clear_old_daily_priorities();

-- Update RLS policies to include goal access
DROP POLICY IF EXISTS "Users can view todos in own calendars" ON public.todos;
CREATE POLICY "Users can view todos in own calendars" ON public.todos
    FOR SELECT USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert todos in own calendars" ON public.todos;
CREATE POLICY "Users can insert todos in own calendars" ON public.todos
    FOR INSERT WITH CHECK (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
        AND (
            goal_id IS NULL OR 
            goal_id IN (
                SELECT g.id FROM public.goals g
                JOIN public.calendars c ON g.calendar_id = c.id
                WHERE c.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update todos in own calendars" ON public.todos;
CREATE POLICY "Users can update todos in own calendars" ON public.todos
    FOR UPDATE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        goal_id IS NULL OR 
        goal_id IN (
            SELECT g.id FROM public.goals g
            JOIN public.calendars c ON g.calendar_id = c.id
            WHERE c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete todos in own calendars" ON public.todos;
CREATE POLICY "Users can delete todos in own calendars" ON public.todos
    FOR DELETE USING (
        calendar_id IN (
            SELECT id FROM public.calendars WHERE user_id = auth.uid()
        )
    );

-- Add comments for documentation
COMMENT ON COLUMN public.todos.goal_id IS 'Optional reference to a goal this todo helps achieve';
COMMENT ON COLUMN public.todos.priority_level IS '0=none, 1=low, 2=medium, 3=high priority';
COMMENT ON COLUMN public.todos.daily_priority IS 'True if this is one of the 1-3 top priorities for today';
COMMENT ON COLUMN public.todos.priority_date IS 'Date when daily_priority was set, auto-managed by trigger';