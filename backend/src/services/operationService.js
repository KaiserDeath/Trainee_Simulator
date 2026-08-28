import { supabase }
  from '../config/supabase.js';

import {
  evaluateOperation,
  evaluateRequestOperation,
  isRequestOperation,
  isValidAction,
  MOVEMENT_TYPES
} from './scoringService.js';

import {
  hasCreatedAccount,
  hasMatchingGameAction
} from './gameSimulationService.js';

import {
  getOperationHandlingStart,
  logActionEvent
} from '../engine/AuditLogger.js';

import {
  getMovementCancellationReason
} from './operationPolicy.js';

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

function operationAlreadyProcessed() {
  const error = new Error(
    'Operation already processed'
  );
  error.statusCode = 409;
  error.code =
    'OPERATION_ALREADY_PROCESSED';
  return error;
}

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
    throw operationAlreadyProcessed();
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
    const gameWasRecharged =
      await hasMatchingGameAction({
        operation,
        type: 'GAME ADD CREDITS'
      });

    return gameWasRecharged;
  }

  if (
    operation.type ===
    'WITHDRAW CREDITS'
  ) {
    const hasGameWithdraw =
      await hasMatchingGameAction({
        operation,
        type: 'GAME WITHDRAW CREDITS'
      });

    return hasGameWithdraw;
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
  processingSeconds,
  cancellationReason
}) {
  const updates = {
    status: action,
    processed_at:
      new Date().toISOString(),
    processed_by: traineeName,
    is_correct: isCorrect,
    processing_time_seconds:
      processingSeconds,
    cancellation_reason:
      cancellationReason || null
  };

  const { data, error } = await supabase
    .from('sandbox_operations')
    .update(updates)
    .eq('id', operation.id)
    .eq('status', 'PENDING')
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw operationAlreadyProcessed();
  }

  return data;
}

function buildAuditHistoryDescription({
  operation,
  action,
  traineeName,
  requestData,
  isCorrect,
  cancellationReason
}) {
  const details =
    isRequestOperation(operation.type)
      ? ` Submitted data: ${JSON.stringify(requestData)}.`
      : '';

  const cancellationDetails =
    cancellationReason
      ? ` Cancellation reason: ${cancellationReason}.`
      : '';

  const plainDescription = `Operation ${action} by ${traineeName}. Correct: ${isCorrect}.${details}${cancellationDetails}`;

  let description = plainDescription;

  if (!isRequestOperation(operation.type)) {
    const descriptionObj = {
      kind: 'MOVEMENT_HISTORY',
      operationCode: operation.operation_code || String(operation.id).slice(0, 8).toUpperCase(),
      playerId: operation.game_account?.game_username || '',
      playerEmail: operation.customer?.email || '',
      game: operation.game_account?.game || '',
      requestedAt: operation.created_at,
      acceptedAt: new Date().toISOString(),
      manager: traineeName,
      status: action === 'APPROVED' ? 'Approved' : 'Cancelled',
      isCorrect,
      cancellationReason,
      details: plainDescription
    };
    description = JSON.stringify(descriptionObj);
  }

  return description;
}

async function createAuditHistory(context) {
  const { operation } = context;
  const description =
    buildAuditHistoryDescription(context);

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
      description
    });

  if (error) {
    throw error;
  }
}

function throwMovementSettlementError(error) {
  if (/operation already processed/i.test(error.message)) {
    throw operationAlreadyProcessed();
  }

  if (/operation not found/i.test(error.message)) {
    error.statusCode = 404;
    error.code = 'OPERATION_NOT_FOUND';
  } else if (
    /invalid action|required|must be|insufficient|session is no longer active|reserved movement/i
      .test(error.message)
  ) {
    error.statusCode = 400;
  }

  throw error;
}

async function settleAtomicMovement({
  operation,
  action,
  traineeName,
  cancellationReason
}) {
  const { data, error } = await supabase.rpc(
    'settle_backend_movement_operation',
    {
      p_operation_id: operation.id,
      p_action: action,
      p_trainee_name: traineeName,
      p_cancellation_reason:
        cancellationReason
    }
  );

  if (error) {
    throwMovementSettlementError(error);
  }

  return data;
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

async function saveHandlingMetrics({
  operationId,
  handlingStartedAt,
  handlingSeconds
}) {
  const fields = {
    handling_started_at:
      handlingStartedAt,
    handling_time_seconds:
      handlingSeconds
  };

  for (const fieldName of Object.keys(fields)) {
    const { error } = await supabase
      .from('sandbox_operations')
      .update({
        [fieldName]: fields[fieldName]
      })
      .eq('id', operationId);

    if (!error) {
      continue;
    }

    const isMissingField =
      /column .* does not exist|no such column|field .* not found/i
        .test(error.message);

    if (!isMissingField) {
      throw error;
    }
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

  const cancellationReason =
    getMovementCancellationReason({
      operation,
      action,
      requestData
    });

  if (MOVEMENT_TYPES.includes(operation.type)) {
    return settleAtomicMovement({
      operation,
      action,
      traineeName,
      cancellationReason
    });
  }

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

  const handlingStartedAt =
    await getOperationHandlingStart({
      sessionId: operation.session_id,
      operationId: operation.id
    });
  const handlingSeconds =
    handlingStartedAt
      ? (
          Date.now() -
          new Date(
            handlingStartedAt
          ).getTime()
        ) / 1000
      : null;

  const updatedOperation =
    await markOperationProcessed({
      operation,
      action,
      traineeName,
      isCorrect,
      processingSeconds,
      cancellationReason
    });

  await saveRequestPayload(
    operation.id,
    requestData
  );

  await saveHandlingMetrics({
    operationId: operation.id,
    handlingStartedAt,
    handlingSeconds
  });

  await createAuditHistory({
    operation,
    action,
    traineeName,
    requestData,
    isCorrect,
    cancellationReason
  });

  await logActionEvent({
    sessionId: operation.session_id,
    traineeName,
    operationId: operation.id,
    actionType: action,
    details: {
      operationType: operation.type,
      isCorrect,
      processingSeconds,
      handlingStartedAt,
      handlingSeconds,
      cancellationReason
    }
  });

  return {
    message: 'Operation processed',
    isCorrect,
    processingSeconds,
    operation: updatedOperation
  };
}
