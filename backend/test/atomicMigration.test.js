import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const walletMigrationUrl = new URL(
  '../migrations/0001_separate_histories_wallets_and_reservations.sql',
  import.meta.url
);
const settlementMigrationUrl = new URL(
  '../../supabase/migrations/20260830000000_atomic_backend_movement_settlement.sql',
  import.meta.url
);
const operationServiceUrl = new URL(
  '../src/services/operationService.js',
  import.meta.url
);
const gameServiceUrl = new URL(
  '../src/services/gameSimulationService.js',
  import.meta.url
);

test('game movements mutate balance and history inside one locked RPC', async () => {
  const [migration, service] =
    await Promise.all([
      readFile(walletMigrationUrl, 'utf8'),
      readFile(gameServiceUrl, 'utf8')
    ]);

  const functionSql = migration.slice(
    migration.indexOf(
      'CREATE OR REPLACE FUNCTION recharge_sandbox_game_account'
    )
  );

  assert.match(functionSql, /FOR UPDATE/i);
  assert.match(
    functionSql,
    /UPDATE sandbox_game_accounts/i
  );
  assert.match(
    functionSql,
    /INSERT INTO sandbox_game_history/i
  );
  assert.match(
    service,
    /\.rpc\(\s*'recharge_sandbox_game_account'/
  );
  assert.match(
    service,
    /\.rpc\(\s*'redeem_sandbox_game_account'/
  );
  assert.match(
    functionSql,
    /redeem_sandbox_game_account[\s\S]*Game loading wallet not found/i
  );
});

test('Backend movement settlement is locked and computes scoring in PostgreSQL', async () => {
  const [migration, service] =
    await Promise.all([
      readFile(settlementMigrationUrl, 'utf8'),
      readFile(operationServiceUrl, 'utf8')
    ]);

  const functionSql = migration.slice(
    migration.indexOf(
      'CREATE OR REPLACE FUNCTION public.settle_backend_movement_operation'
    )
  );

  assert.match(functionSql, /FOR UPDATE/i);
  assert.match(
    functionSql,
    /SELECT EXISTS[\s\S]*sandbox_game_history/i
  );
  assert.match(
    functionSql,
    /UPDATE public\.sandbox_customers[\s\S]*balance = balance [+-] v_operation\.amount/i
  );
  assert.match(
    functionSql,
    /INSERT INTO public\.sandbox_transaction_history/i
  );
  assert.match(
    functionSql,
    /INSERT INTO public\.trainee_action_logs/i
  );
  assert.doesNotMatch(
    functionSql,
    /p_is_correct/i
  );
  assert.match(
    functionSql,
    /customer_reservation_status[\s\S]*'COMMITTED'[\s\S]*'RELEASED'/i
  );
  assert.match(
    functionSql,
    /cancellation_reason = v_reason/i
  );
  assert.match(
    service,
    /\.rpc\(\s*'settle_backend_movement_operation'/
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.settle_reserved_add_credits_operation/i
  );
});

test('already-processed movement responses use the stable conflict contract', async () => {
  const service = await readFile(
    operationServiceUrl,
    'utf8'
  );

  assert.match(
    service,
    /statusCode = 409/
  );
  assert.match(
    service,
    /OPERATION_ALREADY_PROCESSED/
  );
});
