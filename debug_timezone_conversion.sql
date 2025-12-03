-- Debug script to check timezone conversion
-- Run this to see what's happening with the timezone conversion

-- Test 1: Check what timezone PostgreSQL thinks it's in
SHOW timezone;

-- Test 2: Test the conversion function with a known value
-- December 14, 2025 at 12:00 PM EST should become 17:00 UTC (5 hour difference)
SELECT 
    'Test Case: Dec 14, 2025 12:00 PM' as test_description,
    '2025-12-14'::DATE as input_date,
    '12:00:00'::TIME as input_time,
    combine_datetime_to_utc('2025-12-14'::DATE, '12:00:00'::TIME, 'America/New_York') as result_utc,
    combine_datetime_to_utc('2025-12-14'::DATE, '12:00:00'::TIME, 'America/New_York') AT TIME ZONE 'America/New_York' as back_to_ny;

-- Test 3: Show actual events and their conversions
SELECT 
    title,
    start_date,
    start_time,
    start_datetime_utc,
    start_datetime_utc AT TIME ZONE 'America/New_York' as start_ny_time,
    EXTRACT(HOUR FROM start_datetime_utc) as utc_hour,
    EXTRACT(HOUR FROM start_time) as original_time_hour,
    EXTRACT(HOUR FROM (start_datetime_utc AT TIME ZONE 'America/New_York')) as ny_hour
FROM public.events
WHERE start_time IS NOT NULL
ORDER BY start_date DESC
LIMIT 5;

-- Test 4: Check if DST is being applied correctly
SELECT 
    '2025-12-14 12:00:00'::timestamp AT TIME ZONE 'America/New_York' as interpreted_as_ny,
    ('2025-12-14 12:00:00'::timestamp AT TIME ZONE 'America/New_York') AT TIME ZONE 'UTC' as converted_to_utc;
