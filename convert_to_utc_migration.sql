ALTER TABLE public.events 
     DROP COLUMN IF EXISTS start_date,
     DROP COLUMN IF EXISTS end_date,
     DROP COLUMN IF EXISTS start_time,
     DROP COLUMN IF EXISTS end_time;
 
DROP INDEX IF EXISTS idx_events_start_date;
