-- =============================================================================
-- DriveFlyElectric — Incremental Database Update & Catalog Streamline Script
-- Safe to run on an existing Supabase PostgreSQL instance
-- =============================================================================

-- 1. Ensure RLS Policies on public.events (if not already present)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Events readable by service and admins'
  ) THEN
    CREATE POLICY "Events readable by service and admins" ON public.events FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Events insertable by system'
  ) THEN
    CREATE POLICY "Events insertable by system" ON public.events FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 2. Remove legacy Trendstore / Unsplash mock items if present
DELETE FROM public.products
WHERE id IN ('prod_001', 'prod_002', 'prod_003', 'prod_004', 'prod_005', 'prod_006')
   OR "brand" = 'Trendstore'
   OR array_to_string("images", ',') ILIKE '%unsplash.com%';

-- 3. Normalize existing product brands to DriveFlyElectric
UPDATE public.products
SET "brand" = 'DriveFlyElectric',
    "updatedAt" = NOW()
WHERE "brand" IS NULL
   OR "brand" IN ('Midget Micro Drive & Rides', 'Eurotop', 'Trendstore');

-- 4. Normalize any existing helicopter category labels to 'mini-helicopter'
UPDATE public.products
SET "category" = 'mini-helicopter',
    "updatedAt" = NOW()
WHERE LOWER("category") IN ('minihelicopters', 'minihelicopter', 'mini-helicopters', 'helicopters');

-- 5. Upsert Flagship DriveFlyElectric Fleet Catalog (including MiniHeliCopters)
INSERT INTO public.products (
  "id", "name", "description", "price", "originalPrice", "sku", "stock",
  "images", "category", "brand", "rating", "reviewCount", "isNew", "isActive", "averageDeliveryTime"
)
VALUES
  (
    'dfe_heli_001',
    ' Mosquito-XE Single-Seat Ultralight MiniHelicopter',
    'Personal single-seat coaxial ultralight MiniHelicopter engineered with a carbon-fiber composite airframe, digital flight telemetry display, collective pitch control, and high-efficiency rotor system.',
    9850.00,
    11500.00,
    'DFE-HELI-001',
    4,
    ARRAY['/images/MicroHelicpter.jpeg'],
    'mini-helicopter',
    'DriveFlyElectric',
    5.0,
    19,
    true,
    true,
    '21-35 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)'
  ),
  (
    'dfe_heli_002',
    'AeroVolt X2 Stealth Reconnaissance MiniHelicopter',
    'Compact electric-assist personal MiniHelicopter featuring titanium rotor mast assembly, auto-hover gyroscopic stabilization, panoramic canopy, and rapid-deploy landing skids.',
    12400.00,
    14200.00,
    'DFE-HELI-002',
    3,
    ARRAY['/images/MicroHelicpter.jpeg'],
    'mini-helicopter',
    'DriveFlyElectric',
    4.9,
    14,
    true,
    true,
    '21-35 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)'
  ),
  (
    'dfe_micro_001',
    ' Urban GT Enclosed Electric Microcar',
    'All-weather 2-seater enclosed electric Microcar with digital cockpit display, LED matrix headlights, hydraulic disc brakes, climate cabin fan, and 75 km urban range.',
    3250.00,
    3890.00,
    'DFE-MCAR-001',
    9,
    ARRAY['/images/MicroCCar.jpg', '/images/mercedes1100.mp4'],
    'Microcars',
    'DriveFlyElectric',
    4.9,
    34,
    true,
    true,
    '21-35 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)'
  ),
  (
    'dfe_micro_002',
    'Willys 200cc Adult Mini Jeep Off-Road Microcar',
    'Rugged utility mini Jeep Willys edition featuring reinforced steel chassis, off-road knobby tires, full spare tire mount, auxiliary jerrycan, and dual-seat cockpit.',
    2150.00,
    2590.00,
    'DFE-MCAR-002',
    12,
    ARRAY['/images/jw1501-200cc-adult-mini-jeep-willys.webp', '/images/hero1.jpeg'],
    'Microcars',
    'DriveFlyElectric',
    4.8,
    41,
    true,
    true,
    '21-35 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)'
  )
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "price" = EXCLUDED."price",
  "originalPrice" = EXCLUDED."originalPrice",
  "sku" = EXCLUDED."sku",
  "stock" = EXCLUDED."stock",
  "images" = EXCLUDED."images",
  "category" = EXCLUDED."category",
  "brand" = EXCLUDED."brand",
  "isActive" = true,
  "updatedAt" = NOW();

-- 6. Real-Time Support & LiveChat Tables (support_sessions & support_messages)
CREATE TABLE IF NOT EXISTS public.support_sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    visitor_id TEXT NOT NULL,
    user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    visitor_name TEXT DEFAULT 'Store Visitor',
    visitor_email TEXT,
    visitor_phone TEXT,
    topic TEXT DEFAULT 'General Inquiry',
    selected_products JSONB DEFAULT '[]'::jsonb,
    status TEXT CHECK (status IN ('OPEN', 'RESOLVED')) DEFAULT 'OPEN',
    is_online BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    unread_admin_count INTEGER DEFAULT 0,
    unread_client_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id TEXT REFERENCES public.support_sessions(id) ON DELETE CASCADE,
    sender_role TEXT CHECK (sender_role IN ('CLIENT', 'ADMIN', 'AI_ASSISTANT')) NOT NULL,
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_sessions_visitor_id ON public.support_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_support_sessions_updated_at ON public.support_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_session_id ON public.support_messages(session_id);

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Support sessions accessible to service and clients" ON public.support_sessions;
CREATE POLICY "Support sessions accessible to service and clients" ON public.support_sessions
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Support messages accessible to service and clients" ON public.support_messages;
CREATE POLICY "Support messages accessible to service and clients" ON public.support_messages
    FOR ALL USING (true) WITH CHECK (true);

-- 7. Order Tracking Number Support on public.orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tracking_number'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN tracking_number TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON public.orders(tracking_number);

-- Backfill any existing orders missing a tracking_number
UPDATE public.orders
SET tracking_number = 'TRK-' || order_number
WHERE tracking_number IS NULL AND order_number IS NOT NULL;

-- 8. Product Reviews Table (with multi-image upload array support)
CREATE TABLE IF NOT EXISTS public.product_reviews (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    reviewer_name TEXT NOT NULL,
    reviewer_email TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL DEFAULT 5,
    title TEXT,
    comment TEXT NOT NULL,
    images TEXT[] DEFAULT '{}',
    verified_purchase BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created_at ON public.product_reviews(created_at DESC);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view product reviews" ON public.product_reviews;
CREATE POLICY "Public can view product reviews" ON public.product_reviews
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can submit product reviews" ON public.product_reviews;
CREATE POLICY "Anyone can submit product reviews" ON public.product_reviews
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage product reviews" ON public.product_reviews;
CREATE POLICY "Admins can manage product reviews" ON public.product_reviews
    FOR ALL USING (true) WITH CHECK (true);


