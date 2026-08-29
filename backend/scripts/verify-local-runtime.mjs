import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { supabase } from '../src/config/supabase.js';
import { getSessionActionLog }
  from '../src/engine/AuditLogger.js';
import { buildSessionReport } from '../src/engine/SessionEngine.js';
import { createSandboxSession } from '../src/services/sandboxService.js';

const target = new URL(process.env.SUPABASE_URL);

assert.ok(
  ['127.0.0.1', 'localhost'].includes(target.hostname),
  'This verification is restricted to a loopback Supabase URL.'
);

let sessionId;

async function query(builder, message) {
  const { data, error } = await builder;
  assert.ifError(error, message);
  return data;
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  assert.ifError(error, `${name} failed`);
  return Array.isArray(data) ? data[0] : data;
}

function operation({
  session,
  customer,
  account,
  type,
  amount = null
}) {
  return {
    id: randomUUID(),
    session_id: session,
    customer_id: customer.id,
    game_account_id: account.id,
    game: account.game,
    type,
    amount,
    customer_balance_at_request: customer.balance,
    game_balance_at_request: account.balance,
    created_at: new Date().toISOString()
  };
}

try {
  const session = await createSandboxSession(
    'Local Data Verification'
  );
  sessionId = session.id;

  const customers = await query(
    supabase
      .from('sandbox_customers')
      .select('*')
      .eq('session_id', sessionId),
    'Could not read local customers'
  );

  const accounts = await query(
    supabase
      .from('sandbox_game_accounts')
      .select('*')
      .eq('session_id', sessionId),
    'Could not read local game accounts'
  );

  const wallets = await query(
    supabase
      .from('sandbox_game_wallets')
      .select('*')
      .eq('session_id', sessionId),
    'Could not read local game wallets'
  );

  assert.equal(customers.length, 7);
  assert.equal(accounts.length, customers.length * 3);
  assert.equal(wallets.length, 3);
  assert.ok(wallets.every(wallet => Number(wallet.balance) >= 20000));

  const customer = customers[0];
  const orion = accounts.find(account => (
    account.customer_id === customer.id &&
    account.game === 'Orion Stars'
  ));
  const vblink = accounts.find(account => (
    account.customer_id === customer.id &&
    account.game === 'Vblink'
  ));

  assert.ok(orion && vblink);

  const openingCustomerBalance = Number(customer.balance);
  const openingAccountBalance = Number(orion.balance);
  const openingWalletBalance = Number(
    wallets.find(wallet => wallet.game === 'Orion Stars').balance
  );

  const backendHistoryBefore = await query(
    supabase
      .from('sandbox_transaction_history')
      .select('id')
      .eq('session_id', sessionId)
      .eq('customer_id', customer.id),
    'Could not read Backend history'
  );

  const gameHistoryBefore = await query(
    supabase
      .from('sandbox_game_history')
      .select('id')
      .eq('session_id', sessionId)
      .eq('customer_id', customer.id),
    'Could not read game history'
  );

  const approvedAdd = operation({
    session: sessionId,
    customer,
    account: orion,
    type: 'ADD CREDITS',
    amount: 25
  });

  await rpc('create_reserved_sandbox_operation', {
    p_operation: approvedAdd
  });

  let currentCustomer = await query(
    supabase
      .from('sandbox_customers')
      .select('balance')
      .eq('id', customer.id)
      .single(),
    'Could not read reserved customer balance'
  );

  assert.equal(
    Number(currentCustomer.balance),
    openingCustomerBalance - 25
  );

  const duplicateMovement = operation({
    session: sessionId,
    customer,
    account: vblink,
    type: 'WITHDRAW CREDITS',
    amount: 10
  });

  const { error: duplicateMovementError } = await supabase.rpc(
    'create_reserved_sandbox_operation',
    { p_operation: duplicateMovement }
  );
  assert.equal(duplicateMovementError?.code, '23505');

  await rpc('recharge_sandbox_game_account', {
    p_account_id: orion.id,
    p_amount: 25,
    p_description: JSON.stringify({
      kind: 'LOCAL_VERIFICATION',
      game: 'Orion Stars',
      mobileId: orion.game_username
    })
  });

  const duplicateSettlements = await Promise.all([
    supabase.rpc('settle_backend_movement_operation', {
      p_operation_id: approvedAdd.id,
      p_action: 'APPROVED',
      p_trainee_name: 'Local Verification A',
      p_cancellation_reason: null
    }),
    supabase.rpc('settle_backend_movement_operation', {
      p_operation_id: approvedAdd.id,
      p_action: 'APPROVED',
      p_trainee_name: 'Local Verification B',
      p_cancellation_reason: null
    })
  ]);
  assert.equal(
    duplicateSettlements.filter(result => !result.error).length,
    1
  );
  assert.equal(
    duplicateSettlements.filter(result =>
      /operation already processed/i.test(
        result.error?.message || ''
      )
    ).length,
    1
  );

  currentCustomer = await query(
    supabase
      .from('sandbox_customers')
      .select('balance')
      .eq('id', customer.id)
      .single(),
    'Could not read committed customer balance'
  );
  assert.equal(
    Number(currentCustomer.balance),
    openingCustomerBalance - 25
  );

  const approvedOperation = await query(
    supabase
      .from('sandbox_operations')
      .select('is_correct, customer_reservation_status, cancellation_reason')
      .eq('id', approvedAdd.id)
      .single(),
    'Could not read the approved movement'
  );
  assert.equal(approvedOperation.is_correct, true);
  assert.equal(
    approvedOperation.customer_reservation_status,
    'COMMITTED'
  );
  assert.equal(approvedOperation.cancellation_reason, null);

  const cancelledAdd = operation({
    session: sessionId,
    customer: {
      ...customer,
      balance: currentCustomer.balance
    },
    account: vblink,
    type: 'ADD CREDITS',
    amount: 30
  });

  await rpc('create_reserved_sandbox_operation', {
    p_operation: cancelledAdd
  });

  const { error: missingReasonError } = await supabase.rpc(
    'settle_backend_movement_operation',
    {
      p_operation_id: cancelledAdd.id,
      p_action: 'CANCELLED',
      p_trainee_name: 'Local Verification',
      p_cancellation_reason: '   '
    }
  );
  assert.match(
    missingReasonError?.message || '',
    /cancellation reason is required/i
  );

  const pendingAfterMissingReason = await query(
    supabase
      .from('sandbox_operations')
      .select('status, customer_reservation_status')
      .eq('id', cancelledAdd.id)
      .single(),
    'Could not verify rollback after a missing cancellation reason'
  );
  assert.equal(pendingAfterMissingReason.status, 'PENDING');
  assert.equal(
    pendingAfterMissingReason.customer_reservation_status,
    'HELD'
  );

  await rpc('settle_backend_movement_operation', {
    p_operation_id: cancelledAdd.id,
    p_action: 'CANCELLED',
    p_trainee_name: 'Local Verification',
    p_cancellation_reason: '  Duplicate request  '
  });

  const cancelledOperation = await query(
    supabase
      .from('sandbox_operations')
      .select('cancellation_reason, is_correct, customer_reservation_status')
      .eq('id', cancelledAdd.id)
      .single(),
    'Could not read the cancelled movement'
  );
  assert.equal(
    cancelledOperation.cancellation_reason,
    'Duplicate request'
  );
  assert.equal(cancelledOperation.is_correct, false);
  assert.equal(
    cancelledOperation.customer_reservation_status,
    'RELEASED'
  );

  currentCustomer = await query(
    supabase
      .from('sandbox_customers')
      .select('balance')
      .eq('id', customer.id)
      .single(),
    'Could not read released customer balance'
  );
  assert.equal(
    Number(currentCustomer.balance),
    openingCustomerBalance - 25
  );

  await rpc('recharge_sandbox_game_account', {
    p_account_id: orion.id,
    p_amount: 50,
    p_description: JSON.stringify({
      kind: 'LOCAL_VERIFICATION',
      game: 'Orion Stars'
    })
  });

  const rechargedAccount = await query(
    supabase
      .from('sandbox_game_accounts')
      .select('balance')
      .eq('id', orion.id)
      .single(),
    'Could not read recharged game account'
  );

  const debitedWallet = await query(
    supabase
      .from('sandbox_game_wallets')
      .select('balance')
      .eq('session_id', sessionId)
      .eq('game', 'Orion Stars')
      .single(),
    'Could not read game loading wallet'
  );

  assert.equal(Number(rechargedAccount.balance), openingAccountBalance + 75);
  assert.equal(Number(debitedWallet.balance), openingWalletBalance - 75);

  const backendHistoryAfter = await query(
    supabase
      .from('sandbox_transaction_history')
      .select('id')
      .eq('session_id', sessionId)
      .eq('customer_id', customer.id),
    'Could not verify Backend history'
  );

  const gameHistoryAfter = await query(
    supabase
      .from('sandbox_game_history')
      .select('id')
      .eq('session_id', sessionId)
      .eq('customer_id', customer.id),
    'Could not verify game history'
  );

  assert.equal(
    backendHistoryAfter.length,
    backendHistoryBefore.length + 2
  );
  assert.equal(
    gameHistoryAfter.length,
    gameHistoryBefore.length + 2
  );

  const auditLog = await getSessionActionLog(sessionId);
  assert.equal(auditLog.length, 2);
  assert.ok(
    auditLog.some(item => item.operation_id === approvedAdd.id)
  );
  assert.ok(
    auditLog.some(item => item.operation_id === cancelledAdd.id)
  );

  const report = await buildSessionReport(sessionId);
  assert.equal(report.session.id, sessionId);
  assert.ok(
    report.operations.some(item => item.id === approvedAdd.id)
  );

  const orionRequest = operation({
    session: sessionId,
    customer,
    account: orion,
    type: 'REFRESH BALANCE'
  });
  const vblinkRequest = operation({
    session: sessionId,
    customer,
    account: vblink,
    type: 'RESET PASSWORD'
  });

  await rpc('create_reserved_sandbox_operation', {
    p_operation: orionRequest
  });
  await rpc('create_reserved_sandbox_operation', {
    p_operation: vblinkRequest
  });

  const sameGameRequest = operation({
    session: sessionId,
    customer,
    account: orion,
    type: 'CREATE ACCOUNT'
  });

  const { error: sameGameError } = await supabase.rpc(
    'create_reserved_sandbox_operation',
    { p_operation: sameGameRequest }
  );
  assert.equal(sameGameError?.code, '23505');

  console.log([
    'Local data verification passed:',
    '- 7 seeded customers and 3 independent game wallets',
    '- game wallets open at 20,000 or more',
    '- one pending movement per customer',
    '- requests coexist across games but not within the same game',
    '- ADD CREDITS reserves, commits without a second debit, and restores on cancel',
    '- concurrent duplicate settlement produces one winner and one conflict',
    '- cancellation reasons are trimmed, persisted, and excluded from scoring',
    '- Backend customer history and game history remain separate',
    '- trainer audit and provisional report data load from the local stack'
  ].join('\n'));
} finally {
  if (sessionId) {
    const { error } = await supabase
      .from('trainee_sessions')
      .delete()
      .eq('id', sessionId);
    assert.ifError(error, 'Could not clean up the local verification session');
  }
}
