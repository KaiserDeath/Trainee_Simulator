-- Pending reconciliation movements.
-- PENDING_RECONCILIATION: the bot tried the Add/Withdraw but could not confirm
-- the game balance. bot_applied (hidden) says whether it really reached the
-- game. The trainee must not operate it: they check the game history and
-- answer "It applied" (APPROVED) or "It did not apply" (CANCELLED), always
-- with a reason. Correct only when the answer matches bot_applied and the
-- trainee did not touch the game themselves.

ALTER TABLE public.sandbox_operations
  ADD COLUMN IF NOT EXISTS movement_scenario TEXT;

ALTER TABLE public.sandbox_operations
  ADD COLUMN IF NOT EXISTS bot_applied BOOLEAN;

COMMENT ON COLUMN public.sandbox_operations.bot_applied IS
  'Hidden: whether the system performed the game side of a scenario movement.';

ALTER TABLE public.sandbox_operations
  DROP CONSTRAINT IF EXISTS sandbox_operations_movement_scenario_check;

ALTER TABLE public.sandbox_operations
  ADD CONSTRAINT sandbox_operations_movement_scenario_check
  CHECK (
    movement_scenario IS NULL
    OR movement_scenario IN (
      'ALREADY_PROCESSED',
      'PLAYER_IN_GAME',
      'PENDING_RECONCILIATION'
    )
  );

CREATE OR REPLACE FUNCTION public.settle_backend_movement_operation(
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
  v_action TEXT;
  v_trainee_name TEXT;
  v_reason TEXT;
  v_session_status TEXT;
  v_processed_at TIMESTAMPTZ;
  v_processing_seconds NUMERIC;
  v_handling_started_at TIMESTAMPTZ;
  v_handling_seconds NUMERIC;
  v_is_correct BOOLEAN := FALSE;
  v_match_count INTEGER := 0;
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

  IF v_operation.type NOT IN ('ADD CREDITS', 'WITHDRAW CREDITS') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RPC only supports Backend credit movements';
  END IF;

  IF v_operation.status <> 'PENDING' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Operation already processed';
  END IF;

  IF v_operation.amount IS NULL OR v_operation.amount <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Movement amount must be positive';
  END IF;

  IF v_operation.type = 'ADD CREDITS'
    AND (
      v_operation.customer_reservation_status <> 'HELD'
      OR v_operation.reserved_customer_amount
        IS DISTINCT FROM v_operation.amount
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ADD CREDITS reservation is not held';
  END IF;

  IF v_operation.type = 'WITHDRAW CREDITS'
    AND (
      v_operation.customer_reservation_status <> 'NONE'
      OR v_operation.reserved_customer_amount <> 0
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WITHDRAW CREDITS must not reserve customer funds';
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

  IF v_operation.movement_scenario = 'PENDING_RECONCILIATION' THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'A reason is required to reconcile a movement';
    END IF;
  ELSIF v_action = 'APPROVED' THEN
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
  WHERE customer.id = v_operation.customer_id
    AND customer.session_id = v_operation.session_id
  FOR UPDATE OF customer;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Customer not found';
  END IF;

  IF v_action = 'APPROVED'
    OR v_operation.movement_scenario = 'PENDING_RECONCILIATION' THEN
    v_expected_game_action :=
      CASE v_operation.type
        WHEN 'ADD CREDITS' THEN 'GAME ADD CREDITS'
        ELSE 'GAME WITHDRAW CREDITS'
      END;

    SELECT COUNT(*) FROM (
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
              COALESCE(history.game, parsed.details ->> 'game', ''),
              '-',
              ' '
            ))) = LOWER(BTRIM(REPLACE(COALESCE(v_game, ''), '-', ' ')))
            AND COALESCE(
              history.game_username,
              parsed.details ->> 'mobileId',
              parsed.details ->> 'mobile_id',
              parsed.details ->> 'playerId',
              ''
            ) = COALESCE(v_game_username, '')
          )
        )
    ) AS matches INTO v_match_count;

    v_is_correct := v_match_count > 0;
  ELSIF v_operation.type = 'WITHDRAW CREDITS' THEN
    v_is_correct :=
      COALESCE(v_operation.game_balance_at_request, v_game_balance)
        < v_operation.amount;
  END IF;

  -- Difficulty scenarios override the default grading:
  -- ALREADY_PROCESSED: the system loaded the game when the request arrived,
  --   so only approving is correct, and a second load in the game is a
  --   duplicate.
  -- PLAYER_IN_GAME: the game refused the movement, so only cancelling is
  --   correct.
  IF v_operation.movement_scenario = 'ALREADY_PROCESSED' THEN
    v_is_correct := v_action = 'APPROVED' AND v_match_count = 1;
  ELSIF v_operation.movement_scenario = 'PLAYER_IN_GAME' THEN
    v_is_correct := v_action = 'CANCELLED';
  ELSIF v_operation.movement_scenario = 'PENDING_RECONCILIATION' THEN
    -- "It applied" (APPROVED) is right only when the bot reached the game;
    -- "It did not apply" (CANCELLED) only when it did not. Either way the
    -- trainee must not have moved the game themselves.
    v_is_correct := CASE
      WHEN COALESCE(v_operation.bot_applied, FALSE)
        THEN v_action = 'APPROVED' AND v_match_count = 1
      ELSE v_action = 'CANCELLED' AND v_match_count = 0
    END;
  END IF;

  v_processed_at := CLOCK_TIMESTAMP();
  v_processing_seconds := GREATEST(
    EXTRACT(EPOCH FROM v_processed_at - v_operation.created_at),
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

  v_handling_seconds := CASE
    WHEN v_handling_started_at IS NULL THEN NULL
    ELSE GREATEST(
      EXTRACT(EPOCH FROM v_processed_at - v_handling_started_at),
      0
    )
  END;

  IF v_operation.type = 'ADD CREDITS' THEN
    IF v_action = 'CANCELLED' THEN
      UPDATE public.sandbox_customers
        SET balance = balance + v_operation.reserved_customer_amount
        WHERE id = v_operation.customer_id;
    END IF;

    v_operation.customer_reservation_status :=
      CASE WHEN v_action = 'APPROVED' THEN 'COMMITTED' ELSE 'RELEASED' END;
  ELSIF v_action = 'APPROVED' AND v_is_correct THEN
    UPDATE public.sandbox_customers
      SET balance = balance + v_operation.amount
      WHERE id = v_operation.customer_id;
  END IF;

  UPDATE public.sandbox_operations
    SET status = v_action,
        processed_at = v_processed_at,
        processed_by = v_trainee_name,
        is_correct = v_is_correct,
        processing_time_seconds = v_processing_seconds,
        handling_started_at = v_handling_started_at,
        handling_time_seconds = v_handling_seconds,
        cancellation_reason = v_reason,
        customer_reservation_status =
          CASE
            WHEN v_operation.type = 'ADD CREDITS'
              THEN v_operation.customer_reservation_status
            ELSE customer_reservation_status
          END
    WHERE id = v_operation.id
      AND status = 'PENDING'
    RETURNING * INTO v_operation;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Operation already processed';
  END IF;

  v_history_description := JSONB_BUILD_OBJECT(
    'kind', 'MOVEMENT_HISTORY',
    'operationCode', UPPER(SUBSTRING(v_operation.id::TEXT, 1, 8)),
    'playerId', COALESCE(v_game_username, ''),
    'playerEmail', COALESCE(v_customer_email, ''),
    'game', COALESCE(v_game, ''),
    'requestedAt', v_operation.created_at,
    'acceptedAt', v_processed_at,
    'manager', v_trainee_name,
    'status', CASE WHEN v_action = 'APPROVED' THEN 'Approved' ELSE 'Cancelled' END,
    'isCorrect', v_is_correct,
    'cancellationReason', v_reason,
    'scenario', v_operation.movement_scenario,
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
  ) VALUES (
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
  ) VALUES (
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

REVOKE ALL ON FUNCTION public.settle_backend_movement_operation(
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.settle_backend_movement_operation(
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
