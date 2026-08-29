DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE TABLE trainee_sessions (
  id UUID PRIMARY KEY,
  trainee_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE sandbox_customers (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  balance NUMERIC NOT NULL CHECK (balance >= 0)
);

CREATE TABLE sandbox_game_accounts (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES sandbox_customers(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  game_username TEXT NOT NULL,
  password TEXT,
  balance NUMERIC NOT NULL CHECK (balance >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE sandbox_transaction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES sandbox_customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE sandbox_operations (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES sandbox_customers(id) ON DELETE CASCADE,
  game_account_id UUID REFERENCES sandbox_game_accounts(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount NUMERIC,
  customer_balance_at_request NUMERIC,
  game_balance_at_request NUMERIC,
  status TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by TEXT,
  is_correct BOOLEAN,
  processing_time_seconds NUMERIC,
  handling_started_at TIMESTAMP WITH TIME ZONE,
  handling_time_seconds NUMERIC,
  request_data JSONB
);

CREATE TABLE trainee_action_logs (
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

INSERT INTO trainee_sessions (id, trainee_name)
VALUES ('11111111-1111-4111-8111-111111111111', 'Neutral Fixture');

INSERT INTO sandbox_customers (
  id, session_id, username, first_name, last_name, email, balance
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'neutral_one', 'Neutral', 'One', 'neutral.one@example.test', 1000
);

INSERT INTO sandbox_game_accounts (
  id, session_id, customer_id, game, game_username, password, balance
)
VALUES
  (
    '33333333-3333-4333-8333-333333333331',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'Orion Stars', 'neutral_os', 'fixture-only', 100
  ),
  (
    '33333333-3333-4333-8333-333333333332',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'Vblink', 'neutral_vb', 'fixture-only', 200
  );

INSERT INTO sandbox_transaction_history (
  id, session_id, customer_id, type, amount, description
)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'GAME ADD CREDITS', 5, 'Orion Stars fixture action for neutral_os'
);
