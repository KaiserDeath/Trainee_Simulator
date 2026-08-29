import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../migrations/0001_separate_histories_wallets_and_reservations.sql',
  import.meta.url,
);

const sql = await readFile(migrationUrl, 'utf8');

test('refuses to reinterpret pending operations in active sessions', () => {
  assert.match(
    sql,
    /IF EXISTS \([\s\S]*FROM sandbox_operations AS operation[\s\S]*JOIN trainee_sessions AS session[\s\S]*operation\.status = 'PENDING'[\s\S]*session\.status = 'active'[\s\S]*RAISE EXCEPTION/i,
  );
});

test('preserves historical pending rows outside the new queue policy version', () => {
  assert.match(
    sql,
    /queue_policy_version SMALLINT NOT NULL DEFAULT 0/i,
  );
  assert.match(
    sql,
    /uq_pending_movement_per_customer[\s\S]*queue_policy_version = 1/i,
  );
  assert.match(
    sql,
    /uq_pending_request_per_customer_game[\s\S]*queue_policy_version = 1/i,
  );
});

test('separates customer movement history from game history', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sandbox_game_history/i);
  assert.match(sql, /INSERT INTO sandbox_game_history/i);
  assert.match(sql, /INSERT INTO sandbox_transaction_history/i);
  assert.match(
    sql,
    /DELETE FROM sandbox_transaction_history AS history[\s\S]*history\.type LIKE 'GAME %'[\s\S]*EXISTS \([\s\S]*FROM sandbox_game_history AS copied/i,
  );
  assert.match(
    sql,
    /CASE WHEN COUNT\(\*\) = 1[\s\S]*candidate\.game_username/i,
  );
});

test('carries the trainer audit prerequisites in the numbered migration', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS trainee_action_logs/i);
  assert.match(sql, /handling_started_at TIMESTAMP WITH TIME ZONE/i);
  assert.match(sql, /customer_balance_at_request NUMERIC/i);
});

test('creates a per-session game wallet and atomic game balance RPCs', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sandbox_game_wallets/i);
  assert.match(sql, /UNIQUE \(session_id, game\)/i);
  assert.match(
    sql,
    /SELECT DISTINCT\s+session_id,\s+game,\s+20000\s+FROM sandbox_game_accounts/i,
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION recharge_sandbox_game_account/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION redeem_sandbox_game_account/i);
  assert.match(sql, /Insufficient game loading balance/i);
  assert.match(
    sql,
    /redeem_sandbox_game_account[\s\S]*Game loading wallet not found/i,
  );
});

test('enforces seed-safe pending operation occupancy by customer and game', () => {
  assert.match(
    sql,
    /uq_pending_movement_per_customer[\s\S]*ON sandbox_operations\(session_id, customer_id\)/i,
  );
  assert.match(
    sql,
    /uq_pending_request_per_customer_game[\s\S]*ON sandbox_operations\(session_id, customer_id, game\)/i,
  );
});

test('reserves ADD CREDITS once and releases only on cancellation', () => {
  assert.match(sql, /create_reserved_sandbox_operation/i);
  assert.match(sql, /SET balance = balance - v_amount/i);
  assert.match(sql, /customer_reservation_status[\s\S]*'HELD'/i);
  assert.match(sql, /settle_reserved_add_credits_operation/i);
  assert.match(sql, /IF p_action = 'CANCELLED'[\s\S]*SET balance = balance \+ v_operation\.reserved_customer_amount/i);
  assert.match(sql, /'APPROVED' THEN 'COMMITTED' ELSE 'RELEASED'/i);
});
