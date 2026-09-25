-- Golden Dragon shows two player figures: Entries, the sum of its purchase
-- history, and Winnings, the account balance. A purchase buys entries only,
-- so it must not raise the balance there. Orion Stars and Vblink keep a
-- single credit balance that purchases add to.
-- The service kept this rule before purchases moved into this function;
-- the move dropped it, so Golden Dragon purchases leaked into Winnings.

CREATE OR REPLACE FUNCTION public.recharge_sandbox_game_account(
  p_account_id UUID,
  p_amount NUMERIC,
  p_description TEXT
)
RETURNS public.sandbox_game_accounts
LANGUAGE plpgsql
AS $$
DECLARE
  v_account public.sandbox_game_accounts;
  v_wallet public.sandbox_game_wallets;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valid amount required';
  END IF;

  SELECT * INTO v_account
    FROM public.sandbox_game_accounts
    WHERE id = p_account_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game account not found';
  END IF;

  SELECT * INTO v_wallet
    FROM public.sandbox_game_wallets
    WHERE session_id = v_account.session_id
      AND game = v_account.game
    FOR UPDATE;

  IF NOT FOUND OR v_wallet.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient game loading balance';
  END IF;

  UPDATE public.sandbox_game_wallets
    SET balance = balance - p_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;

  IF v_account.game <> 'Golden Dragon' THEN
    UPDATE public.sandbox_game_accounts
      SET balance = balance + p_amount
      WHERE id = p_account_id
      RETURNING * INTO v_account;
  END IF;

  INSERT INTO public.sandbox_game_history (
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
