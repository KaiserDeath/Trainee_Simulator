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


