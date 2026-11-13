-- =====================================================
-- DriveFlyElectric - Supabase Database Configuration & Migration Script
-- Production-Ready Schema with Full RLS & USD Store Catalog
-- Official Domain: https://driveflyelectric.shop
-- =====================================================
-- Safe to execute directly in the Supabase SQL Editor (fresh or existing DB).

-- Enable cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. PRODUCTION TABLES CREATION (Topologically ordered)
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
    is_coming_soon BOOLEAN DEFAULT false,
    coming_soon_release TEXT,
    shipping_required BOOLEAN DEFAULT true,
    average_delivery_time TEXT DEFAULT '12-20 business days',
    weight DECIMAL(8,2),
    dimensions TEXT,
    rating DECIMAL(3,2) DEFAULT 0,
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

-- Orders Table (user_id nullable for verified guest checkouts)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    order_number TEXT UNIQUE NOT NULL,
    tracking_number TEXT UNIQUE,
    status TEXT CHECK (status IN ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED')) DEFAULT 'PENDING',
    total DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    tax DECIMAL(10,2) DEFAULT 0,
    shipping DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    payment_method TEXT CHECK (payment_method IN ('STRIPE', 'PAYPAL')) NOT NULL,
    payment_status TEXT CHECK (payment_status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')) DEFAULT 'PENDING',
    payment_verified BOOLEAN DEFAULT false,
    payment_id TEXT,
    receipt_token TEXT,
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

-- Product Reviews Table (Customer Reviews with Image Upload Support)
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

-- Product Pre-Bookings Table ("Book Now" for Coming Soon Vehicles)
CREATE TABLE IF NOT EXISTS public.product_bookings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    country TEXT DEFAULT 'United States',
    quantity INTEGER CHECK (quantity >= 1 AND quantity <= 50) DEFAULT 1,
    notes TEXT,
    status TEXT CHECK (status IN ('PENDING', 'CONFIRMED', 'NOTIFIED', 'CANCELLED')) DEFAULT 'PENDING',
    booking_reference TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
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

-- Support Sessions Table (Real-Time LiveChat & Presence Tracking)
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

-- Support Messages Table (Client, Intelligent Assistant & Admin Replies)
CREATE TABLE IF NOT EXISTS public.support_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id TEXT REFERENCES public.support_sessions(id) ON DELETE CASCADE,
    sender_role TEXT CHECK (sender_role IN ('CLIENT', 'ADMIN', 'AI_ASSISTANT')) NOT NULL,
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. ENSURE MISSING COLUMNS & LEGACY RENAMES ACROSS ALL TABLES
-- =====================================================

DO $$
BEGIN
    -- [users]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'firstName')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'first_name') THEN
        ALTER TABLE public.users RENAME COLUMN "firstName" TO first_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'lastName')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_name') THEN
        ALTER TABLE public.users RENAME COLUMN "lastName" TO last_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'isActive')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_active') THEN
        ALTER TABLE public.users RENAME COLUMN "isActive" TO is_active;
    END IF;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'CUSTOMER';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [products]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'originalPrice')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'original_price') THEN
        ALTER TABLE public.products RENAME COLUMN "originalPrice" TO original_price;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'isComingSoon')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_coming_soon') THEN
        ALTER TABLE public.products RENAME COLUMN "isComingSoon" TO is_coming_soon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'comingSoonRelease')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'coming_soon_release') THEN
        ALTER TABLE public.products RENAME COLUMN "comingSoonRelease" TO coming_soon_release;
    END IF;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 0;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reviews INTEGER DEFAULT 0;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN DEFAULT false;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coming_soon_release TEXT;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS average_delivery_time TEXT DEFAULT '12-20 business days';
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [product_variants]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'productId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'product_id') THEN
        ALTER TABLE public.product_variants RENAME COLUMN "productId" TO product_id;
    END IF;
    ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS product_id TEXT;

    -- [carts]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'userId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'user_id') THEN
        ALTER TABLE public.carts RENAME COLUMN "userId" TO user_id;
    END IF;
    ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [cart_items]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'cartId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'cart_id') THEN
        ALTER TABLE public.cart_items RENAME COLUMN "cartId" TO cart_id;
    END IF;
    ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS cart_id TEXT;
    ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS product_id TEXT;

    -- [addresses]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'userId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'user_id') THEN
        ALTER TABLE public.addresses RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'postal_code')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'zip_code') THEN
        ALTER TABLE public.addresses RENAME COLUMN postal_code TO zip_code;
    END IF;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United States';
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [orders]
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'user_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
    END IF;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN DEFAULT false;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_id TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_token TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_id TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billing_address_id TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'orders' AND constraint_name = 'orders_shipping_address_id_fkey'
    ) THEN
        BEGIN
            ALTER TABLE public.orders
                ADD CONSTRAINT orders_shipping_address_id_fkey
                FOREIGN KEY (shipping_address_id) REFERENCES public.addresses(id) NOT VALID;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped orders_shipping_address_id_fkey: %', SQLERRM;
        END;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'orders' AND constraint_name = 'orders_billing_address_id_fkey'
    ) THEN
        BEGIN
            ALTER TABLE public.orders
                ADD CONSTRAINT orders_billing_address_id_fkey
                FOREIGN KEY (billing_address_id) REFERENCES public.addresses(id) NOT VALID;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped orders_billing_address_id_fkey: %', SQLERRM;
        END;
    END IF;

    -- [order_items]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'orderId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'order_id') THEN
        ALTER TABLE public.order_items RENAME COLUMN "orderId" TO order_id;
    END IF;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS order_id TEXT;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_id TEXT;

    -- [product_reviews]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'productId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'product_id') THEN
        ALTER TABLE public.product_reviews RENAME COLUMN "productId" TO product_id;
    END IF;
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS product_id TEXT;
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS reviewer_name TEXT DEFAULT 'Verified Customer';
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS reviewer_email TEXT;
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 5;
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS comment TEXT;
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN DEFAULT true;
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [product_bookings]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'productId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'product_id') THEN
        ALTER TABLE public.product_bookings RENAME COLUMN "productId" TO product_id;
    END IF;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS product_id TEXT;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS full_name TEXT;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'United States';
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS booking_reference TEXT;
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.product_bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [events]
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'upcoming';
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [support_sessions]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitorId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitor_id') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "visitorId" TO visitor_id;
    END IF;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS visitor_id TEXT;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS visitor_name TEXT DEFAULT 'Store Visitor';
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS visitor_email TEXT;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS visitor_phone TEXT;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS topic TEXT DEFAULT 'General Inquiry';
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS selected_products JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OPEN';
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT true;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS unread_admin_count INTEGER DEFAULT 0;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS unread_client_count INTEGER DEFAULT 0;
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [support_messages]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'sessionId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'session_id') THEN
        ALTER TABLE public.support_messages RENAME COLUMN "sessionId" TO session_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'support_session_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'session_id') THEN
        ALTER TABLE public.support_messages RENAME COLUMN support_session_id TO session_id;
    END IF;
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS session_id TEXT;
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'CLIENT';
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS sender_name TEXT DEFAULT 'Visitor';
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = 'support_messages'
          AND kcu.column_name = 'session_id'
    ) THEN
        BEGIN
            ALTER TABLE public.support_messages
                ADD CONSTRAINT support_messages_session_id_fkey
                FOREIGN KEY (session_id) REFERENCES public.support_sessions(id) ON DELETE CASCADE NOT VALID;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipped support_messages_session_id_fkey: %', SQLERRM;
        END;
    END IF;
END $$;

UPDATE public.support_sessions SET visitor_id = id WHERE visitor_id IS NULL;
UPDATE public.orders SET tracking_number = 'TRK-' || order_number WHERE tracking_number IS NULL AND order_number IS NOT NULL;
UPDATE public.orders SET payment_id = NULL WHERE payment_id = '';

-- =====================================================
-- 3. HIGH-PERFORMANCE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_coming_soon ON public.products(is_coming_soon);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_type ON public.addresses(type);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON public.orders(tracking_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_id_unique ON public.orders(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created_at ON public.product_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_bookings_product_id ON public.product_bookings(product_id);
CREATE INDEX IF NOT EXISTS idx_product_bookings_email ON public.product_bookings(email);
CREATE INDEX IF NOT EXISTS idx_product_bookings_created_at ON public.product_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_category ON public.events(category);
CREATE INDEX IF NOT EXISTS idx_events_updated_at ON public.events(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_sessions_visitor_id ON public.support_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_support_sessions_updated_at ON public.support_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_session_id ON public.support_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON public.support_messages(created_at ASC);

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
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Service-role only policies for PII/transactional/API-guarded tables (backend enforces JWT, RBAC & Zod validation)
DROP POLICY IF EXISTS "Public can view product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Anyone can submit product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Admins can manage product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Service role manages product reviews" ON public.product_reviews;
CREATE POLICY "Service role manages product reviews" ON public.product_reviews
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages product bookings" ON public.product_bookings;
CREATE POLICY "Service role manages product bookings" ON public.product_bookings
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Support sessions accessible to service and clients" ON public.support_sessions;
DROP POLICY IF EXISTS "Service role manages support sessions" ON public.support_sessions;
CREATE POLICY "Service role manages support sessions" ON public.support_sessions
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Support messages accessible to service and clients" ON public.support_messages;
DROP POLICY IF EXISTS "Service role manages support messages" ON public.support_messages;
CREATE POLICY "Service role manages support messages" ON public.support_messages
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Events: Service-role manages backend events; no raw anon exposure of review/chat records
DROP POLICY IF EXISTS "Events readable by service and admins" ON public.events;
DROP POLICY IF EXISTS "Events insertable by system" ON public.events;
DROP POLICY IF EXISTS "Public can view events" ON public.events;
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
DROP POLICY IF EXISTS "Service role manages events" ON public.events;
CREATE POLICY "Service role manages events" ON public.events
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Products: Public read active items, Service-role/Admins manage all
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Product Variants: Public read, Service-role manages
DROP POLICY IF EXISTS "Public can view product variants" ON public.product_variants;
CREATE POLICY "Public can view product variants" ON public.product_variants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product variants" ON public.product_variants;
CREATE POLICY "Admins can manage product variants" ON public.product_variants
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Users, Carts, Addresses, Orders & Order Items: Service-role guarded via Express JWT & ownership checks
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Service role manages users" ON public.users;
CREATE POLICY "Service role manages users" ON public.users
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage their own cart" ON public.carts;
DROP POLICY IF EXISTS "Service role manages carts" ON public.carts;
CREATE POLICY "Service role manages carts" ON public.carts
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage their own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Service role manages cart items" ON public.cart_items;
CREATE POLICY "Service role manages cart items" ON public.cart_items
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage their own addresses" ON public.addresses;
DROP POLICY IF EXISTS "Service role manages addresses" ON public.addresses;
CREATE POLICY "Service role manages addresses" ON public.addresses
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Service role manages orders" ON public.orders;
CREATE POLICY "Service role manages orders" ON public.orders
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view their own order items" ON public.order_items;
DROP POLICY IF EXISTS "Service role manages order items" ON public.order_items;
CREATE POLICY "Service role manages order items" ON public.order_items
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

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

DROP TRIGGER IF EXISTS update_product_reviews_updated_at ON public.product_reviews;
CREATE TRIGGER update_product_reviews_updated_at BEFORE UPDATE ON public.product_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_bookings_updated_at ON public.product_bookings;
CREATE TRIGGER update_product_bookings_updated_at BEFORE UPDATE ON public.product_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_support_sessions_updated_at ON public.support_sessions;
CREATE TRIGGER update_support_sessions_updated_at BEFORE UPDATE ON public.support_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. PRODUCTION SEED DATA (DRIVEFLYELECTRIC USD CATALOG)
-- =====================================================

-- Admin User should be provisioned securely via `.env` and `npm run admin:create` (never hardcoded SQL hashes).

-- Remove any legacy mock/Unsplash placeholder products
DELETE FROM public.products
WHERE id IN ('prod_001', 'prod_002', 'prod_003', 'prod_004', 'prod_005', 'prod_006')
   OR brand = 'Trendstore'
   OR array_to_string(images, ',') ILIKE '%unsplash.com%';

-- Clean any legacy warehouse strings on existing records
UPDATE public.products
SET average_delivery_time = REGEXP_REPLACE(
        average_delivery_time,
        '\s*\([^)]*(Shenzhen|China Warehouse)[^)]*\)',
        ' (Global Express Crated Freight)',
        'gi'
    ),
    updated_at = NOW()
WHERE average_delivery_time ~* '(Shenzhen|China Warehouse)';

-- Curated USD DriveFlyElectric Fleet: MiniHeliCopters, Microcars, Go Karts, Trikes & Dirtbikes
INSERT INTO public.products (
    id, name, description, price, original_price, sku, stock, category, brand, images, is_active, is_new, is_coming_soon, coming_soon_release, rating, reviews, shipping_required, average_delivery_time, weight, dimensions
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
        false,
        NULL,
        0.00,
        0,
        true,
        '14-21 business days (Global Express Crated Freight)',
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
        false,
        NULL,
        0.00,
        0,
        true,
        '14-21 business days (Global Express Crated Freight)',
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
        false,
        NULL,
        0.00,
        0,
        true,
        '12-20 business days (Global Express Crated Freight)',
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
        false,
        NULL,
        0.00,
        0,
        true,
        '12-20 business days (Global Express Crated Freight)',
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
        false,
        NULL,
        0.00,
        0,
        true,
        '12-20 business days (Global Express Crated Freight)',
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
        false,
        NULL,
        0.00,
        0,
        true,
        '12-20 business days (Global Express Crated Freight)',
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
        false,
        NULL,
        0.00,
        0,
        true,
        '12-20 business days (Global Express Crated Freight)',
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
        false,
        NULL,
        0.00,
        0,
        true,
        '12-20 business days (Global Express Crated Freight)',
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
    average_delivery_time = EXCLUDED.average_delivery_time,
    is_active = true,
    updated_at = NOW();

-- =====================================================
-- 7. PERMISSIONS, POSTGREST RELOAD & CONFIRMATION
-- =====================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.products, public.product_variants TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE 'DriveFlyElectric hardened USD database configuration applied successfully!';
    RAISE NOTICE 'Tables active: users, products, product_variants, carts, cart_items, addresses, orders, order_items, product_reviews, product_bookings, events, support_sessions, support_messages';
    RAISE NOTICE 'Categories active: mini-helicopter, Microcars, Go karts, trikes, Dirtbikes (+ is_coming_soon pre-booking)';
    RAISE NOTICE 'Store Currency: USD ($)';
END $$;
