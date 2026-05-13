-- ARCHIVED MIGRATION (kept for historical reference)
-- New environments should run only `database_schema.sql`.
-- This file was merged into `database_schema.sql` on 2026-03-04.

-- Migration: Add id + stream to categories table
-- Run this in the Supabase SQL editor for legacy environments only

-- ============================================================
-- 1. Add id column to categories (proper primary key)
-- ============================================================
ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Back-fill any existing rows that got NULL
UPDATE public.categories SET id = gen_random_uuid() WHERE id IS NULL;

-- Make it NOT NULL and set as primary key
ALTER TABLE public.categories ALTER COLUMN id SET NOT NULL;

-- Add primary key (only if it doesn't already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'categories_pkey' AND conrelid = 'public.categories'::regclass
    ) THEN
        ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- ============================================================
-- 2. Add stream column to categories
-- ============================================================
ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS stream TEXT DEFAULT 'Uncategorized';

-- ============================================================
-- 3. Index for efficient lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_categories_user_id
    ON public.categories (user_id);

CREATE INDEX IF NOT EXISTS idx_categories_stream
    ON public.categories (user_id, stream);

-- ============================================================
-- 4. Store transaction categories as FK instead of free text
-- ============================================================
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS category_id UUID;

-- Backfill category_id from legacy category_user text where possible
UPDATE public.transactions t
SET category_id = c.id
FROM public.categories c
WHERE t.user_id = c.user_id
  AND t.category_id IS NULL
  AND t.category_user IS NOT NULL
  AND LOWER(TRIM(t.category_user)) = LOWER(TRIM(c.name));

-- Add foreign key constraint (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_category_id_fkey'
          AND conrelid = 'public.transactions'::regclass
    ) THEN
        ALTER TABLE public.transactions
            ADD CONSTRAINT transactions_category_id_fkey
            FOREIGN KEY (category_id)
            REFERENCES public.categories(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_user_category_id
    ON public.transactions (user_id, category_id);
