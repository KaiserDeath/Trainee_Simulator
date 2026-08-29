-- Local prototype baseline required by the application before Milestone 0.
-- Product policy is intentionally not encoded in this schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE trainee_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER DEFAULT 30
);

CREATE TABLE sandbox_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  balance NUMERIC NOT NULL CHECK (balance >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE sandbox_game_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trainee_sessions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES sandbox_customers(id) ON DELETE CASCADE,
  game_account_id UUID REFERENCES sandbox_game_accounts(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by TEXT,
  is_correct BOOLEAN,
  processing_time_seconds NUMERIC,
  request_data JSONB
);

CREATE TABLE simulator_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trainee_sessions_started_at
  ON trainee_sessions(started_at DESC);

CREATE INDEX idx_sandbox_customers_session
  ON sandbox_customers(session_id);

CREATE INDEX idx_sandbox_game_accounts_session_customer
  ON sandbox_game_accounts(session_id, customer_id);

CREATE INDEX idx_sandbox_transaction_history_customer_time
  ON sandbox_transaction_history(session_id, customer_id, created_at DESC);

CREATE INDEX idx_sandbox_operations_session_status
  ON sandbox_operations(session_id, status, created_at);

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
