-- Amazon Orders table
-- Stores parsed Amazon order emails forwarded by users via ImproveMX webhook.
-- Matched to Teller transactions by order number.

CREATE TABLE IF NOT EXISTS public.amazon_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    order_number TEXT NOT NULL,
    order_date TIMESTAMPTZ,
    email_from TEXT NOT NULL,
    email_raw TEXT,
    items JSONB NOT NULL DEFAULT '[]',
    total NUMERIC,
    currency TEXT DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, order_number)
);

-- Enable RLS
ALTER TABLE public.amazon_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own amazon orders"
    ON public.amazon_orders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own amazon orders"
    ON public.amazon_orders FOR UPDATE
    USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_amazon_orders_user_id ON public.amazon_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_order_number ON public.amazon_orders(user_id, order_number);
