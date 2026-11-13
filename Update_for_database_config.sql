-- =============================================================================
-- DriveFlyElectric — Incremental Database Upgrade & Security Hardening Script
-- Safe & idempotent for an existing (or partial) Supabase PostgreSQL database
-- Official Domain: https://driveflyelectric.shop
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ENSURE ALL CORE TABLES EXIST (Topologically ordered)
-- -----------------------------------------------------------------------------

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

CREATE TABLE IF NOT EXISTS public.product_variants (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    price DECIMAL(10,2) DEFAULT 0,
    UNIQUE(product_id, name, value)
);

CREATE TABLE IF NOT EXISTS public.carts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    cart_id TEXT REFERENCES public.carts(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    UNIQUE(cart_id, product_id)
);

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

CREATE TABLE IF NOT EXISTS public.order_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL
);

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

-- -----------------------------------------------------------------------------
-- 2. IDEMPOTENT COLUMN UPGRADES & LEGACY RENAMES ACROSS ALL EXISTING TABLES
--    Runs BEFORE creating indexes so existing pre-migration tables never hit 42703.
-- -----------------------------------------------------------------------------

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
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'created_at') THEN
        ALTER TABLE public.users RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE public.users RENAME COLUMN "updatedAt" TO updated_at;
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
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'isActive')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active') THEN
        ALTER TABLE public.products RENAME COLUMN "isActive" TO is_active;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'isNew')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_new') THEN
        ALTER TABLE public.products RENAME COLUMN "isNew" TO is_new;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'isComingSoon')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_coming_soon') THEN
        ALTER TABLE public.products RENAME COLUMN "isComingSoon" TO is_coming_soon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'comingSoonRelease')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'coming_soon_release') THEN
        ALTER TABLE public.products RENAME COLUMN "comingSoonRelease" TO coming_soon_release;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'shippingRequired')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'shipping_required') THEN
        ALTER TABLE public.products RENAME COLUMN "shippingRequired" TO shipping_required;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'averageDeliveryTime')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'average_delivery_time') THEN
        ALTER TABLE public.products RENAME COLUMN "averageDeliveryTime" TO average_delivery_time;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'created_at') THEN
        ALTER TABLE public.products RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'updated_at') THEN
        ALTER TABLE public.products RENAME COLUMN "updatedAt" TO updated_at;
    END IF;

    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT false;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN DEFAULT false;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coming_soon_release TEXT;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shipping_required BOOLEAN DEFAULT true;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS average_delivery_time TEXT DEFAULT '12-20 business days';
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight DECIMAL(8,2);
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dimensions TEXT;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 0;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reviews INTEGER DEFAULT 0;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [product_variants]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'productId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'product_id') THEN
        ALTER TABLE public.product_variants RENAME COLUMN "productId" TO product_id;
    END IF;
    ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS product_id TEXT;
    ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS value TEXT;
    ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT 0;

    -- [carts]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'userId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'user_id') THEN
        ALTER TABLE public.carts RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'created_at') THEN
        ALTER TABLE public.carts RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'carts' AND column_name = 'updated_at') THEN
        ALTER TABLE public.carts RENAME COLUMN "updatedAt" TO updated_at;
    END IF;
    ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [cart_items]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'cartId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'cart_id') THEN
        ALTER TABLE public.cart_items RENAME COLUMN "cartId" TO cart_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'productId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cart_items' AND column_name = 'product_id') THEN
        ALTER TABLE public.cart_items RENAME COLUMN "productId" TO product_id;
    END IF;
    ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS cart_id TEXT;
    ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS product_id TEXT;
    ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

    -- [addresses]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'userId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'user_id') THEN
        ALTER TABLE public.addresses RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'firstName')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'first_name') THEN
        ALTER TABLE public.addresses RENAME COLUMN "firstName" TO first_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'lastName')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'last_name') THEN
        ALTER TABLE public.addresses RENAME COLUMN "lastName" TO last_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'zipCode')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'zip_code') THEN
        ALTER TABLE public.addresses RENAME COLUMN "zipCode" TO zip_code;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'postal_code')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'zip_code') THEN
        ALTER TABLE public.addresses RENAME COLUMN postal_code TO zip_code;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'isDefault')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'is_default') THEN
        ALTER TABLE public.addresses RENAME COLUMN "isDefault" TO is_default;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'created_at') THEN
        ALTER TABLE public.addresses RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'updated_at') THEN
        ALTER TABLE public.addresses RENAME COLUMN "updatedAt" TO updated_at;
    END IF;

    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS company TEXT;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS address2 TEXT;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS zip_code TEXT;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'United States';
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [orders]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'userId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'user_id') THEN
        ALTER TABLE public.orders RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'orderNumber')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number') THEN
        ALTER TABLE public.orders RENAME COLUMN "orderNumber" TO order_number;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'trackingNumber')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tracking_number') THEN
        ALTER TABLE public.orders RENAME COLUMN "trackingNumber" TO tracking_number;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'paymentMethod')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_method') THEN
        ALTER TABLE public.orders RENAME COLUMN "paymentMethod" TO payment_method;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'paymentStatus')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_status') THEN
        ALTER TABLE public.orders RENAME COLUMN "paymentStatus" TO payment_status;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'paymentVerified')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_verified') THEN
        ALTER TABLE public.orders RENAME COLUMN "paymentVerified" TO payment_verified;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'paymentId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_id') THEN
        ALTER TABLE public.orders RENAME COLUMN "paymentId" TO payment_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'receiptToken')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'receipt_token') THEN
        ALTER TABLE public.orders RENAME COLUMN "receiptToken" TO receipt_token;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shippingAddressId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shipping_address_id') THEN
        ALTER TABLE public.orders RENAME COLUMN "shippingAddressId" TO shipping_address_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'billingAddressId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'billing_address_id') THEN
        ALTER TABLE public.orders RENAME COLUMN "billingAddressId" TO billing_address_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_at') THEN
        ALTER TABLE public.orders RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'updated_at') THEN
        ALTER TABLE public.orders RENAME COLUMN "updatedAt" TO updated_at;
    END IF;

    -- Allow guest checkouts without failing NOT NULL on user_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'user_id' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
    END IF;

    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax DECIMAL(10,2) DEFAULT 0;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping DECIMAL(10,2) DEFAULT 0;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) DEFAULT 0;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING';
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN DEFAULT false;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_id TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_token TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_address_id TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billing_address_id TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Ensure PostgREST named foreign key exists for orders -> addresses join (`orders_shipping_address_id_fkey`)
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
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'productId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'product_id') THEN
        ALTER TABLE public.order_items RENAME COLUMN "productId" TO product_id;
    END IF;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS order_id TEXT;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_id TEXT;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT 0;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS total DECIMAL(10,2) DEFAULT 0;

    -- [product_reviews]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'productId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'product_id') THEN
        ALTER TABLE public.product_reviews RENAME COLUMN "productId" TO product_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'userId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'user_id') THEN
        ALTER TABLE public.product_reviews RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'reviewerName')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'reviewer_name') THEN
        ALTER TABLE public.product_reviews RENAME COLUMN "reviewerName" TO reviewer_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'reviewerEmail')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'reviewer_email') THEN
        ALTER TABLE public.product_reviews RENAME COLUMN "reviewerEmail" TO reviewer_email;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'verifiedPurchase')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'verified_purchase') THEN
        ALTER TABLE public.product_reviews RENAME COLUMN "verifiedPurchase" TO verified_purchase;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'created_at') THEN
        ALTER TABLE public.product_reviews RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_reviews' AND column_name = 'updated_at') THEN
        ALTER TABLE public.product_reviews RENAME COLUMN "updatedAt" TO updated_at;
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
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'userId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'user_id') THEN
        ALTER TABLE public.product_bookings RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'fullName')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'full_name') THEN
        ALTER TABLE public.product_bookings RENAME COLUMN "fullName" TO full_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'bookingReference')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'booking_reference') THEN
        ALTER TABLE public.product_bookings RENAME COLUMN "bookingReference" TO booking_reference;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'created_at') THEN
        ALTER TABLE public.product_bookings RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_bookings' AND column_name = 'updated_at') THEN
        ALTER TABLE public.product_bookings RENAME COLUMN "updatedAt" TO updated_at;
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
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'created_at') THEN
        ALTER TABLE public.events RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'updated_at') THEN
        ALTER TABLE public.events RENAME COLUMN "updatedAt" TO updated_at;
    END IF;
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS time TEXT;
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'upcoming';
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- [support_sessions]
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitorId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitor_id') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "visitorId" TO visitor_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'userId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'user_id') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "userId" TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitorName')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitor_name') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "visitorName" TO visitor_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitorEmail')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitor_email') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "visitorEmail" TO visitor_email;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitorPhone')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'visitor_phone') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "visitorPhone" TO visitor_phone;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'selectedProducts')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'selected_products') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "selectedProducts" TO selected_products;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'isOnline')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'is_online') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "isOnline" TO is_online;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'lastSeenAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'last_seen_at') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "lastSeenAt" TO last_seen_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'unreadAdminCount')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'unread_admin_count') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "unreadAdminCount" TO unread_admin_count;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'unreadClientCount')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'unread_client_count') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "unreadClientCount" TO unread_client_count;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'created_at') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "createdAt" TO created_at;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'updatedAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'updated_at') THEN
        ALTER TABLE public.support_sessions RENAME COLUMN "updatedAt" TO updated_at;
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

    -- [support_messages] (Resolves ERROR 42703: column "session_id" does not exist)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'sessionId')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'session_id') THEN
        ALTER TABLE public.support_messages RENAME COLUMN "sessionId" TO session_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'support_session_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'session_id') THEN
        ALTER TABLE public.support_messages RENAME COLUMN support_session_id TO session_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'chat_session_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'session_id') THEN
        ALTER TABLE public.support_messages RENAME COLUMN chat_session_id TO session_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'ticket_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'session_id') THEN
        ALTER TABLE public.support_messages RENAME COLUMN ticket_id TO session_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'senderRole')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'sender_role') THEN
        ALTER TABLE public.support_messages RENAME COLUMN "senderRole" TO sender_role;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'senderName')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'sender_name') THEN
        ALTER TABLE public.support_messages RENAME COLUMN "senderName" TO sender_name;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'createdAt')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'created_at') THEN
        ALTER TABLE public.support_messages RENAME COLUMN "createdAt" TO created_at;
    END IF;

    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS session_id TEXT;
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'CLIENT';
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS sender_name TEXT DEFAULT 'Visitor';
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

    -- Attach FK constraint for support_messages.session_id safely if absent
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

-- -----------------------------------------------------------------------------
-- 3. DATA CLEANUP, NORMALIZATION & BACKFILLS
-- -----------------------------------------------------------------------------

UPDATE public.support_sessions
SET visitor_id = id
WHERE visitor_id IS NULL;

UPDATE public.orders
SET tracking_number = 'TRK-' || order_number
WHERE tracking_number IS NULL AND order_number IS NOT NULL;

UPDATE public.orders
SET payment_id = NULL
WHERE payment_id = '';

DELETE FROM public.products
WHERE id IN ('prod_001', 'prod_002', 'prod_003', 'prod_004', 'prod_005', 'prod_006')
   OR brand = 'Trendstore'
   OR array_to_string(images, ',') ILIKE '%unsplash.com%';

UPDATE public.products
SET brand = 'DriveFlyElectric',
    updated_at = NOW()
WHERE brand IS NULL
   OR brand IN ('Midget Micro Drive & Rides', 'Eurotop', 'Trendstore');

UPDATE public.products
SET category = 'mini-helicopter',
    updated_at = NOW()
WHERE LOWER(category) IN ('minihelicopters', 'minihelicopter', 'mini-helicopters', 'helicopters');

UPDATE public.products
SET average_delivery_time = REGEXP_REPLACE(
        average_delivery_time,
        '\s*\([^)]*(Shenzhen|China Warehouse)[^)]*\)',
        ' (Global Express Crated Freight)',
        'gi'
    ),
    updated_at = NOW()
WHERE average_delivery_time ~* '(Shenzhen|China Warehouse)';

-- -----------------------------------------------------------------------------
-- 4. HIGH-PERFORMANCE INDEXES & UNIQUENESS CONSTRAINTS
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- 5. AUTOMATED UPDATED_AT TRIGGERS
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- 6. LOCK DOWN RLS & REPLACE PERMISSIVE POLICIES WITH SERVICE-ROLE ISOLATION
-- -----------------------------------------------------------------------------

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

DROP POLICY IF EXISTS "Events readable by service and admins" ON public.events;
DROP POLICY IF EXISTS "Events insertable by system" ON public.events;
DROP POLICY IF EXISTS "Public can view events" ON public.events;
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
DROP POLICY IF EXISTS "Service role manages events" ON public.events;
CREATE POLICY "Service role manages events" ON public.events
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Support sessions accessible to service and clients" ON public.support_sessions;
DROP POLICY IF EXISTS "Service role manages support sessions" ON public.support_sessions;
CREATE POLICY "Service role manages support sessions" ON public.support_sessions
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Support messages accessible to service and clients" ON public.support_messages;
DROP POLICY IF EXISTS "Service role manages support messages" ON public.support_messages;
CREATE POLICY "Service role manages support messages" ON public.support_messages
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Public can view product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Anyone can submit product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Admins can manage product reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Service role manages product reviews" ON public.product_reviews;
CREATE POLICY "Service role manages product reviews" ON public.product_reviews
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages product bookings" ON public.product_bookings;
CREATE POLICY "Service role manages product bookings" ON public.product_bookings
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Public can view product variants" ON public.product_variants;
CREATE POLICY "Public can view product variants" ON public.product_variants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product variants" ON public.product_variants;
CREATE POLICY "Admins can manage product variants" ON public.product_variants
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

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

-- -----------------------------------------------------------------------------
-- 7. REVOKE OVER-PERMISSIVE PUBLIC TABLE GRANTS & RELOAD SCHEMA CACHE
-- -----------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.products, public.product_variants TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
