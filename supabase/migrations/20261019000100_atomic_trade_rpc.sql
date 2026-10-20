-- Atomic BUY/SELL RPC for the confirmed profiles, positions, and transactions tables.
-- Assumptions to verify before applying:
--   * profiles.id, positions.id, transactions.id, and user_id columns are uuid.
--   * profiles.cash_balance, positions.avg_price, transactions.price/total are numeric.
--   * positions.quantity and transactions.quantity accept integer values.
--   * transactions has symbol text, type text, and created_at timestamptz-compatible columns.
-- This migration does not change RLS or alter existing column types/defaults.

-- Snapshot the post-trade balance so an idempotent replay returns the original result.
-- It stays nullable with no default; pre-existing transaction rows have no snapshot.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS cash_balance_after numeric,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS snapshot_portfolio_value_after numeric,
  ADD COLUMN IF NOT EXISTS snapshot_total_value_after numeric,
  ADD COLUMN IF NOT EXISTS snapshot_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS market_prices_after jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_id_idempotency_key_uidx
  ON public.transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The RPC accepts server-fetched prices with their provider trading day. These
-- are the latest available Alpha Vantage trading-day prices; no arbitrary
-- hourly freshness cutoff is imposed (weekends and market holidays are valid).
-- Drop the prior signature so it cannot remain as an alternate execution path.
DROP FUNCTION IF EXISTS public.execute_trade(uuid, text, text, integer, numeric, uuid);

CREATE OR REPLACE FUNCTION public.execute_trade(
  p_user_id uuid,
  p_symbol text,
  p_type text,
  p_quantity integer,
  p_price numeric,
  p_idempotency_key uuid,
  p_market_prices jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cash_balance numeric;
  v_cash_balance_after numeric;
  v_total numeric;
  v_position_quantity integer;
  v_new_quantity integer;
  v_avg_price numeric;
  v_new_avg_price numeric;
  v_market_price numeric;
  v_market_value numeric;
  v_portfolio_value numeric := 0;
  v_total_value numeric;
  v_price_text text;
  v_trading_day text;
  v_snapshot_id uuid;
  v_snapshot_created_at timestamptz;
  v_position record;
  v_transaction public.transactions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_symbol IS NULL
    OR p_type IS NULL
    OR p_quantity IS NULL
    OR p_price IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_TRADE_ARGUMENT';
  END IF;

  IF p_symbol NOT IN ('AAPL', 'MSFT', 'TSLA') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_SYMBOL';
  END IF;

  IF p_type NOT IN ('BUY', 'SELL') OR p_quantity <= 0 OR p_price <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_TRADE_ARGUMENT';
  END IF;

  -- Serialize all trades for this account before checking idempotency or balances.
  SELECT profile.cash_balance
    INTO v_cash_balance
    FROM public.profiles AS profile
   WHERE profile.id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'PROFILE_NOT_FOUND';
  END IF;

  IF v_cash_balance IS NULL OR v_cash_balance < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'INVALID_CASH_BALANCE';
  END IF;

  -- A repeated key with the same order returns its original transaction.
  -- Price is omitted from the comparison because it is server-fetched and may change on retry.
  SELECT transaction_row.*
    INTO v_transaction
    FROM public.transactions AS transaction_row
   WHERE transaction_row.user_id = p_user_id
     AND transaction_row.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_transaction.symbol <> p_symbol
      OR v_transaction.type <> p_type
      OR v_transaction.quantity <> p_quantity
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
    END IF;

    IF v_transaction.cash_balance_after IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'IDEMPOTENCY_RESULT_UNAVAILABLE';
    END IF;

    IF v_transaction.snapshot_id IS NULL
      OR v_transaction.snapshot_portfolio_value_after IS NULL
      OR v_transaction.snapshot_total_value_after IS NULL
      OR v_transaction.snapshot_created_at IS NULL
      OR v_transaction.market_prices_after IS NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'IDEMPOTENCY_RESULT_UNAVAILABLE';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'transaction', pg_catalog.jsonb_build_object(
        'id', v_transaction.id,
        'symbol', v_transaction.symbol,
        'type', v_transaction.type,
        'quantity', v_transaction.quantity,
        'price', v_transaction.price,
        'total', v_transaction.total,
        'created_at', v_transaction.created_at
      ),
      'cashBalance', v_transaction.cash_balance_after,
      'snapshot', pg_catalog.jsonb_build_object(
        'id', v_transaction.snapshot_id,
        'cashBalance', v_transaction.cash_balance_after,
        'portfolioValue', v_transaction.snapshot_portfolio_value_after,
        'totalValue', v_transaction.snapshot_total_value_after,
        'createdAt', v_transaction.snapshot_created_at,
        'marketPrices', v_transaction.market_prices_after
      ),
      'replayed', true
    );
  END IF;

  IF p_market_prices IS NULL OR pg_catalog.jsonb_typeof(p_market_prices) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_MARKET_PRICES';
  END IF;

  v_total := pg_catalog.round(p_price, 2) * p_quantity;
  v_total := pg_catalog.round(v_total, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_TRADE_TOTAL';
  END IF;

  IF p_type = 'BUY' THEN
    IF v_cash_balance < v_total THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INSUFFICIENT_CASH';
    END IF;

    SELECT position.quantity, position.avg_price
      INTO v_position_quantity, v_avg_price
      FROM public.positions AS position
     WHERE position.user_id = p_user_id
       AND position.symbol = p_symbol
     FOR UPDATE;

    IF FOUND THEN
      IF v_position_quantity IS NULL OR v_avg_price IS NULL OR v_position_quantity < 0 OR v_avg_price < 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'INVALID_POSITION';
      END IF;

      v_new_quantity := v_position_quantity + p_quantity;
      v_new_avg_price := pg_catalog.round(
        ((v_position_quantity::numeric * v_avg_price) + v_total) / v_new_quantity,
        2
      );

      UPDATE public.positions AS position
         SET quantity = v_new_quantity,
             avg_price = v_new_avg_price
       WHERE position.user_id = p_user_id
         AND position.symbol = p_symbol;
    ELSE
      INSERT INTO public.positions (
        id,
        user_id,
        symbol,
        quantity,
        avg_price
      ) VALUES (
        pg_catalog.gen_random_uuid(),
        p_user_id,
        p_symbol,
        p_quantity,
        pg_catalog.round(p_price, 2)
      );
    END IF;

    v_cash_balance_after := pg_catalog.round(v_cash_balance - v_total, 2);
    UPDATE public.profiles AS profile
       SET cash_balance = v_cash_balance_after
     WHERE profile.id = p_user_id;
  ELSE
    SELECT position.quantity, position.avg_price
      INTO v_position_quantity, v_avg_price
      FROM public.positions AS position
     WHERE position.user_id = p_user_id
       AND position.symbol = p_symbol
     FOR UPDATE;

    IF NOT FOUND OR v_position_quantity IS NULL OR v_position_quantity < p_quantity THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INSUFFICIENT_SHARES';
    END IF;

    IF v_avg_price IS NULL OR v_avg_price < 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'INVALID_POSITION';
    END IF;

    v_cash_balance_after := pg_catalog.round(v_cash_balance + v_total, 2);
    UPDATE public.profiles AS profile
       SET cash_balance = v_cash_balance_after
     WHERE profile.id = p_user_id;

    IF v_position_quantity = p_quantity THEN
      DELETE FROM public.positions AS position
       WHERE position.user_id = p_user_id
         AND position.symbol = p_symbol;
    ELSE
      UPDATE public.positions AS position
         SET quantity = v_position_quantity - p_quantity
       WHERE position.user_id = p_user_id
         AND position.symbol = p_symbol;
    END IF;
  END IF;

  -- Validate and value the positions after the trade. The profile lock
  -- serializes this account's RPC trades; a missing concurrent symbol raises
  -- an exception, rolling back the balance, position, transaction and snapshot.
  FOR v_position IN
    SELECT position.symbol, position.quantity
      FROM public.positions AS position
     WHERE position.user_id = p_user_id
       AND position.quantity > 0
     ORDER BY position.symbol
  LOOP
    IF NOT (p_market_prices ? v_position.symbol) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MISSING_MARKET_PRICE';
    END IF;

    IF pg_catalog.jsonb_typeof(p_market_prices -> v_position.symbol) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'INVALID_MARKET_PRICE';
    END IF;

    v_price_text := p_market_prices -> v_position.symbol ->> 'price';
    v_trading_day := p_market_prices -> v_position.symbol ->> 'latestTradingDay';
    IF pg_catalog.jsonb_typeof(p_market_prices -> v_position.symbol -> 'price') <> 'number'
      OR pg_catalog.jsonb_typeof(p_market_prices -> v_position.symbol -> 'latestTradingDay') <> 'string'
      OR v_price_text IS NULL OR v_price_text !~ '^[0-9]+([.][0-9]+)?$'
      OR v_trading_day IS NULL OR v_trading_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'INVALID_MARKET_PRICE';
    END IF;

    BEGIN
      v_market_price := v_price_text::numeric;
      IF pg_catalog.to_char(v_trading_day::date, 'YYYY-MM-DD') <> v_trading_day THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'INVALID_MARKET_PRICE';
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'INVALID_MARKET_PRICE';
    END;

    IF v_market_price <= 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'INVALID_MARKET_PRICE';
    END IF;

    v_market_value := pg_catalog.round(v_position.quantity::numeric * v_market_price, 2);
    v_portfolio_value := v_portfolio_value + v_market_value;
  END LOOP;

  v_portfolio_value := pg_catalog.round(v_portfolio_value, 2);
  v_total_value := pg_catalog.round(v_cash_balance_after + v_portfolio_value, 2);
  v_snapshot_id := pg_catalog.gen_random_uuid();
  v_snapshot_created_at := pg_catalog.now();

  INSERT INTO public.snapshots (
    id,
    user_id,
    cash_balance,
    portfolio_value,
    total_value,
    created_at
  ) VALUES (
    v_snapshot_id,
    p_user_id,
    v_cash_balance_after,
    v_portfolio_value,
    v_total_value,
    v_snapshot_created_at
  );

  INSERT INTO public.transactions (
    id,
    user_id,
    symbol,
    type,
    quantity,
    price,
    total,
    created_at,
    idempotency_key,
    cash_balance_after,
    snapshot_id,
    snapshot_portfolio_value_after,
    snapshot_total_value_after,
    snapshot_created_at,
    market_prices_after
  ) VALUES (
    pg_catalog.gen_random_uuid(),
    p_user_id,
    p_symbol,
    p_type,
    p_quantity,
    pg_catalog.round(p_price, 2),
    v_total,
    pg_catalog.now(),
    p_idempotency_key,
    v_cash_balance_after,
    v_snapshot_id,
    v_portfolio_value,
    v_total_value,
    v_snapshot_created_at,
    p_market_prices
  )
  RETURNING * INTO v_transaction;

  RETURN pg_catalog.jsonb_build_object(
    'transaction', pg_catalog.jsonb_build_object(
      'id', v_transaction.id,
      'symbol', v_transaction.symbol,
      'type', v_transaction.type,
      'quantity', v_transaction.quantity,
      'price', v_transaction.price,
      'total', v_transaction.total,
      'created_at', v_transaction.created_at
    ),
    'cashBalance', v_cash_balance_after,
    'snapshot', pg_catalog.jsonb_build_object(
      'id', v_snapshot_id,
      'cashBalance', v_cash_balance_after,
      'portfolioValue', v_portfolio_value,
      'totalValue', v_total_value,
      'createdAt', v_snapshot_created_at,
      'marketPrices', p_market_prices
    ),
    'replayed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.execute_trade(uuid, text, text, integer, numeric, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_trade(uuid, text, text, integer, numeric, uuid, jsonb)
  TO service_role;
