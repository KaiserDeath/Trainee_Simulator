-- Migration: Create trainee_action_logs table
-- Description: Audit log for trainee actions (username copy, operation accept/reject, etc.)

CREATE TABLE IF NOT EXISTS trainee_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  trainee_id UUID,
  trainee_name TEXT,
  operation_id UUID REFERENCES sandbox_operations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  details JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for session_id lookup
CREATE INDEX IF NOT EXISTS idx_trainee_action_logs_session_id 
  ON trainee_action_logs(session_id);

-- Create index for operation_id lookup
CREATE INDEX IF NOT EXISTS idx_trainee_action_logs_operation_id 
  ON trainee_action_logs(operation_id);

-- Create index for timestamp ordering
CREATE INDEX IF NOT EXISTS idx_trainee_action_logs_timestamp 
  ON trainee_action_logs(timestamp DESC);

-- Create index for action_type filtering
CREATE INDEX IF NOT EXISTS idx_trainee_action_logs_action_type 
  ON trainee_action_logs(action_type);

-- Set table comment
COMMENT ON TABLE trainee_action_logs IS 
  'Audit log tracking trainee actions during training sessions';

COMMENT ON COLUMN trainee_action_logs.id IS 'Unique log entry ID';
COMMENT ON COLUMN trainee_action_logs.session_id IS 'Reference to the training session';
COMMENT ON COLUMN trainee_action_logs.trainee_id IS 'ID of the trainee performing the action';
COMMENT ON COLUMN trainee_action_logs.trainee_name IS 'Name of the trainee for easy reference';
COMMENT ON COLUMN trainee_action_logs.operation_id IS 'Reference to the operation being acted upon';
COMMENT ON COLUMN trainee_action_logs.action_type IS 'Type of action: USERNAME_COPIED, OPERATION_ACCEPTED, OPERATION_REJECTED, OPERATION_CANCELLED';
COMMENT ON COLUMN trainee_action_logs.details IS 'JSON details about the action (timestamp, username, operation details, etc.)';
COMMENT ON COLUMN trainee_action_logs.timestamp IS 'Exact timestamp when the action occurred';

-- Operation handling timer. Queue processing_time_seconds measures from
-- request creation; handling_time_seconds measures from the first copied
-- username/game ID to approve/cancel.
ALTER TABLE sandbox_operations
  ADD COLUMN IF NOT EXISTS handling_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS handling_time_seconds NUMERIC;

CREATE INDEX IF NOT EXISTS idx_sandbox_operations_handling_started_at
  ON sandbox_operations(handling_started_at);

-- Balance snapshots used to score movements against the state that existed
-- when the request was generated, not the mutable balance after processing.
ALTER TABLE sandbox_operations
  ADD COLUMN IF NOT EXISTS customer_balance_at_request NUMERIC,
  ADD COLUMN IF NOT EXISTS game_balance_at_request NUMERIC;

-- Operational note supplied by the trainee when cancelling an Add Credits
-- or Withdraw Credits movement. This field is informational and is not used
-- by the scoring service.
ALTER TABLE sandbox_operations
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN sandbox_operations.cancellation_reason IS
  'Reason supplied when an Add Credits or Withdraw Credits operation is cancelled; excluded from scoring';

-- Game-side actions belong to a dedicated history store. Backend settlement
-- records remain in sandbox_transaction_history and are never shown in a game.
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

CREATE INDEX IF NOT EXISTS idx_sandbox_game_history_account_time
  ON sandbox_game_history(session_id, game_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sandbox_game_history_customer_time
  ON sandbox_game_history(session_id, customer_id, created_at DESC);

-- Move legacy game-owned rows out of the Backend customer history. The
-- lateral match preserves account metadata only when one account matches
-- both the recorded game and username. Ambiguous rows remain unattributed
-- and are handled by the runtime's legacy metadata fallback.
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

-- Apply a game-side Add/Withdraw mutation and its game-owned history row in
-- one transaction. PostgreSQL rolls back both changes if either step fails.
CREATE OR REPLACE FUNCTION apply_sandbox_game_movement(
  p_account_id UUID,
  p_type TEXT,
  p_amount NUMERIC,
  p_description TEXT
)
RETURNS sandbox_game_accounts
LANGUAGE plpgsql
AS $$
DECLARE
  v_account sandbox_game_accounts;
BEGIN
  IF p_type NOT IN (
    'GAME ADD CREDITS',
    'GAME WITHDRAW CREDITS'
  ) THEN
    RAISE EXCEPTION 'Unsupported game movement type';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valid amount required';
  END IF;

  SELECT *
    INTO v_account
    FROM sandbox_game_accounts
    WHERE id = p_account_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game account not found';
  END IF;

  IF p_type = 'GAME ADD CREDITS' THEN
    UPDATE sandbox_game_accounts
      SET balance = CASE
        WHEN game = 'Golden Dragon' THEN balance
        ELSE balance + p_amount
      END
      WHERE id = p_account_id
      RETURNING * INTO v_account;
  ELSE
    IF v_account.balance < p_amount THEN
      RAISE EXCEPTION 'Insufficient game balance';
    END IF;

    UPDATE sandbox_game_accounts
      SET balance = balance - p_amount
      WHERE id = p_account_id
      RETURNING * INTO v_account;
  END IF;

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
    p_type,
    p_amount,
    p_description
  );

  RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION apply_sandbox_game_movement(
  UUID,
  TEXT,
  NUMERIC,
  TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION apply_sandbox_game_movement(
  UUID,
  TEXT,
  NUMERIC,
  TEXT
) TO service_role;

-- Parse legacy history descriptions without allowing malformed text to abort
-- an otherwise valid settlement.
CREATE OR REPLACE FUNCTION try_parse_sandbox_jsonb(
  p_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  RETURN p_value::JSONB;
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{}'::JSONB;
END;
$$;

REVOKE ALL ON FUNCTION try_parse_sandbox_jsonb(TEXT)
  FROM PUBLIC, anon, authenticated;

-- Settle one Backend movement under row locks. Correctness is calculated from
-- operation/game state inside PostgreSQL and never uses the cancellation note.
CREATE OR REPLACE FUNCTION settle_backend_movement_operation(
  p_operation_id UUID,
  p_action TEXT,
  p_trainee_name TEXT,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation public.sandbox_operations%ROWTYPE;
  v_operation_json JSONB;
  v_action TEXT;
  v_trainee_name TEXT;
  v_reason TEXT;
  v_session_status TEXT;
  v_processed_at TIMESTAMPTZ;
  v_processing_seconds NUMERIC;
  v_handling_started_at TIMESTAMPTZ;
  v_handling_seconds NUMERIC;
  v_is_correct BOOLEAN := FALSE;
  v_expected_game_action TEXT;
  v_game TEXT;
  v_game_username TEXT;
  v_game_balance NUMERIC;
  v_customer_email TEXT;
  v_history_description TEXT;
BEGIN
  v_action := UPPER(BTRIM(COALESCE(p_action, '')));
  v_trainee_name :=
    NULLIF(BTRIM(COALESCE(p_trainee_name, '')), '');

  IF v_action NOT IN ('APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid action';
  END IF;

  IF v_trainee_name IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'traineeName is required';
  END IF;

  SELECT *
    INTO v_operation
    FROM public.sandbox_operations
    WHERE id = p_operation_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Operation not found';
  END IF;

  IF v_operation.type NOT IN (
    'ADD CREDITS',
    'WITHDRAW CREDITS'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RPC only supports Backend credit movements';
  END IF;

  IF v_operation.status <> 'PENDING' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Operation already processed';
  END IF;

  IF v_operation.amount IS NULL
    OR v_operation.amount <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Movement amount must be positive';
  END IF;

  v_operation_json := TO_JSONB(v_operation);

  IF COALESCE(
       v_operation_json ->> 'customer_reservation_status',
       'NONE'
     ) <> 'NONE'
     OR COALESCE(
       NULLIF(
         v_operation_json ->> 'reserved_customer_amount',
         ''
       )::NUMERIC,
       0
     ) <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Reserved movement requires the reserved settlement RPC';
  END IF;

  SELECT status
    INTO v_session_status
    FROM public.trainee_sessions
    WHERE id = v_operation.session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Session not found';
  END IF;

  IF v_session_status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Session is no longer active';
  END IF;

  v_reason :=
    NULLIF(BTRIM(COALESCE(p_cancellation_reason, '')), '');

  IF v_action = 'CANCELLED' AND v_reason IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Cancellation reason is required for credit movements';
  END IF;

  IF LENGTH(COALESCE(v_reason, '')) > 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Cancellation reason must be 1000 characters or fewer';
  END IF;

  IF v_action = 'APPROVED' THEN
    v_reason := NULL;
  END IF;

  SELECT
    account.game,
    account.game_username,
    account.balance,
    customer.email
  INTO
    v_game,
    v_game_username,
    v_game_balance,
    v_customer_email
  FROM public.sandbox_customers AS customer
  LEFT JOIN public.sandbox_game_accounts AS account
    ON account.id = v_operation.game_account_id
  WHERE customer.id = v_operation.customer_id;

  IF v_action = 'APPROVED' THEN
    v_expected_game_action :=
      CASE v_operation.type
        WHEN 'ADD CREDITS'
          THEN 'GAME ADD CREDITS'
        ELSE 'GAME WITHDRAW CREDITS'
      END;

    SELECT EXISTS (
      SELECT 1
      FROM public.sandbox_game_history AS history
      CROSS JOIN LATERAL (
        SELECT public.try_parse_sandbox_jsonb(
          history.description
        ) AS details
      ) AS parsed
      WHERE history.session_id = v_operation.session_id
        AND history.customer_id = v_operation.customer_id
        AND history.type = v_expected_game_action
        AND history.amount IS NOT DISTINCT FROM v_operation.amount
        AND history.created_at >= v_operation.created_at
        AND (
          history.game_account_id = v_operation.game_account_id
          OR (
            history.game_account_id IS NULL
            AND LOWER(BTRIM(REPLACE(
              COALESCE(
                history.game,
                parsed.details ->> 'game',
                ''
              ),
              '-',
              ' '
            ))) =
            LOWER(BTRIM(REPLACE(
              COALESCE(v_game, ''),
              '-',
              ' '
            )))
            AND COALESCE(
              history.game_username,
              parsed.details ->> 'mobileId',
              parsed.details ->> 'mobile_id',
              parsed.details ->> 'playerId',
              ''
            ) = COALESCE(v_game_username, '')
          )
        )
    )
    INTO v_is_correct;
  ELSIF v_operation.type = 'WITHDRAW CREDITS' THEN
    v_is_correct :=
      COALESCE(
        v_operation.game_balance_at_request,
        v_game_balance
      ) < v_operation.amount;
  ELSE
    v_is_correct := FALSE;
  END IF;

  v_processed_at := CLOCK_TIMESTAMP();
  v_processing_seconds :=
    GREATEST(
      EXTRACT(
        EPOCH FROM v_processed_at - v_operation.created_at
      ),
      0
    );

  SELECT MIN(log."timestamp")
    INTO v_handling_started_at
    FROM public.trainee_action_logs AS log
    WHERE log.operation_id = v_operation.id
      AND log.action_type IN (
        'USERNAME_COPIED',
        'GAME_ID_COPIED',
        'OPERATION_STARTED'
      );

  v_handling_seconds :=
    CASE
      WHEN v_handling_started_at IS NULL THEN NULL
      ELSE GREATEST(
        EXTRACT(
          EPOCH FROM v_processed_at - v_handling_started_at
        ),
        0
      )
    END;

  IF v_action = 'APPROVED' AND v_is_correct THEN
    IF v_operation.type = 'ADD CREDITS' THEN
      UPDATE public.sandbox_customers
        SET balance = balance - v_operation.amount
        WHERE id = v_operation.customer_id
          AND balance >= v_operation.amount;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'Insufficient customer balance';
      END IF;
    ELSE
      UPDATE public.sandbox_customers
        SET balance = balance + v_operation.amount
        WHERE id = v_operation.customer_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0002',
          MESSAGE = 'Customer not found';
      END IF;
    END IF;
  END IF;

  UPDATE public.sandbox_operations
    SET status = v_action,
        processed_at = v_processed_at,
        processed_by = v_trainee_name,
        is_correct = v_is_correct,
        processing_time_seconds = v_processing_seconds,
        handling_started_at = v_handling_started_at,
        handling_time_seconds = v_handling_seconds,
        cancellation_reason = v_reason
    WHERE id = v_operation.id
      AND status = 'PENDING'
    RETURNING * INTO v_operation;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Operation already processed';
  END IF;

  v_history_description :=
    JSONB_BUILD_OBJECT(
      'kind', 'MOVEMENT_HISTORY',
      'operationCode',
        UPPER(SUBSTRING(v_operation.id::TEXT, 1, 8)),
      'playerId', COALESCE(v_game_username, ''),
      'playerEmail', COALESCE(v_customer_email, ''),
      'game', COALESCE(v_game, ''),
      'requestedAt', v_operation.created_at,
      'acceptedAt', v_processed_at,
      'manager', v_trainee_name,
      'status',
        CASE
          WHEN v_action = 'APPROVED' THEN 'Approved'
          ELSE 'Cancelled'
        END,
      'isCorrect', v_is_correct,
      'cancellationReason', v_reason,
      'details', FORMAT(
        'Operation %s by %s. Correct: %s.%s',
        v_action,
        v_trainee_name,
        CASE WHEN v_is_correct THEN 'true' ELSE 'false' END,
        CASE
          WHEN v_reason IS NULL THEN ''
          ELSE FORMAT(' Cancellation reason: %s.', v_reason)
        END
      )
    )::TEXT;

  INSERT INTO public.sandbox_transaction_history (
    session_id,
    customer_id,
    type,
    amount,
    description,
    created_at
  )
  VALUES (
    v_operation.session_id,
    v_operation.customer_id,
    v_operation.type,
    v_operation.amount,
    v_history_description,
    v_processed_at
  );

  INSERT INTO public.trainee_action_logs (
    session_id,
    trainee_name,
    operation_id,
    action_type,
    details,
    "timestamp"
  )
  VALUES (
    v_operation.session_id,
    v_trainee_name,
    v_operation.id,
    v_action,
    JSONB_BUILD_OBJECT(
      'operationType', v_operation.type,
      'isCorrect', v_is_correct,
      'processingSeconds', v_processing_seconds,
      'handlingStartedAt', v_handling_started_at,
      'handlingSeconds', v_handling_seconds,
      'cancellationReason', v_reason
    ),
    v_processed_at
  );

  RETURN JSONB_BUILD_OBJECT(
    'message', 'Operation processed',
    'isCorrect', v_is_correct,
    'processingSeconds', v_processing_seconds,
    'operation', TO_JSONB(v_operation)
  );
END;
$$;

REVOKE ALL ON FUNCTION settle_backend_movement_operation(
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION settle_backend_movement_operation(
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Create simulator_settings table for global session configurations
CREATE TABLE IF NOT EXISTS simulator_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE simulator_settings IS 'Global settings for the simulator system';

-- Seed default timeout if not exists
INSERT INTO simulator_settings (key, value)
VALUES ('session_timeout_minutes', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Seed default OPM range
INSERT INTO simulator_settings (key, value)
VALUES 
  ('min_opm', '2'::jsonb),
  ('max_opm', '4'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Store session duration on each trainee session
ALTER TABLE trainee_sessions
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 30;
