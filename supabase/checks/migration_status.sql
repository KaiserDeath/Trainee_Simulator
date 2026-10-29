-- Read-only: reports which migrations in supabase/migrations are in effect on
-- this database. Each row checks for something only that migration leaves
-- behind (a table, column, index or function body), so a migration that was
-- skipped, or undone by re-running an older one, shows as MISSING.
-- Run it in the Supabase SQL editor; it changes nothing.

WITH fn AS (
  SELECT p.proname, p.prosrc
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
col AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
),
checks (migration, applied, rerun_safe) AS (
  VALUES
  ('20260820000000_prototype_baseline.sql',
    to_regclass('public.trainee_sessions') IS NOT NULL,
    false),
  ('20260820001000_milestone0_generated.sql',
    to_regclass('public.sandbox_game_wallets') IS NOT NULL
      AND to_regclass('public.sandbox_game_history') IS NOT NULL
      AND to_regclass('public.trainee_action_logs') IS NOT NULL,
    false),
  ('20260820002000_service_role_access.sql',
    CASE
      WHEN to_regclass('public.sandbox_customers') IS NULL THEN false
      WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN true
      ELSE NOT has_table_privilege('anon', 'public.sandbox_customers', 'SELECT')
    END,
    true),
  ('20260820003000_hub_foundation.sql',
    to_regclass('public.hub_identities') IS NOT NULL,
    false),
  ('20260821000000_hub_auth_governance.sql',
    to_regclass('public.hub_trainer_learner_assignments') IS NOT NULL,
    false),
  ('20260821001000_hub_auditor_reporting.sql',
    EXISTS (SELECT 1 FROM fn WHERE proname = 'hub_enforce_auditor_role_exclusivity'),
    false),
  ('20260821002000_hub_username_password_roles.sql',
    to_regclass('public.hub_identities_username_ci_unique') IS NOT NULL,
    false),
  ('20260825000000_orion_player_nickname.sql',
    EXISTS (SELECT 1 FROM col
            WHERE table_name = 'sandbox_game_accounts' AND column_name = 'nickname'),
    false),
  ('20260826000000_hub_focused_practice.sql',
    to_regclass('public.hub_practice_contexts') IS NOT NULL,
    false),
  ('20260826010000_hub_add_credits_practice.sql',
    EXISTS (SELECT 1 FROM fn WHERE proname = 'hub_recharge_add_credits_practice'),
    true),
  ('20260827000000_hub_withdraw_credits_practice.sql',
    EXISTS (SELECT 1 FROM fn WHERE proname = 'hub_redeem_withdraw_credits_practice'),
    true),
  ('20260828000000_hub_final_assessment.sql',
    to_regclass('public.hub_assessment_settings') IS NOT NULL,
    false),
  ('20260829000000_hub_scored_evaluation_governance.sql',
    to_regclass('public.hub_scored_evaluations') IS NOT NULL,
    false),
  ('20260830000000_atomic_backend_movement_settlement.sql',
    EXISTS (SELECT 1 FROM fn WHERE proname = 'settle_backend_movement_operation')
      AND EXISTS (SELECT 1 FROM col
                  WHERE table_name = 'sandbox_operations'
                    AND column_name = 'cancellation_reason'),
    true),
  ('20260925000000_golden_dragon_purchase_entries_only.sql',
    EXISTS (SELECT 1 FROM fn
            WHERE proname = 'recharge_sandbox_game_account'
              AND prosrc LIKE '%Golden Dragon%'),
    true),
  ('20260929000000_movement_difficulty_scenarios.sql',
    EXISTS (SELECT 1 FROM col
            WHERE table_name = 'sandbox_operations'
              AND column_name = 'movement_scenario')
      AND EXISTS (SELECT 1 FROM fn
                  WHERE proname = 'settle_backend_movement_operation'
                    AND prosrc LIKE '%ALREADY_PROCESSED%'),
    true),
  ('20261029000000_pending_reconciliation.sql',
    EXISTS (SELECT 1 FROM col
            WHERE table_name = 'sandbox_operations'
              AND column_name = 'bot_applied')
      AND EXISTS (SELECT 1 FROM fn
                  WHERE proname = 'settle_backend_movement_operation'
                    AND prosrc LIKE '%PENDING_RECONCILIATION%'),
    true)
)
SELECT
  migration,
  CASE WHEN applied THEN 'OK' ELSE 'MISSING' END AS status,
  CASE
    WHEN applied THEN ''
    WHEN rerun_safe THEN 'Run this file (safe to re-run)'
    ELSE 'Run this file once; it fails if it already partly ran'
  END AS action
FROM checks
-- Apply MISSING files in this order; for 20260830/20260925/20260929/20261029 use
-- supabase/checks/catch_up_simulator_migrations.sql instead.
ORDER BY migration;
