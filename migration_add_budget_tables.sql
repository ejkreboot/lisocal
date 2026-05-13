-- ARCHIVED MIGRATION (kept for historical reference)
-- New environments should run only `database_schema.sql`.
-- This file was merged into `database_schema.sql` on 2026-03-04.

-- Budget / Teller integration tables
-- Run this migration in the Supabase SQL editor for legacy environments only

-- ============================================================
-- 1. teller_enrollments  (SERVER-ONLY — no RLS grants for anon/authenticated)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teller_enrollments (
    user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    access_token_ciphertext TEXT NOT NULL,
    enrollment_id TEXT,
    institution_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    revoked_at TIMESTAMPTZ
);

-- Strip ALL access from anon + authenticated.  Only service_role can touch this table.
ALTER TABLE public.teller_enrollments ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke everything from non-service roles
REVOKE ALL ON public.teller_enrollments FROM anon, authenticated;

-- No RLS policies — even if someone bypasses REVOKE, RLS blocks them.

-- ============================================================
-- 2. teller_accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teller_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    teller_account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    institution TEXT NOT NULL,
    type TEXT,
    subtype TEXT,
    currency TEXT DEFAULT 'USD',
    last_four TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, teller_account_id)
);

ALTER TABLE public.teller_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own teller accounts"
    ON public.teller_accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own teller accounts"
    ON public.teller_accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own teller accounts"
    ON public.teller_accounts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own teller accounts"
    ON public.teller_accounts FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- 3. teller_sync_state
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teller_sync_state (
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    teller_account_id TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    PRIMARY KEY (user_id, teller_account_id)
);

ALTER TABLE public.teller_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync state"
    ON public.teller_sync_state FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own sync state"
    ON public.teller_sync_state FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync state"
    ON public.teller_sync_state FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================================
-- 4. transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    teller_account_id TEXT NOT NULL,
    teller_transaction_id TEXT NOT NULL,
    posted_at DATE,
    authorized_at DATE,
    pending BOOLEAN DEFAULT FALSE,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'USD',
    description TEXT NOT NULL,
    merchant TEXT,
    raw JSONB,
    category_auto TEXT,
    category_user TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, teller_transaction_id)
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
    ON public.transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions"
    ON public.transactions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions"
    ON public.transactions FOR DELETE
    USING (auth.uid() = user_id);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_transactions_user_posted
    ON public.transactions (user_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_account
    ON public.transactions (user_id, teller_account_id);

-- ============================================================
-- 5. categories (user-managed transaction categories)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    UNIQUE(user_id, name)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own categories"
    ON public.categories FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own categories"
    ON public.categories FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories"
    ON public.categories FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories"
    ON public.categories FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at on transactions
CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_updated_at
    BEFORE UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_transactions_updated_at();
