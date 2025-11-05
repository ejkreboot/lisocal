-- Migration to add external calendar sync metadata tracking
-- Add this to your Supabase database

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