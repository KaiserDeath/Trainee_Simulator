import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../src/seed/migrations.sql',
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
      readFile(migrationUrl, 'utf8'),
      readFile(gameServiceUrl, 'utf8')
    ]);

  const functionSql = migration.slice(
    migration.indexOf(
      'CREATE OR REPLACE FUNCTION apply_sandbox_game_movement'
    ),
    migration.indexOf(
      '-- Parse legacy history descriptions'
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
    /\.rpc\(\s*'apply_sandbox_game_movement'/
  );
});

test('Backend movement settlement is locked and computes scoring in PostgreSQL', async () => {
  const [migration, service] =
    await Promise.all([
      readFile(migrationUrl, 'utf8'),
      readFile(operationServiceUrl, 'utf8')
    ]);

  const functionSql = migration.slice(
    migration.indexOf(
      'CREATE OR REPLACE FUNCTION settle_backend_movement_operation'
    ),
    migration.indexOf(
      '-- Create simulator_settings table'
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
    service,
    /\.rpc\(\s*'settle_backend_movement_operation'/
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
