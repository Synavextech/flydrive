-- =====================================================
-- DriveFlyElectric - Supabase Database Configuration & Migration Script
-- Production-Ready Schema with Full RLS & USD Store Catalog
-- Official Domain: https://driveflyelectric.shop
-- =====================================================
-- Safe to execute directly in the Supabase SQL Editor.

-- Enable cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. PRODUCTION TABLES CREATION
-- =====================================================

-- Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    role TEXT CHECK (role IN ('CUSTOMER', 'ADMIN')) DEFAULT 'CUSTOMER',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    sku TEXT UNIQUE NOT NULL,
    stock INTEGER DEFAULT 0,
    images TEXT[] DEFAULT '{}',
    category TEXT NOT NULL,
    brand TEXT,
    is_active BOOLEAN DEFAULT true,
    is_new BOOLEAN DEFAULT false,
    shipping_required BOOLEAN DEFAULT true,
    average_delivery_time TEXT DEFAULT '2-4 business days',
    weight DECIMAL(8,2),
    dimensions TEXT,
    rating DECIMAL(3,2) DEFAULT 4.90,
    reviews INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Variants Table (colors, power modes, battery sizes)
CREATE TABLE IF NOT EXISTS public.product_variants (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    price DECIMAL(10,2) DEFAULT 0,
    UNIQUE(product_id, name, value)
);

-- Shopping Carts Table
CREATE TABLE IF NOT EXISTS public.carts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cart Items Table
CREATE TABLE IF NOT EXISTS public.cart_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    cart_id TEXT REFERENCES public.carts(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    UNIQUE(cart_id, product_id)
);

-- Addresses Table (shipping and billing)
CREATE TABLE IF NOT EXISTS public.addresses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('SHIPPING', 'BILLING')) NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    company TEXT,
    address1 TEXT NOT NULL,
    address2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'United States',
    phone TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    order_number TEXT UNIQUE NOT NULL,
    status TEXT CHECK (status IN ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED')) DEFAULT 'PENDING',
    total DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    tax DECIMAL(10,2) DEFAULT 0,
    shipping DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    payment_method TEXT CHECK (payment_method IN ('STRIPE', 'PAYPAL')) NOT NULL,
    payment_status TEXT CHECK (payment_status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')) DEFAULT 'PENDING',
    payment_id TEXT,
    shipping_address_id TEXT REFERENCES public.addresses(id),
    billing_address_id TEXT REFERENCES public.addresses(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order Items Table
CREATE TABLE IF NOT EXISTS public.order_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL
);

-- Events Table
CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    time TEXT,
    location TEXT,
    category TEXT DEFAULT 'general',
    status TEXT CHECK (status IN ('upcoming', 'past', 'cancelled')) DEFAULT 'upcoming',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. ENSURE MISSING COLUMNS (Idempotent updates)
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'original_price') THEN
        ALTER TABLE public.products ADD COLUMN original_price DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'rating') THEN
        ALTER TABLE public.products ADD COLUMN rating DECIMAL(3,2) DEFAULT 4.90;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'reviews') THEN
        ALTER TABLE public.products ADD COLUMN reviews INTEGER DEFAULT 0;
    END IF;
END $$;

-- =====================================================
-- 3. HIGH-PERFORMANCE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_type ON public.addresses(type);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Events: Public read, Admins manage
DROP POLICY IF EXISTS "Public can view events" ON public.events;
CREATE POLICY "Public can view events" ON public.events
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
CREATE POLICY "Admins can manage events" ON public.events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()::text AND role = 'ADMIN'
        )
    );

-- Products: Public read active items, Admins manage all
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()::text AND role = 'ADMIN'
        )
    );

-- Product Variants: Public read, Admins manage
DROP POLICY IF EXISTS "Public can view product variants" ON public.product_variants;
CREATE POLICY "Public can view product variants" ON public.product_variants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product variants" ON public.product_variants;
CREATE POLICY "Admins can manage product variants" ON public.product_variants
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()::text AND role = 'ADMIN'
        )
    );

-- Users: Users can read/update their own profile, Admins full access
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (
        auth.uid()::text = id OR EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'ADMIN'
        )
    );

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (
        auth.uid()::text = id OR EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'ADMIN'
        )
    );

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile" ON public.users
    FOR INSERT WITH CHECK (true);

-- Carts: Users manage their own cart
DROP POLICY IF EXISTS "Users can manage their own cart" ON public.carts;
CREATE POLICY "Users can manage their own cart" ON public.carts
    FOR ALL USING (auth.uid()::text = user_id);

-- Cart Items: Users manage their own cart items
DROP POLICY IF EXISTS "Users can manage their own cart items" ON public.cart_items;
CREATE POLICY "Users can manage their own cart items" ON public.cart_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.carts
            WHERE id = cart_id AND user_id = auth.uid()::text
        )
    );

-- Addresses: Users manage their own addresses
DROP POLICY IF EXISTS "Users can manage their own addresses" ON public.addresses;
CREATE POLICY "Users can manage their own addresses" ON public.addresses
    FOR ALL USING (auth.uid()::text = user_id);

-- Orders: Users view/create their orders, Admins manage all
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders
    FOR SELECT USING (
        auth.uid()::text = user_id OR EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'ADMIN'
        )
    );

DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders" ON public.orders
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
CREATE POLICY "Admins can manage all orders" ON public.orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'ADMIN'
        )
    );

-- Order Items
DROP POLICY IF EXISTS "Users can view their own order items" ON public.order_items;
CREATE POLICY "Users can view their own order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE id = order_id AND (user_id = auth.uid()::text OR EXISTS (
                SELECT 1 FROM public.users WHERE id = auth.uid()::text AND role = 'ADMIN'
            ))
        )
    );

-- =====================================================
-- 5. AUTOMATED TIMESTAMP & TRIGGER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_carts_updated_at ON public.carts;
CREATE TRIGGER update_carts_updated_at BEFORE UPDATE ON public.carts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_addresses_updated_at ON public.addresses;
CREATE TRIGGER update_addresses_updated_at BEFORE UPDATE ON public.addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. PRODUCTION SEED DATA (DRIVEFLYELECTRIC USD CATALOG)
-- =====================================================

-- Admin User (configured via .env / create-admin.js)
INSERT INTO public.users (id, email, password, first_name, last_name, role, is_active)
VALUES (
    'admin_driveflyelectric_001',
    'jame@eurotopagent.eurotopmobility.shop',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'DriveFlyElectric',
    'Admin',
    'ADMIN',
    true
)
ON CONFLICT (email) DO UPDATE SET
    role = 'ADMIN',
    is_active = true,
    updated_at = NOW();

-- Remove any legacy mock/Unsplash placeholder products
DELETE FROM public.products
WHERE id IN ('prod_001', 'prod_002', 'prod_003', 'prod_004', 'prod_005', 'prod_006')
   OR array_to_string(images, ',') LIKE '%unsplash.com%';

-- Curated USD DriveFlyElectric Fleet: MiniHeliCopters, Microcars, Go Karts, Trikes & Dirtbikes
INSERT INTO public.products (
    id, name, description, price, original_price, sku, stock, category, brand, images, is_active, is_new, rating, reviews, shipping_required, average_delivery_time, weight, dimensions
)
VALUES
    (
        'dfe_heli_001',
        'AeroVolt X1 Personal Electric MiniHeliCopter',
        'Single-seat ultralight electric rotorcraft with coaxial brushless turbine propulsion, carbon-kevlar airframe, digital flight stabilization, auto-hover avionics, and ballistic recovery parachute.',
        4800.00,
        5600.00,
        'DFE-HELI-X1',
        8,
        'mini-helicopter',
        'DriveFlyElectric',
        ARRAY['/images/MicroHelicpter.jpeg'],
        true,
        true,
        4.98,
        42,
        true,
        '14-21 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
        115.0,
        '420x165x215 cm'
    ),
    (
        'dfe_heli_002',
        'SkyPulse Twin-Rotor Ultralight MiniHeliCopter',
        'High-endurance compact personal mini-helicopter featuring redundant lithium-aviation battery packs, glass cockpit telemetry display, GPS return-to-home assist, and all-weather composite rotor blades.',
        6200.00,
        7200.00,
        'DFE-HELI-PRO2',
        5,
        'mini-helicopter',
        'DriveFlyElectric',
        ARRAY['/images/MicroHelicpter.jpeg'],
        true,
        true,
        4.99,
        29,
        true,
        '14-21 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
        132.0,
        '445x175x225 cm'
    ),
    (
        'dfe_micro_001',
        'UrbanPulse GT Enclosed Electric Microcar',
        'All-weather 2-seater enclosed electric microcar with panoramic glass cabin, 72V lithium battery pack, hydraulic disc brakes, LED matrix lighting, backup camera, and digital infotainment display.',
        1100.00,
        1450.00,
        'DFE-MICRO-EV1',
        14,
        'Microcars',
        'DriveFlyElectric',
        ARRAY['/images/MicroCCar.jpg', '/images/mercedes1100.mp4'],
        true,
        true,
        4.95,
        68,
        true,
        '12-20 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
        320.0,
        '225x118x152 cm'
    ),
    (
        'dfe_micro_002',
        'JW1501 200cc Adult Mini Jeep Willys Off-Road',
        'Rugged military-inspired adult mini Jeep Willys with reinforced steel chassis, front and rear independent suspension, hydraulic disc braking, spare wheel mount, and LED off-road floodlights.',
        850.00,
        1100.00,
        'DFE-JEEP-JW1501',
        16,
        'Microcars',
        'DriveFlyElectric',
        ARRAY['/images/jw1501-200cc-adult-mini-jeep-willys.webp'],
        true,
        true,
        4.94,
        54,
        true,
        '12-20 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
        210.0,
        '210x110x120 cm'
    ),
    (
        'dfe_kart_001',
        'GC2009 Pro Off-Road Racing Go Kart',
        'Full-roll-cage off-road racing buggy go kart with long-travel hydraulic coilover shocks, bucket racing seats with 4-point harness, and high-torque drivetrain.',
        1200.00,
        1499.00,
        'DFE-KART-GC2009',
        15,
        'Go karts',
        'DriveFlyElectric',
        ARRAY['/images/GC2009 Off-Road Go Kart - $1200.webp', '/images/GC2009 Off-Road Go Kart 2 - $1200.webp'],
        true,
        true,
        4.96,
        77,
        true,
        '12-20 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
        185.0,
        '215x135x140 cm'
    ),
    (
        'dfe_kart_002',
        '200cc 4-Seater Heavy-Duty Off-Road Go Kart Buggy',
        'Family and adventure 4-seater off-road go kart buggy engineered with heavy-duty tubular steel roll cage, dual hydraulic disc brakes, and all-terrain knobby tires.',
        550.00,
        750.00,
        'DFE-KART-4SEAT',
        19,
        'Go karts',
        'DriveFlyElectric',
        ARRAY['/images/200cc 4-Seater Off-Road Go Kart 1 - $550.webp', '/images/200cc 4-Seater Off-Road Go Kart 3 - $550.webp.webp'],
        true,
        false,
        4.92,
        61,
        true,
        '12-20 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
        230.0,
        '260x140x148 cm'
    ),
    (
        'dfe_trike_001',
        'Apex 3000W Electric Drift Trike Pro',
        'High-torque 3000W brushless hub motor drift trike with replaceable rear drift sleeves, chromoly drift frame, hydraulic front disc brake, and digital voltage telemetry.',
        399.00,
        499.00,
        'DFE-TRIKE-3000W',
        25,
        'trikes',
        'DriveFlyElectric',
        ARRAY['/images/3000w-electric-drift-trike.webp', '/images/mm1.webp', '/images/mm2.webp'],
        true,
        true,
        4.95,
        89,
        true,
        '12-20 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
        38.5,
        '140x95x65 cm'
    ),
    (
        'dfe_bike_001',
        'Stealth 6000W 72V Off-Road Electric Dirt Bike',
        'High-output 6000W electric enduro dirt bike with inverted hydraulic front forks, multi-link rear monoshock, forged alloy rims, and high-discharge 72V lithium battery.',
        280.00,
        390.00,
        'DFE-BIKE-6000W',
        22,
        'Dirtbikes',
        'DriveFlyElectric',
        ARRAY['/images/6000w-electric-dirt-bike.webp', '/images/b5 - $280.webp'],
        true,
        true,
        4.93,
        72,
        true,
        '12-20 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
        58.0,
        '185x78x105 cm'
    )
ON CONFLICT (sku) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
    stock = EXCLUDED.stock,
    category = EXCLUDED.category,
    brand = EXCLUDED.brand,
    images = EXCLUDED.images,
    is_active = true,
    updated_at = NOW();

-- =====================================================
-- 7. PERMISSIONS & CONFIRMATION
-- =====================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

DO $$
BEGIN
    RAISE NOTICE 'DriveFlyElectric USD database configuration applied successfully!';
    RAISE NOTICE 'Tables active: users, products, product_variants, carts, cart_items, addresses, orders, order_items, events';
    RAISE NOTICE 'Categories active: mini-helicopter, Microcars, Go karts, trikes, Dirtbikes';
    RAISE NOTICE 'Store Currency: USD ($)';
END $$;
