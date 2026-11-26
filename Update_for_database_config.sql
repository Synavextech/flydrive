-- ============================================================================
-- DriveFlyElectric.shop (EurotopAerospace) - Idempotent Supabase PostgreSQL Update
-- Features:
--   1. Orders & Products column updates (delivered_at, wallet_amount_used, WALLET methods)
--   2. Persistent User-Linked LiveChat (support_sessions & support_messages)
--   3. Customer Wallet & Atomic Ledger (wallets, wallet_transactions & apply_wallet_transaction RPC)
--   4. 21-Day Return Policy, Same-Day Instant Wallet Refund & Equal/Close-Value Exchange (return_requests)
--   5. Automatic delivered_at / updated_at triggers, RLS security & PostgREST schema reload
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Orders & Products Column Updates + Payment Method Constraints
-- ----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coming_soon_release TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_token TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wallet_amount_used NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Backfill delivered_at on historical DELIVERED orders so the 21-day window
-- can be evaluated accurately without losing eligibility tracking.
UPDATE public.orders
   SET delivered_at = COALESCE(updated_at, created_at, NOW())
 WHERE status::text = 'DELIVERED'
   AND delivered_at IS NULL;

-- Ensure orders.payment_method permits WALLET and split WALLET + gateway modes
-- regardless of whether payment_method is an ENUM or TEXT + CHECK constraint.
DO $orders_pm$
DECLARE
  v_data_type TEXT;
  v_udt_schema TEXT;
  v_udt_name TEXT;
  v_con RECORD;
BEGIN
  SELECT data_type, udt_schema, udt_name
    INTO v_data_type, v_udt_schema, v_udt_name
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'orders'
     AND column_name = 'payment_method'
   LIMIT 1;

  IF v_data_type = 'USER-DEFINED' AND v_udt_name IS NOT NULL THEN
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_udt_schema, v_udt_name, 'WALLET');
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_udt_schema, v_udt_name, 'WALLET_STRIPE');
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_udt_schema, v_udt_name, 'WALLET_PAYPAL');
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_udt_schema, v_udt_name, 'BANK_DEPOSIT');
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_udt_schema, v_udt_name, 'CRYPTO');
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_udt_schema, v_udt_name, 'INVOICE');
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_udt_schema, v_udt_name, 'CHEQUE');
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_udt_schema, v_udt_name, 'CUSTOM');
  ELSIF v_data_type IS NOT NULL THEN
    FOR v_con IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname = 'public'
         AND rel.relname = 'orders'
         AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) ILIKE '%payment_method%'
    LOOP
      EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;

    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN (
        'STRIPE', 'PAYPAL', 'WALLET', 'WALLET_STRIPE', 'WALLET_PAYPAL',
        'BANK_DEPOSIT', 'CRYPTO', 'INVOICE', 'CHEQUE', 'CUSTOM'
      )) NOT VALID;
  END IF;
END
$orders_pm$;

-- Trigger function to automatically stamp delivered_at once an order transitions to DELIVERED
CREATE OR REPLACE FUNCTION public.set_order_delivered_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status::text = 'DELIVERED' AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_delivered_at ON public.orders;
CREATE TRIGGER trg_orders_set_delivered_at
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_delivered_at();

-- Generic updated_at maintenance trigger helper
CREATE OR REPLACE FUNCTION public.set_row_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Support Sessions, Wallets, Wallet Transactions & Return Requests
--    Dynamically matches existing users(id), orders(id), and products(id) types
--    (UUID vs TEXT) so foreign keys succeed cleanly on all deployments.
-- ----------------------------------------------------------------------------
DO $schema_setup$
DECLARE
  v_user_id_type TEXT := 'TEXT';
  v_order_id_type TEXT := 'TEXT';
  v_product_id_type TEXT := 'TEXT';
  v_user_cast TEXT;
  v_order_cast TEXT;
  v_actor_cast TEXT;
  v_con RECORD;
BEGIN
  SELECT CASE WHEN udt_name = 'uuid' THEN 'UUID' ELSE 'TEXT' END
    INTO v_user_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
   LIMIT 1;
  v_user_id_type := COALESCE(v_user_id_type, 'TEXT');

  SELECT CASE WHEN udt_name = 'uuid' THEN 'UUID' ELSE 'TEXT' END
    INTO v_order_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'id'
   LIMIT 1;
  v_order_id_type := COALESCE(v_order_id_type, 'TEXT');

  SELECT CASE WHEN udt_name = 'uuid' THEN 'UUID' ELSE 'TEXT' END
    INTO v_product_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'id'
   LIMIT 1;
  v_product_id_type := COALESCE(v_product_id_type, 'TEXT');

  -- --------------------------------------------------------------------------
  -- 2A. support_sessions & support_messages (Persistent User-Linked LiveChat)
  -- --------------------------------------------------------------------------
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.support_sessions (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      user_id %1$s CONSTRAINT support_sessions_user_id_fkey REFERENCES public.users(id) ON DELETE SET NULL,
      visitor_name TEXT NOT NULL DEFAULT 'Customer',
      visitor_email TEXT,
      visitor_phone TEXT,
      topic TEXT NOT NULL DEFAULT 'General Inquiry',
      selected_products JSONB NOT NULL DEFAULT '[]'::jsonb,
      active_order_id %2$s CONSTRAINT support_sessions_active_order_id_fkey REFERENCES public.orders(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
      is_online BOOLEAN NOT NULL DEFAULT false,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      unread_admin_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_admin_count >= 0),
      unread_client_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_client_count >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  $sql$, v_user_id_type, v_order_id_type);

  -- Upgrade pre-existing support_sessions safely
  EXECUTE format('ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS user_id %s', v_user_id_type);
  EXECUTE format('ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS active_order_id %s', v_order_id_type);
  ALTER TABLE public.support_sessions
    ADD COLUMN IF NOT EXISTS visitor_id TEXT,
    ADD COLUMN IF NOT EXISTS visitor_name TEXT NOT NULL DEFAULT 'Customer',
    ADD COLUMN IF NOT EXISTS visitor_email TEXT,
    ADD COLUMN IF NOT EXISTS visitor_phone TEXT,
    ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'General Inquiry',
    ADD COLUMN IF NOT EXISTS selected_products JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS unread_admin_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unread_client_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ALTER TABLE public.support_sessions ALTER COLUMN visitor_email DROP NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_support_sessions_user_updated
    ON public.support_sessions (user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_sessions_status_updated
    ON public.support_sessions (status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_sessions_email_lower
    ON public.support_sessions (LOWER(visitor_email));

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.support_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES public.support_sessions(id) ON DELETE CASCADE,
      sender_user_id %1$s REFERENCES public.users(id) ON DELETE SET NULL,
      sender_role TEXT NOT NULL DEFAULT 'CLIENT',
      sender_name TEXT NOT NULL DEFAULT 'Customer',
      content TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  $sql$, v_user_id_type);

  EXECUTE format('ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS sender_user_id %s', v_user_id_type);
  ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS sender_role TEXT NOT NULL DEFAULT 'CLIENT',
    ADD COLUMN IF NOT EXISTS sender_name TEXT NOT NULL DEFAULT 'Customer',
    ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

  FOR v_con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = 'public'
       AND rel.relname = 'support_messages'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%sender_role%'
  LOOP
    EXECUTE format('ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;

  -- Restrict new writes strictly to human/system messages (disallowing synthetic AI_ASSISTANT auto-replies)
  ALTER TABLE public.support_messages
    ADD CONSTRAINT support_messages_sender_role_check
    CHECK (sender_role IN ('CLIENT', 'ADMIN', 'SYSTEM')) NOT VALID;

  -- Ensure support_sessions.id, support_messages.id, and support_messages.session_id are TEXT
  -- (prevents UUID syntax errors on chat_<uuid> / msg_<uuid> IDs if tables were pre-created as UUID)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'id' AND udt_name = 'uuid'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'id' AND udt_name = 'uuid'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'support_messages' AND column_name = 'session_id' AND udt_name = 'uuid'
  ) THEN
    FOR v_con IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname = 'public'
         AND rel.relname = 'support_messages'
         AND c.contype = 'f'
    LOOP
      EXECUTE format('ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;

    ALTER TABLE public.support_messages ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE public.support_messages ALTER COLUMN session_id TYPE TEXT USING session_id::text;
    ALTER TABLE public.support_sessions ALTER COLUMN id TYPE TEXT USING id::text;

    ALTER TABLE public.support_messages
      ADD CONSTRAINT support_messages_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.support_sessions(id) ON DELETE CASCADE NOT VALID;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_support_messages_session_created
    ON public.support_messages (session_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_support_messages_sender_user
    ON public.support_messages (sender_user_id);

  -- --------------------------------------------------------------------------
  -- 2B. wallets
  -- --------------------------------------------------------------------------
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.wallets (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id %1$s NOT NULL UNIQUE CONSTRAINT wallets_user_id_fkey REFERENCES public.users(id) ON DELETE CASCADE,
      balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  $sql$, v_user_id_type);

  CREATE INDEX IF NOT EXISTS idx_wallets_user_id
    ON public.wallets (user_id);

  -- --------------------------------------------------------------------------
  -- 2C. wallet_transactions (Auditable Credit/Debit Ledger)
  -- --------------------------------------------------------------------------
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.wallet_transactions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      wallet_id TEXT NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
      user_id %1$s NOT NULL CONSTRAINT wallet_transactions_user_id_fkey REFERENCES public.users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('REFUND_DEPOSIT', 'CHECKOUT_PAYMENT', 'EXCHANGE_CREDIT', 'ADMIN_ADJUSTMENT')),
      direction TEXT NOT NULL DEFAULT 'CREDIT' CHECK (direction IN ('CREDIT', 'DEBIT')),
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      balance_before NUMERIC(12, 2) NOT NULL CHECK (balance_before >= 0),
      balance_after NUMERIC(12, 2) NOT NULL CHECK (balance_after >= 0),
      order_id %2$s CONSTRAINT wallet_transactions_order_id_fkey REFERENCES public.orders(id) ON DELETE SET NULL,
      return_request_id TEXT,
      reference_id TEXT,
      description TEXT NOT NULL,
      created_by %1$s CONSTRAINT wallet_transactions_created_by_fkey REFERENCES public.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  $sql$, v_user_id_type, v_order_id_type);

  CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_created
    ON public.wallet_transactions (wallet_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created
    ON public.wallet_transactions (user_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_reference_unique
    ON public.wallet_transactions (reference_id)
    WHERE reference_id IS NOT NULL;

  -- --------------------------------------------------------------------------
  -- 2D. return_requests (21-Day Return Policy, Instant Refund & Equal/Close-Value Exchange)
  --     Explicit FK constraint names allow deterministic PostgREST joins cleanly.
  -- --------------------------------------------------------------------------
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.return_requests (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      return_number TEXT NOT NULL UNIQUE,
      order_id %2$s NOT NULL CONSTRAINT return_requests_order_id_fkey REFERENCES public.orders(id) ON DELETE CASCADE,
      user_id %1$s NOT NULL CONSTRAINT return_requests_user_id_fkey REFERENCES public.users(id) ON DELETE CASCADE,
      reason_type TEXT NOT NULL CHECK (reason_type IN ('NOT_AS_ORDERED_REFUND', 'EXCHANGE_EQUAL_VALUE')),
      reason_details TEXT,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      exchange_product_id %3$s CONSTRAINT return_requests_exchange_product_id_fkey REFERENCES public.products(id) ON DELETE SET NULL,
      exchange_order_id %2$s CONSTRAINT return_requests_exchange_order_id_fkey REFERENCES public.orders(id) ON DELETE SET NULL,
      refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
      exchange_price_delta NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (status IN ('PENDING_REVIEW', 'WALLET_CREDITED', 'EXCHANGE_APPROVED', 'COMPLETED', 'REJECTED', 'EXPIRED')),
      wallet_credited BOOLEAN NOT NULL DEFAULT false,
      wallet_transaction_id TEXT REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
      return_tracking_number TEXT,
      eligible_until TIMESTAMPTZ NOT NULL,
      processed_by %1$s CONSTRAINT return_requests_processed_by_fkey REFERENCES public.users(id) ON DELETE SET NULL,
      admin_notes TEXT,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  $sql$, v_user_id_type, v_order_id_type, v_product_id_type);

  ALTER TABLE public.return_requests
    ADD COLUMN IF NOT EXISTS exchange_price_delta NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS return_tracking_number TEXT,
    ADD COLUMN IF NOT EXISTS admin_notes TEXT,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'wallet_transactions_return_request_fk'
  ) THEN
    ALTER TABLE public.wallet_transactions
      ADD CONSTRAINT wallet_transactions_return_request_fk
      FOREIGN KEY (return_request_id)
      REFERENCES public.return_requests(id)
      ON DELETE SET NULL;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_return_requests_user_created
    ON public.return_requests (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_return_requests_order_id
    ON public.return_requests (order_id);
  CREATE INDEX IF NOT EXISTS idx_return_requests_status_created
    ON public.return_requests (status, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_return_requests_active_order_unique
    ON public.return_requests (order_id)
    WHERE status IN ('PENDING_REVIEW', 'WALLET_CREDITED', 'EXCHANGE_APPROVED', 'COMPLETED');

  -- --------------------------------------------------------------------------
  -- 2E. Atomic Wallet Transaction RPC (Concurrency-safe FOR UPDATE + Idempotency)
  -- --------------------------------------------------------------------------
  v_user_cast  := CASE WHEN v_user_id_type  = 'UUID' THEN 'TRIM(p_user_id)::uuid' ELSE 'TRIM(p_user_id)' END;
  v_order_cast := CASE WHEN v_order_id_type = 'UUID' THEN 'NULLIF(TRIM(COALESCE(p_order_id, '''')), '''')::uuid' ELSE 'NULLIF(TRIM(COALESCE(p_order_id, '''')), '''')' END;
  v_actor_cast := CASE WHEN v_user_id_type  = 'UUID' THEN 'NULLIF(TRIM(COALESCE(p_created_by, '''')), '''')::uuid' ELSE 'NULLIF(TRIM(COALESCE(p_created_by, '''')), '''')' END;

  EXECUTE format($fn$
    CREATE OR REPLACE FUNCTION public.apply_wallet_transaction(
      p_user_id TEXT,
      p_type TEXT,
      p_direction TEXT,
      p_amount NUMERIC,
      p_description TEXT,
      p_order_id TEXT DEFAULT NULL,
      p_return_request_id TEXT DEFAULT NULL,
      p_reference_id TEXT DEFAULT NULL,
      p_created_by TEXT DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      v_wallet_id TEXT;
      v_balance_before NUMERIC(12, 2);
      v_balance_after NUMERIC(12, 2);
      v_currency TEXT;
      v_clean_amount NUMERIC(12, 2);
      v_ref TEXT;
      v_existing_tx RECORD;
      v_tx_id TEXT;
    BEGIN
      IF p_user_id IS NULL OR LENGTH(TRIM(p_user_id)) = 0 THEN
        RAISE EXCEPTION 'USER_ID_REQUIRED';
      END IF;

      v_clean_amount := ROUND(COALESCE(p_amount, 0), 2);
      IF v_clean_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_WALLET_AMOUNT';
      END IF;

      IF p_direction NOT IN ('CREDIT', 'DEBIT') THEN
        RAISE EXCEPTION 'INVALID_WALLET_DIRECTION';
      END IF;

      IF p_type NOT IN ('REFUND_DEPOSIT', 'CHECKOUT_PAYMENT', 'EXCHANGE_CREDIT', 'ADMIN_ADJUSTMENT') THEN
        RAISE EXCEPTION 'INVALID_WALLET_TX_TYPE';
      END IF;

      v_ref := NULLIF(TRIM(COALESCE(p_reference_id, '')), '');

      INSERT INTO public.wallets (user_id, balance, currency)
      VALUES (%1$s, 0, 'USD')
      ON CONFLICT (user_id) DO NOTHING;

      SELECT w.id, w.balance, w.currency
        INTO v_wallet_id, v_balance_before, v_currency
        FROM public.wallets w
       WHERE w.user_id = %1$s
       FOR UPDATE;

      IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND';
      END IF;

      IF v_ref IS NOT NULL THEN
        SELECT id, balance_before, balance_after
          INTO v_existing_tx
          FROM public.wallet_transactions
         WHERE reference_id = v_ref
         LIMIT 1;

        IF FOUND THEN
          RETURN jsonb_build_object(
            'walletId', v_wallet_id,
            'currency', v_currency,
            'balance', v_balance_before,
            'balanceBefore', v_existing_tx.balance_before,
            'balanceAfter', v_existing_tx.balance_after,
            'transactionId', v_existing_tx.id,
            'idempotent', true
          );
        END IF;
      END IF;

      IF p_direction = 'CREDIT' THEN
        v_balance_after := ROUND(v_balance_before + v_clean_amount, 2);
      ELSE
        IF v_balance_before < v_clean_amount THEN
          RAISE EXCEPTION 'INSUFFICIENT_WALLET_BALANCE';
        END IF;
        v_balance_after := ROUND(v_balance_before - v_clean_amount, 2);
      END IF;

      UPDATE public.wallets
         SET balance = v_balance_after,
             updated_at = NOW()
       WHERE id = v_wallet_id;

      v_tx_id := gen_random_uuid()::text;

      INSERT INTO public.wallet_transactions (
        id,
        wallet_id,
        user_id,
        type,
        direction,
        amount,
        balance_before,
        balance_after,
        order_id,
        return_request_id,
        reference_id,
        description,
        created_by,
        created_at
      ) VALUES (
        v_tx_id,
        v_wallet_id,
        %1$s,
        p_type,
        p_direction,
        v_clean_amount,
        v_balance_before,
        v_balance_after,
        %2$s,
        NULLIF(TRIM(COALESCE(p_return_request_id, '')), ''),
        v_ref,
        COALESCE(NULLIF(TRIM(p_description), ''), p_type),
        %3$s,
        NOW()
      );

      RETURN jsonb_build_object(
        'walletId', v_wallet_id,
        'currency', v_currency,
        'balance', v_balance_after,
        'balanceBefore', v_balance_before,
        'balanceAfter', v_balance_after,
        'transactionId', v_tx_id,
        'idempotent', false
      );
    END;
    $body$;
  $fn$, v_user_cast, v_order_cast, v_actor_cast);
END
$schema_setup$;

-- ----------------------------------------------------------------------------
-- 3. Automatic updated_at Triggers on Core New Tables
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_support_sessions_updated_at ON public.support_sessions;
CREATE TRIGGER trg_support_sessions_updated_at
  BEFORE UPDATE ON public.support_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS trg_return_requests_updated_at ON public.return_requests;
CREATE TRIGGER trg_return_requests_updated_at
  BEFORE UPDATE ON public.return_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_row_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Security & RLS Policies (Deny direct anon PostgREST access; allow backend service_role)
-- ----------------------------------------------------------------------------
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.apply_wallet_transaction(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.apply_wallet_transaction(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.apply_wallet_transaction(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.apply_wallet_transaction(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role';
    EXECUTE 'GRANT ALL ON TABLE public.support_sessions, public.support_messages, public.wallets, public.wallet_transactions, public.return_requests TO service_role';
  END IF;
END
$$;

-- Instruct Supabase PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
