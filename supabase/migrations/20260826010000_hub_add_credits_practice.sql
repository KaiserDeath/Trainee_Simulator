-- Add Credits focused practice extends the disposable sandbox context with the
-- explicit operation link created by the existing reservation RPC. No new
-- financial, scoring, retry, or escalation policy is encoded here.

ALTER TABLE public.hub_practice_contexts
  ADD COLUMN IF NOT EXISTS practice_type TEXT NOT NULL DEFAULT 'balance',
  ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public.sandbox_operations(id) ON DELETE RESTRICT;

ALTER TABLE public.hub_practice_contexts
  DROP CONSTRAINT IF EXISTS hub_practice_contexts_practice_type_check;

ALTER TABLE public.hub_practice_contexts
  ADD CONSTRAINT hub_practice_contexts_practice_type_check
  CHECK (practice_type IN ('balance', 'add_credits'));

CREATE UNIQUE INDEX IF NOT EXISTS hub_practice_contexts_operation_id_uq
  ON public.hub_practice_contexts(operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hub_practice_contexts_practice_type_idx
  ON public.hub_practice_contexts(identity_id, activity_id, practice_type, created_at DESC);

COMMENT ON COLUMN public.hub_practice_contexts.operation_id IS
  'Explicit link to the existing sandbox ADD CREDITS reservation for focused practice.';

CREATE OR REPLACE FUNCTION public.hub_recharge_add_credits_practice(
  p_operation_id UUID,
  p_account_id UUID,
  p_amount NUMERIC,
  p_description JSONB
)
RETURNS public.sandbox_game_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation public.sandbox_operations;
  v_account public.sandbox_game_accounts;
BEGIN
  SELECT * INTO v_operation
    FROM public.sandbox_operations
    WHERE id = p_operation_id
    FOR UPDATE;

  IF NOT FOUND OR v_operation.type <> 'ADD CREDITS' THEN
    RAISE EXCEPTION 'ADD CREDITS movement not found';
  END IF;
  IF v_operation.status <> 'PENDING' OR v_operation.customer_reservation_status <> 'HELD' THEN
    RAISE EXCEPTION 'ADD CREDITS movement is not pending';
  END IF;
  IF v_operation.game_account_id <> p_account_id OR p_amount IS NULL OR p_amount <> v_operation.amount THEN
    RAISE EXCEPTION 'ADD CREDITS account or amount does not match the movement';
  END IF;

  SELECT * INTO v_account
    FROM public.sandbox_game_accounts
    WHERE id = p_account_id
      AND session_id = v_operation.session_id
      AND customer_id = v_operation.customer_id
      AND game = v_operation.game
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADD CREDITS game account does not match the movement';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.sandbox_game_history
      WHERE session_id = v_operation.session_id
        AND customer_id = v_operation.customer_id
        AND game_account_id = v_operation.game_account_id
        AND type = 'GAME ADD CREDITS'
        AND amount = v_operation.amount
        AND created_at >= v_operation.created_at
  ) THEN
    RETURN v_account;
  END IF;

  SELECT * INTO v_account
    FROM public.recharge_sandbox_game_account(p_account_id, p_amount, p_description::TEXT);
  RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION public.hub_recharge_add_credits_practice(UUID, UUID, NUMERIC, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_recharge_add_credits_practice(UUID, UUID, NUMERIC, JSONB)
  TO service_role;
