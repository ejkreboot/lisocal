-- Migration to add Kanban fields to todos table
-- Run this in the Supabase SQL editor for existing databases

-- Add stage column (defaults to 'Ready' for existing todos)
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Ready' CHECK (stage IN ('Contemplation', 'Ready', 'In Progress', 'Done'));

-- Add project column
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS project TEXT;

-- Create indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_todos_stage ON public.todos(calendar_id, stage);
CREATE INDEX IF NOT EXISTS idx_todos_project ON public.todos(calendar_id, project) WHERE project IS NOT NULL;

-- Update completed todos to 'Done' stage
UPDATE public.todos SET stage = 'Done' WHERE completed = true AND stage != 'Done';
