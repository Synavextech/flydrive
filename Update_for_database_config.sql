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

