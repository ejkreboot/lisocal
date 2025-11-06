-- Add notes table for scratchpad functionality
-- Run this script in the Supabase SQL editor after the main database_schema.sql

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