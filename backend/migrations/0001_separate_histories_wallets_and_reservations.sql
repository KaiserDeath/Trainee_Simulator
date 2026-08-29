-- Milestone 0 remediation draft.
-- Inventory the target schema and rehearse on a disposable database before
-- applying this data-moving migration to any shared environment.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sandbox_operations AS operation
    JOIN trainee_sessions AS session
      ON session.id = operation.session_id
    WHERE operation.status = 'PENDING'
      AND session.status = 'active'
  ) THEN
    RAISE EXCEPTION
      'Close or discard active sandbox sessions before applying migration 0001';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS sandbox_game_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  balance NUMERIC NOT NULL CHECK (balance >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, game)
);

CREATE TABLE IF NOT EXISTS sandbox_game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES sandbox_customers(id) ON DELETE CASCADE,
  game_account_id UUID REFERENCES sandbox_game_accounts(id) ON DELETE SET NULL,
  game TEXT,
  game_username TEXT,
  type TEXT NOT NULL,
  amount NUMERIC,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO sandbox_game_wallets (
  session_id,
  game,
  balance
)
SELECT DISTINCT
  session_id,
  game,
  20000
FROM sandbox_game_accounts
ON CONFLICT (session_id, game) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_sandbox_game_history_account_time
  ON sandbox_game_history(session_id, game_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sandbox_game_history_customer_time
  ON sandbox_game_history(session_id, customer_id, created_at DESC);

-- Preserve game rows while separating them from Backend customer history.
-- Attribute an account only when both game and username identify exactly one
-- candidate. Delete only source rows proven to exist in the destination.
BEGIN;

INSERT INTO sandbox_game_history (
  id,
  session_id,
  customer_id,
  game_account_id,
  game,
  game_username,
  type,
  amount,
  description,
  created_at
)
SELECT
  history.id,
  history.session_id,
  history.customer_id,
  account.id,
  account.game,
  account.game_username,
  history.type,
  history.amount,
  history.description,
  history.created_at
FROM sandbox_transaction_history AS history
LEFT JOIN LATERAL (
  SELECT
    CASE WHEN COUNT(*) = 1
      THEN (ARRAY_AGG(candidate.id ORDER BY candidate.id))[1]
    END AS id,
    CASE WHEN COUNT(*) = 1
      THEN (ARRAY_AGG(candidate.game ORDER BY candidate.id))[1]
    END AS game,
    CASE WHEN COUNT(*) = 1
      THEN (ARRAY_AGG(candidate.game_username ORDER BY candidate.id))[1]
    END AS game_username
  FROM sandbox_game_accounts AS candidate
  WHERE candidate.session_id = history.session_id
    AND candidate.customer_id = history.customer_id
    AND COALESCE(history.description, '') ILIKE
      '%' || candidate.game_username || '%'
    AND COALESCE(history.description, '') ILIKE
      '%' || candidate.game || '%'
) AS account ON TRUE
WHERE history.type LIKE 'GAME %'
ON CONFLICT (id) DO NOTHING;

DELETE FROM sandbox_transaction_history AS history
WHERE history.type LIKE 'GAME %'
  AND EXISTS (
    SELECT 1
    FROM sandbox_game_history AS copied
    WHERE copied.id = history.id
      AND copied.session_id = history.session_id
      AND copied.customer_id = history.customer_id
      AND copied.type = history.type
      AND copied.amount IS NOT DISTINCT FROM history.amount
      AND copied.description IS NOT DISTINCT FROM history.description
      AND copied.created_at = history.created_at
  );

COMMIT;

ALTER TABLE sandbox_operations
  ADD COLUMN IF NOT EXISTS handling_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS handling_time_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS customer_balance_at_request NUMERIC,
  ADD COLUMN IF NOT EXISTS game_balance_at_request NUMERIC,
  ADD COLUMN IF NOT EXISTS reserved_customer_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_reservation_status TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS game TEXT,
  ADD COLUMN IF NOT EXISTS queue_policy_version SMALLINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS trainee_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  trainee_id UUID,
  trainee_name TEXT,
  operation_id UUID REFERENCES sandbox_operations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  details JSONB,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainee_action_logs_session_id
  ON trainee_action_logs(session_id);

CREATE INDEX IF NOT EXISTS idx_trainee_action_logs_operation_id
  ON trainee_action_logs(operation_id);

CREATE INDEX IF NOT EXISTS idx_trainee_action_logs_timestamp
  ON trainee_action_logs(timestamp DESC);

UPDATE sandbox_operations AS operation
SET game = account.game
FROM sandbox_game_accounts AS account
WHERE operation.game_account_id = account.id
  AND operation.game IS NULL;

ALTER TABLE sandbox_operations
  DROP CONSTRAINT IF EXISTS sandbox_operations_customer_reservation_status_check;

ALTER TABLE sandbox_operations
  ADD CONSTRAINT sandbox_operations_customer_reservation_status_check
  CHECK (
    customer_reservation_status IN ('NONE', 'HELD', 'COMMITTED', 'RELEASED')
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_movement_per_customer
  ON sandbox_operations(session_id, customer_id)
  WHERE status = 'PENDING'
    AND queue_policy_version = 1
    AND type IN ('ADD CREDITS', 'WITHDRAW CREDITS');

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_request_per_customer_game
  ON sandbox_operations(session_id, customer_id, game)
  WHERE status = 'PENDING'
    AND queue_policy_version = 1
    AND type IN ('CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD');

ALTER TABLE sandbox_operations
  DROP CONSTRAINT IF EXISTS sandbox_operations_pending_request_game_check;

ALTER TABLE sandbox_operations
  ADD CONSTRAINT sandbox_operations_pending_request_game_check
  CHECK (
    queue_policy_version <> 1
    OR status <> 'PENDING'
    OR type NOT IN ('CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD')
    OR game IS NOT NULL
  );

CREATE OR REPLACE FUNCTION create_reserved_sandbox_operation(
  p_operation JSONB
)
RETURNS sandbox_operations
LANGUAGE plpgsql
AS $$
DECLARE
  v_operation sandbox_operations;
  v_type TEXT := p_operation->>'type';
  v_amount NUMERIC := NULLIF(p_operation->>'amount', '')::NUMERIC;
  v_customer_id UUID := (p_operation->>'customer_id')::UUID;
  v_balance NUMERIC;
BEGIN
  IF v_type = 'ADD CREDITS' THEN
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'ADD CREDITS amount must be greater than zero';
    END IF;

    SELECT balance
      INTO v_balance
      FROM sandbox_customers
      WHERE id = v_customer_id
        AND session_id = (p_operation->>'session_id')::UUID
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sandbox customer not found';
    END IF;

    IF v_balance < v_amount THEN
      RAISE EXCEPTION 'Insufficient customer balance for reservation';
    END IF;

    UPDATE sandbox_customers
      SET balance = balance - v_amount
      WHERE id = v_customer_id;
  END IF;

  INSERT INTO sandbox_operations (
    id,
    session_id,
    customer_id,
    game_account_id,
    game,
    type,
    amount,
    customer_balance_at_request,
    game_balance_at_request,
    status,
    created_at,
    processed_at,
    processed_by,
    is_correct,
    processing_time_seconds,
    reserved_customer_amount,
    customer_reservation_status,
    queue_policy_version
  )
  VALUES (
    (p_operation->>'id')::UUID,
    (p_operation->>'session_id')::UUID,
    v_customer_id,
    (p_operation->>'game_account_id')::UUID,
    p_operation->>'game',
    v_type,
    v_amount,
    NULLIF(p_operation->>'customer_balance_at_request', '')::NUMERIC,
    NULLIF(p_operation->>'game_balance_at_request', '')::NUMERIC,
    'PENDING',
    COALESCE((p_operation->>'created_at')::TIMESTAMPTZ, NOW()),
    NULL,
    NULL,
    NULL,
    NULL,
    CASE WHEN v_type = 'ADD CREDITS' THEN v_amount ELSE 0 END,
    CASE WHEN v_type = 'ADD CREDITS' THEN 'HELD' ELSE 'NONE' END,
    1
  )
  RETURNING * INTO v_operation;

  RETURN v_operation;
END;
$$;

CREATE OR REPLACE FUNCTION settle_reserved_add_credits_operation(
  p_operation_id UUID,
  p_action TEXT,
  p_trainee_name TEXT,
  p_is_correct BOOLEAN,
  p_processing_seconds NUMERIC,
  p_handling_started_at TIMESTAMP WITH TIME ZONE,
  p_handling_seconds NUMERIC,
  p_history_description TEXT
)
RETURNS sandbox_operations
LANGUAGE plpgsql
AS $$
DECLARE
  v_operation sandbox_operations;
BEGIN
  IF p_action NOT IN ('APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Unsupported operation action';
  END IF;

  SELECT *
    INTO v_operation
    FROM sandbox_operations
    WHERE id = p_operation_id
    FOR UPDATE;

  IF NOT FOUND OR v_operation.type <> 'ADD CREDITS' THEN
    RAISE EXCEPTION 'Pending ADD CREDITS operation not found';
  END IF;

  IF v_operation.status <> 'PENDING'
    OR v_operation.customer_reservation_status <> 'HELD' THEN
    RAISE EXCEPTION 'ADD CREDITS reservation is not held';
  END IF;

  IF p_action = 'CANCELLED' THEN
    UPDATE sandbox_customers
      SET balance = balance + v_operation.reserved_customer_amount
      WHERE id = v_operation.customer_id;
  END IF;

  UPDATE sandbox_operations
    SET status = p_action,
        processed_at = NOW(),
        processed_by = p_trainee_name,
        is_correct = p_is_correct,
        processing_time_seconds = p_processing_seconds,
        handling_started_at = p_handling_started_at,
        handling_time_seconds = p_handling_seconds,
        customer_reservation_status =
          CASE WHEN p_action = 'APPROVED' THEN 'COMMITTED' ELSE 'RELEASED' END
    WHERE id = p_operation_id
    RETURNING * INTO v_operation;

  INSERT INTO sandbox_transaction_history (
    session_id,
    customer_id,
    type,
    amount,
    description
  )
  VALUES (
    v_operation.session_id,
    v_operation.customer_id,
    v_operation.type,
    v_operation.amount,
    p_history_description
  );

  RETURN v_operation;
END;
$$;

CREATE OR REPLACE FUNCTION recharge_sandbox_game_account(
  p_account_id UUID,
  p_amount NUMERIC,
  p_description TEXT
)
RETURNS sandbox_game_accounts
LANGUAGE plpgsql
AS $$
DECLARE
  v_account sandbox_game_accounts;
  v_wallet sandbox_game_wallets;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valid amount required';
  END IF;

  SELECT * INTO v_account
    FROM sandbox_game_accounts
    WHERE id = p_account_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game account not found';
  END IF;

  SELECT * INTO v_wallet
    FROM sandbox_game_wallets
    WHERE session_id = v_account.session_id
      AND game = v_account.game
    FOR UPDATE;

  IF NOT FOUND OR v_wallet.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient game loading balance';
  END IF;

  UPDATE sandbox_game_wallets
    SET balance = balance - p_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;

  UPDATE sandbox_game_accounts
    SET balance = balance + p_amount
    WHERE id = p_account_id
    RETURNING * INTO v_account;

  INSERT INTO sandbox_game_history (
    session_id,
    customer_id,
    game_account_id,
    game,
    game_username,
    type,
    amount,
    description
  )
  VALUES (
    v_account.session_id,
    v_account.customer_id,
    v_account.id,
    v_account.game,
    v_account.game_username,
    'GAME ADD CREDITS',
    p_amount,
    p_description
  );

  RETURN v_account;
END;
$$;

CREATE OR REPLACE FUNCTION redeem_sandbox_game_account(
  p_account_id UUID,
  p_amount NUMERIC,
  p_description TEXT
)
RETURNS sandbox_game_accounts
LANGUAGE plpgsql
AS $$
DECLARE
  v_account sandbox_game_accounts;
  v_wallet sandbox_game_wallets;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valid amount required';
  END IF;

  SELECT * INTO v_account
    FROM sandbox_game_accounts
    WHERE id = p_account_id
    FOR UPDATE;

  IF NOT FOUND OR v_account.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient game balance';
  END IF;

  SELECT * INTO v_wallet
    FROM sandbox_game_wallets
    WHERE session_id = v_account.session_id
      AND game = v_account.game
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game loading wallet not found';
  END IF;

  UPDATE sandbox_game_accounts
    SET balance = balance - p_amount
    WHERE id = p_account_id
    RETURNING * INTO v_account;

  UPDATE sandbox_game_wallets
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;

  INSERT INTO sandbox_game_history (
    session_id,
    customer_id,
    game_account_id,
    game,
    game_username,
    type,
    amount,
    description
  )
  VALUES (
    v_account.session_id,
    v_account.customer_id,
    v_account.id,
    v_account.game,
    v_account.game_username,
    'GAME WITHDRAW CREDITS',
    p_amount,
    p_description
  );

  RETURN v_account;
END;
$$;
