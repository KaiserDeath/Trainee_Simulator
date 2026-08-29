DO $$
DECLARE
  v_balance NUMERIC;
  v_wallet NUMERIC;
  v_player NUMERIC;
  v_count INTEGER;
BEGIN
  SELECT balance INTO v_wallet
  FROM sandbox_game_wallets
  WHERE session_id = '11111111-1111-4111-8111-111111111111'
    AND game = 'Orion Stars';
  IF v_wallet <> 20000 THEN
    RAISE EXCEPTION 'Expected Orion Stars wallet seed 20000, got %', v_wallet;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM sandbox_game_history
  WHERE id = '44444444-4444-4444-8444-444444444444'
    AND game = 'Orion Stars';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Legacy game history was not moved and correlated';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM sandbox_transaction_history
  WHERE type LIKE 'GAME %';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Game rows leaked into customer movement history';
  END IF;

  PERFORM create_reserved_sandbox_operation(jsonb_build_object(
    'id', '55555555-5555-4555-8555-555555555551',
    'session_id', '11111111-1111-4111-8111-111111111111',
    'customer_id', '22222222-2222-4222-8222-222222222222',
    'game_account_id', '33333333-3333-4333-8333-333333333331',
    'game', 'Orion Stars',
    'type', 'ADD CREDITS',
    'amount', 100,
    'customer_balance_at_request', 1000,
    'game_balance_at_request', 100,
    'created_at', NOW()
  ));

  SELECT balance INTO v_balance
  FROM sandbox_customers
  WHERE id = '22222222-2222-4222-8222-222222222222';
  IF v_balance <> 900 THEN
    RAISE EXCEPTION 'Add Credits reservation expected balance 900, got %', v_balance;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM sandbox_operations
  WHERE id = '55555555-5555-4555-8555-555555555551'
    AND queue_policy_version = 1;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'New operation was not bound to queue policy version 1';
  END IF;

  PERFORM create_reserved_sandbox_operation(jsonb_build_object(
    'id', '55555555-5555-4555-8555-555555555552',
    'session_id', '11111111-1111-4111-8111-111111111111',
    'customer_id', '22222222-2222-4222-8222-222222222222',
    'game_account_id', '33333333-3333-4333-8333-333333333331',
    'game', 'Orion Stars',
    'type', 'RESET PASSWORD',
    'created_at', NOW()
  ));

  BEGIN
    PERFORM create_reserved_sandbox_operation(jsonb_build_object(
      'id', '55555555-5555-4555-8555-555555555553',
      'session_id', '11111111-1111-4111-8111-111111111111',
      'customer_id', '22222222-2222-4222-8222-222222222222',
      'game_account_id', '33333333-3333-4333-8333-333333333331',
      'game', 'Orion Stars',
      'type', 'REFRESH BALANCE',
      'created_at', NOW()
    ));
    RAISE EXCEPTION 'Same-customer same-game request was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  PERFORM create_reserved_sandbox_operation(jsonb_build_object(
    'id', '55555555-5555-4555-8555-555555555554',
    'session_id', '11111111-1111-4111-8111-111111111111',
    'customer_id', '22222222-2222-4222-8222-222222222222',
    'game_account_id', '33333333-3333-4333-8333-333333333332',
    'game', 'Vblink',
    'type', 'CREATE ACCOUNT',
    'created_at', NOW()
  ));

  BEGIN
    PERFORM create_reserved_sandbox_operation(jsonb_build_object(
      'id', '55555555-5555-4555-8555-555555555555',
      'session_id', '11111111-1111-4111-8111-111111111111',
      'customer_id', '22222222-2222-4222-8222-222222222222',
      'game_account_id', '33333333-3333-4333-8333-333333333332',
      'game', 'Vblink',
      'type', 'WITHDRAW CREDITS',
      'amount', 10,
      'created_at', NOW()
    ));
    RAISE EXCEPTION 'Second movement for the same customer was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  PERFORM settle_reserved_add_credits_operation(
    '55555555-5555-4555-8555-555555555551',
    'APPROVED', 'Neutral Trainee', TRUE, 5, NOW(), 2,
    'Approved neutral Add Credits fixture'
  );

  SELECT balance INTO v_balance
  FROM sandbox_customers
  WHERE id = '22222222-2222-4222-8222-222222222222';
  IF v_balance <> 900 THEN
    RAISE EXCEPTION 'Approval debited reservation twice; balance %', v_balance;
  END IF;

  BEGIN
    PERFORM settle_reserved_add_credits_operation(
      '55555555-5555-4555-8555-555555555551',
      'CANCELLED', 'Neutral Trainee', FALSE, 6, NOW(), 3,
      'Invalid duplicate settlement fixture'
    );
    RAISE EXCEPTION 'Duplicate reservation settlement was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Duplicate reservation settlement was accepted' THEN
      RAISE;
    END IF;
  END;

  INSERT INTO sandbox_customers (
    id, session_id, username, balance
  ) VALUES (
    '66666666-6666-4666-8666-666666666666',
    '11111111-1111-4111-8111-111111111111',
    'neutral_two', 500
  );

  INSERT INTO sandbox_game_accounts (
    id, session_id, customer_id, game, game_username, balance
  ) VALUES (
    '77777777-7777-4777-8777-777777777777',
    '11111111-1111-4111-8111-111111111111',
    '66666666-6666-4666-8666-666666666666',
    'Orion Stars', 'neutral_two_os', 50
  );

  PERFORM create_reserved_sandbox_operation(jsonb_build_object(
    'id', '88888888-8888-4888-8888-888888888888',
    'session_id', '11111111-1111-4111-8111-111111111111',
    'customer_id', '66666666-6666-4666-8666-666666666666',
    'game_account_id', '77777777-7777-4777-8777-777777777777',
    'game', 'Orion Stars',
    'type', 'ADD CREDITS',
    'amount', 50,
    'created_at', NOW()
  ));

  PERFORM settle_reserved_add_credits_operation(
    '88888888-8888-4888-8888-888888888888',
    'CANCELLED', 'Neutral Trainee', TRUE, 4, NOW(), 2,
    'Cancelled neutral Add Credits fixture'
  );

  SELECT balance INTO v_balance
  FROM sandbox_customers
  WHERE id = '66666666-6666-4666-8666-666666666666';
  IF v_balance <> 500 THEN
    RAISE EXCEPTION 'Cancellation did not restore balance exactly once; got %', v_balance;
  END IF;

  PERFORM recharge_sandbox_game_account(
    '33333333-3333-4333-8333-333333333331', 40,
    'Orion Stars neutral purchase fixture'
  );
  PERFORM redeem_sandbox_game_account(
    '33333333-3333-4333-8333-333333333331', 10,
    'Orion Stars neutral redeem fixture'
  );

  SELECT balance INTO v_wallet
  FROM sandbox_game_wallets
  WHERE session_id = '11111111-1111-4111-8111-111111111111'
    AND game = 'Orion Stars';
  SELECT balance INTO v_player
  FROM sandbox_game_accounts
  WHERE id = '33333333-3333-4333-8333-333333333331';
  SELECT balance INTO v_balance
  FROM sandbox_customers
  WHERE id = '22222222-2222-4222-8222-222222222222';

  IF v_wallet <> 19970 OR v_player <> 130 OR v_balance <> 900 THEN
    RAISE EXCEPTION
      'Balance domains crossed: wallet %, player %, customer %',
      v_wallet, v_player, v_balance;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM sandbox_game_history
  WHERE type IN ('GAME ADD CREDITS', 'GAME WITHDRAW CREDITS');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Expected three isolated game history rows, got %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM sandbox_transaction_history
  WHERE type = 'ADD CREDITS';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Expected two Backend movement history rows, got %', v_count;
  END IF;

  INSERT INTO trainee_action_logs (
    session_id,
    trainee_name,
    operation_id,
    action_type,
    details
  ) VALUES (
    '11111111-1111-4111-8111-111111111111',
    'Neutral Trainee',
    '55555555-5555-4555-8555-555555555551',
    'APPROVED',
    '{"fixture":true}'::JSONB
  );

  SELECT COUNT(*) INTO v_count
  FROM trainee_action_logs
  WHERE session_id = '11111111-1111-4111-8111-111111111111'
    AND action_type = 'APPROVED';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Trainer audit insert/read path failed';
  END IF;
END;
$$;

SELECT 'milestone0_database_integration_passed' AS result;
