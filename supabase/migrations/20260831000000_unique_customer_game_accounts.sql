-- A customer can hold at most one account on each game platform.
-- This protects Create Account requests even if a client bypasses queue generation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sandbox_game_accounts
    GROUP BY session_id, customer_id, game
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add the customer/game account uniqueness guard while duplicates exist';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sandbox_game_accounts_customer_game
  ON public.sandbox_game_accounts(session_id, customer_id, game);
