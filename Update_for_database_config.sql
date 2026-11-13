-- =============================================================================
-- DriveFlyElectric — Supabase Database Configuration & Migration Updates
-- Safe, idempotent SQL script for Supabase SQL Editor / PostgreSQL
-- =============================================================================

-- 1. Real-Time System Activity & Email Dispatch Audit Log
CREATE TABLE IF NOT EXISTS public.system_activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  user_email TEXT,
  order_number TEXT,
  amount NUMERIC(12, 2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  system_mail_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.system_activities
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS system_mail_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_system_activities_created_at
  ON public.system_activities (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_activities_type
  ON public.system_activities (type);

CREATE INDEX IF NOT EXISTS idx_system_activities_order_number
  ON public.system_activities (order_number)
  WHERE order_number IS NOT NULL;

ALTER TABLE public.system_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to system_activities" ON public.system_activities;
CREATE POLICY "Service role full access to system_activities"
  ON public.system_activities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Unpaid / Abandoned Cart Progressive Email Reminders (1h, 6h, 12h, 24h, 48h, 72h)
CREATE TABLE IF NOT EXISTS public.cart_reminders (
  id TEXT PRIMARY KEY,
  reminder_key TEXT NOT NULL UNIQUE,
  user_id TEXT,
  visitor_id TEXT,
  email TEXT NOT NULL,
  customer_name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_count INTEGER NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cart_signature TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  sent_stages INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  last_sent_stage INTEGER NOT NULL DEFAULT 0,
  last_reminded_at TIMESTAMPTZ,
  completed_order_number TEXT,
  cart_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cart_reminders
  ADD COLUMN IF NOT EXISTS reminder_key TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cart_signature TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS sent_stages INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN IF NOT EXISTS last_sent_stage INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_order_number TEXT,
  ADD COLUMN IF NOT EXISTS cart_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'cart_reminders'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%(reminder_key)%'
  ) THEN
    CREATE UNIQUE INDEX idx_cart_reminders_reminder_key
      ON public.cart_reminders (reminder_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cart_reminders_active_updated
  ON public.cart_reminders (status, cart_updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_cart_reminders_email
  ON public.cart_reminders (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_cart_reminders_user_id
  ON public.cart_reminders (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.cart_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to cart_reminders" ON public.cart_reminders;
CREATE POLICY "Service role full access to cart_reminders"
  ON public.cart_reminders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Storefront Site Visits & Product View / Inspection Analytics
CREATE TABLE IF NOT EXISTS public.site_visits (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  path TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  country TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS visitor_id TEXT NOT NULL DEFAULT 'anon',
  ADD COLUMN IF NOT EXISTS session_key TEXT NOT NULL DEFAULT 'anon',
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS path TEXT NOT NULL DEFAULT '/',
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT NOT NULL DEFAULT 'desktop',
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_site_visits_created_at
  ON public.site_visits (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_visits_visitor_id
  ON public.site_visits (visitor_id);

CREATE INDEX IF NOT EXISTS idx_site_visits_path
  ON public.site_visits (path);

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to site_visits" ON public.site_visits;
CREATE POLICY "Service role full access to site_visits"
  ON public.site_visits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.product_views (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  category TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  image_url TEXT,
  visitor_id TEXT NOT NULL,
  session_key TEXT,
  user_id TEXT,
  user_email TEXT,
  source TEXT NOT NULL DEFAULT 'PRODUCT_PAGE',
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_views
  ADD COLUMN IF NOT EXISTS product_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT 'DriveFlyElectric Rig',
  ADD COLUMN IF NOT EXISTS product_sku TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS visitor_id TEXT NOT NULL DEFAULT 'anon',
  ADD COLUMN IF NOT EXISTS session_key TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'PRODUCT_PAGE',
  ADD COLUMN IF NOT EXISTS path TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_product_views_created_at
  ON public.product_views (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_views_product_id
  ON public.product_views (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_views_visitor_id
  ON public.product_views (visitor_id);

ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to product_views" ON public.product_views;
CREATE POLICY "Service role full access to product_views"
  ON public.product_views
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);



