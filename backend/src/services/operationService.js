import { supabase }
  from '../config/supabase.js';

import {
  evaluateOperation,
  evaluateRequestOperation,
  isRequestOperation,
  isValidAction
} from './scoringService.js';

import {
  hasCreatedAccount,
  hasMatchingGameAction
} from './gameSimulationService.js';

import {
  logActionEvent
} from '../engine/AuditLogger.js';

const operationSelect = `
  *,
  customer:sandbox_customers(
    username,
    first_name,
    last_name,
    email,
    balance
  ),
  game_account:sandbox_game_accounts(
    game,
    game_username,
    balance
  )
`;

const fullOperationSelect = `
  *,
  customer:sandbox_customers(*),
  game_account:sandbox_game_accounts(*)
`;

async function getSessionStatus(
  sessionId
) {
  const { data, error } = await supabase
    .from('trainee_sessions')
    .select('status')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    const notFound =
      new Error('Session not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  return data.status;
}

export async function getPendingOperations(
  sessionId
) {
  const sessionStatus = await getSessionStatus(
    sessionId
  );

  if (sessionStatus !== 'active') {
    return [];
  }

  const { data, error } = await supabase
    .from('sandbox_operations')
    .select(operationSelect)
    .eq('session_id', sessionId)
    .eq('status', 'PENDING')
    .order('created_at', {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data;
}

async function getOperationForProcessing(id) {
  const { data, error } = await supabase
    .from('sandbox_operations')
    .select(fullOperationSelect)
    .eq('id', id)
    .single();

  if (error || !data) {
    const notFound =
      new Error('Operation not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  if (data.status !== 'PENDING') {
    const alreadyProcessed =
      new Error(
        'Operation already processed'
      );
    alreadyProcessed.statusCode = 400;
    throw alreadyProcessed;
  }

  const sessionStatus = await getSessionStatus(
    data.session_id
  );

  if (sessionStatus !== 'active') {
    const inactiveError = new Error(
      'Session is no longer active'
    );
    inactiveError.statusCode = 400;
    throw inactiveError;
  }

  return data;
}

async function updateBalance(
  table,
  id,
  balance
) {
  const { error } = await supabase
    .from(table)
    .update({ balance })
    .eq('id', id);

  if (error) {
    throw error;
  }
}

async function applyMovementSideEffects(
  operation,
  action
) {
  if (action !== 'APPROVED') {
    return;
  }

  if (
    operation.type === 'ADD CREDITS'
  ) {
    await updateBalance(
      'sandbox_customers',
      operation.customer_id,
      Number(
        operation.customer.balance
      ) - Number(operation.amount)
    );

  }

  if (
    operation.type ===
    'WITHDRAW CREDITS'
  ) {
    await updateBalance(
      'sandbox_customers',
      operation.customer_id,
      Number(
        operation.customer.balance
      ) + Number(operation.amount)
    );

  }
}

async function evaluateGameBackofficeWork(
  operation,
  action,
  requestData
) {
  if (
    action === 'CANCELLED'
  ) {
    return evaluateOperation(
      operation,
      action,
      requestData
    );
  }

  if (
    operation.type === 'ADD CREDITS'
  ) {
    const customerCanPay =
      Number(
        operation.customer?.balance
      ) >= Number(operation.amount);

    const gameWasRecharged =
      await hasMatchingGameAction({
        operation,
        type: 'GAME ADD CREDITS'
      });

    return (
      customerCanPay &&
      gameWasRecharged
    );
  }

  if (
    operation.type ===
    'WITHDRAW CREDITS'
  ) {
    const enoughGameBalance =
      Number(
        operation.game_account
          ?.balance
      ) >= Number(operation.amount);

    const hasGameWithdraw =
      await hasMatchingGameAction({
        operation,
        type: 'GAME WITHDRAW CREDITS'
      });

    return (
      enoughGameBalance &&
      hasGameWithdraw
    );
  }

  if (
    operation.type ===
    'CREATE ACCOUNT'
  ) {
    const created =
      await hasCreatedAccount({
        operation,
        requestData
      });

    return (
      created &&
      evaluateRequestOperation(
        operation,
        action,
        requestData
      )
    );
  }

  if (
    operation.type ===
    'RESET PASSWORD'
  ) {
    return (
      operation.game_account
        ?.password ===
        requestData.newPassword &&
      evaluateRequestOperation(
        operation,
        action,
        requestData
      )
    );
  }

  return evaluateOperation(
    operation,
    action,
    requestData
  );
}

async function updateGameAccountBalance(
  accountId,
  nextBalance
) {
  const { error } = await supabase
    .from('sandbox_game_accounts')
    .update({
      balance: nextBalance
    })
    .eq('id', accountId);

  if (error) {
    throw error;
  }
}

async function applyApprovalSideEffects(
  operation,
  action,
  isCorrect,
  requestData
) {
  if (
    action !== 'APPROVED' ||
    !isCorrect
  ) {
    return;
  }

  if (
    operation.type ===
    'REFRESH BALANCE'
  ) {
    const amount = Number(
      requestData.amount
    );

    if (
      Number.isFinite(amount) &&
      amount >= 0
    ) {
      await updateGameAccountBalance(
        operation.game_account_id,
        amount
      );
    }

    return;
  }

  if (!isRequestOperation(operation.type)) {
    await applyMovementSideEffects(
      operation,
      action
    );
  }
}

function getProcessingSeconds(operation) {
  const created =
    new Date(
      operation.created_at
    ).getTime();

  return (
    Date.now() - created
  ) / 1000;
}

async function markOperationProcessed({
  operation,
  action,
  traineeName,
  isCorrect,
  processingSeconds
}) {
  const { data, error } = await supabase
    .from('sandbox_operations')
    .update({
      status: action,
      processed_at:
        new Date().toISOString(),
      processed_by: traineeName,
      is_correct: isCorrect,
      processing_time_seconds:
        processingSeconds
    })
    .eq('id', operation.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function createAuditHistory({
  operation,
  action,
  traineeName,
  requestData,
  isCorrect
}) {
  const details =
    isRequestOperation(operation.type)
      ? ` Submitted data: ${JSON.stringify(requestData)}.`
      : '';

  const { error } = await supabase
    .from(
      'sandbox_transaction_history'
    )
    .insert({
      session_id:
        operation.session_id,
      customer_id:
        operation.customer_id,
      type: operation.type,
      amount:
        operation.amount,
      description:
        `Operation ${action} by ${traineeName}. Correct: ${isCorrect}.${details}`
    });

  if (error) {
    throw error;
  }
}

async function saveRequestPayload(
  operationId,
  requestData
) {
  if (
    !requestData ||
    Object.keys(requestData).length === 0
  ) {
    return;
  }

  const trySave = async (fieldName) => {
    const payload = {};
    payload[fieldName] = requestData;

    const { error } = await supabase
      .from('sandbox_operations')
      .update(payload)
      .eq('id', operationId);

    return error;
  };

  const fieldNames = ['request_data', 'requestData'];

  for (const fieldName of fieldNames) {
    const error = await trySave(fieldName);
    if (!error) {
      return;
    }

    const isMissingField = /column .* does not exist|no such column|invalid input|field .* not found/i.test(error.message);
    if (isMissingField) {
      continue;
    }

    if (/request_data/i.test(error.message) || /requestData/i.test(error.message)) {
      continue;
    }

    throw error;
  }
}

export async function processOperation(
  operationId,
  payload
) {
  const {
    action,
    traineeName,
    requestData = {}
  } = payload;

  if (!action || !traineeName) {
    const error =
      new Error(
        'action and traineeName required'
      );
    error.statusCode = 400;
    throw error;
  }

  if (!isValidAction(action)) {
    const error =
      new Error('Invalid action');
    error.statusCode = 400;
    throw error;
  }

  const operation =
    await getOperationForProcessing(
      operationId
    );

  const isCorrect =
    await evaluateGameBackofficeWork(
      operation,
      action,
      requestData
    );

  await applyApprovalSideEffects(
    operation,
    action,
    isCorrect,
    requestData
  );

  const processingSeconds =
    getProcessingSeconds(operation);

  const updatedOperation =
    await markOperationProcessed({
      operation,
      action,
      traineeName,
      isCorrect,
      processingSeconds
    });

  await saveRequestPayload(
    operation.id,
    requestData
  );

  await createAuditHistory({
    operation,
    action,
    traineeName,
    requestData,
    isCorrect
  });

  await logActionEvent({
    sessionId: operation.session_id,
    traineeName,
    operationId: operation.id,
    actionType: action,
    details: {
      operationType: operation.type,
      isCorrect,
      processingSeconds
    }
  });

  return {
    message: 'Operation processed',
    isCorrect,
    processingSeconds,
    operation: updatedOperation
  };
}
