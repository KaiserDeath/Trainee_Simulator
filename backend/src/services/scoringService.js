export const VALID_OPERATION_ACTIONS = [
  'APPROVED',
  'CANCELLED'
];

export const REQUEST_TYPES = [
  'CREATE ACCOUNT',
  'RESET PASSWORD',
  'REFRESH BALANCE'
];

export const MOVEMENT_TYPES = [
  'ADD CREDITS',
  'WITHDRAW CREDITS'
];

const GAME_KIOSKS = {
  'Orion Stars': 'OrionStars',
  Vblink: 'Vblink',
  'Golden Dragon': 'GoldenDragon'
};

const normalizeText = value =>
  String(value ?? '').trim();

const normalizeNumber = value =>
  Number(value);

function getGameBalanceAtRequest(
  operation
) {
  const snapshot =
    Number(
      operation.game_balance_at_request
    );

  if (Number.isFinite(snapshot)) {
    return snapshot;
  }

  return Number(
    operation.game_account?.balance
  );
}

export function isValidAction(action) {
  return VALID_OPERATION_ACTIONS.includes(
    action
  );
}

export function isRequestOperation(type) {
  return REQUEST_TYPES.includes(type);
}

export function evaluateMovementOperation(
  operation,
  action
) {
  if (
    operation.type === 'ADD CREDITS'
  ) {
    return action === 'APPROVED';
  }

  if (
    operation.type ===
    'WITHDRAW CREDITS'
  ) {
    const shouldApprove =
      getGameBalanceAtRequest(
        operation
      ) >= Number(operation.amount);

    return (
      action ===
        (shouldApprove
          ? 'APPROVED'
          : 'CANCELLED')
    );
  }

  return false;
}

export function getExpectedOperationAction(
  operation
) {
  if (
    operation.type === 'ADD CREDITS'
  ) {
    return 'APPROVED';
  }

  if (
    operation.type ===
    'WITHDRAW CREDITS'
  ) {
    return getGameBalanceAtRequest(
      operation
    ) >= Number(operation.amount)
      ? 'APPROVED'
      : 'CANCELLED';
  }

  if (isRequestOperation(operation.type)) {
    return 'APPROVED';
  }

  return 'UNKNOWN';
}

export function getExpectedRequestContext(
  operation
) {
  return {
    gameId: normalizeText(
      operation.game_account
        ?.game_username
    ),
    kiosk:
      GAME_KIOSKS[
        operation.game_account?.game ||
        operation.game
      ] || '',
    currentBalance: Number(
      operation.game_account?.balance
    )
  };
}

export function evaluateRequestOperation(
  operation,
  action,
  requestData = {}
) {
  if (action !== 'APPROVED') {
    return false;
  }

  const submitted = {
    gameId: normalizeText(
      requestData.gameId
    ),
    newPassword: normalizeText(
      requestData.newPassword
    ),
    kiosk: normalizeText(
      requestData.kiosk
    ),
    amount: normalizeNumber(
      requestData.amount
    )
  };

  const expected =
    getExpectedRequestContext(
      operation
    );

  if (
    operation.type === 'CREATE ACCOUNT'
  ) {
    return Boolean(
      submitted.gameId &&
      submitted.newPassword &&
      submitted.kiosk
    );
  }

  if (
    operation.type === 'RESET PASSWORD'
  ) {
    return Boolean(
      submitted.gameId ===
        expected.gameId &&
      submitted.newPassword &&
      submitted.kiosk ===
        expected.kiosk
    );
  }

  if (
    operation.type === 'REFRESH BALANCE'
  ) {
    return Boolean(
      submitted.gameId ===
        expected.gameId &&
      submitted.kiosk ===
        expected.kiosk &&
      Number.isFinite(
        submitted.amount
      ) &&
      submitted.amount ===
        expected.currentBalance
    );
  }

  return false;
}

export function evaluateOperation(
  operation,
  action,
  requestData
) {
  if (isRequestOperation(operation.type)) {
    return evaluateRequestOperation(
      operation,
      action,
      requestData
    );
  }

  return evaluateMovementOperation(
    operation,
    action
  );
}

export function buildSessionPerformance(
  operations
) {
  const totalOperations =
    operations.length;

  const processedOperations =
    operations.filter(op =>
      op.status !== 'PENDING'
    );

  const correctOperations =
    processedOperations.filter(
      op => op.is_correct === true
    );

  const incorrectOperations =
    processedOperations.filter(
      op => op.is_correct === false
    );

  const processingTimes =
    processedOperations
      .filter(op =>
        op.processing_time_seconds
      )
      .map(op =>
        Number(
          op.processing_time_seconds
        )
      );

  const completedOperations =
    processedOperations.length;

  const accuracy =
    completedOperations > 0
      ? (
          correctOperations.length /
          completedOperations
        ) * 100
      : 0;

  const averageProcessingTimeSeconds =
    processingTimes.length > 0
      ? processingTimes.reduce(
          (a, b) => a + b,
          0
        ) / processingTimes.length
      : 0;

  return {
    totalOperations,
    completedOperations,
    pendingOperations:
      totalOperations -
      completedOperations,
    correctOperations:
      correctOperations.length,
    incorrectOperations:
      incorrectOperations.length,
    accuracy: Number(
      accuracy.toFixed(2)
    ),
    averageProcessingTimeSeconds:
      Number(
        averageProcessingTimeSeconds
          .toFixed(2)
      )
  };
}

export function buildOperationBreakdown(
  operations
) {
  return {
    movements: {
      addCredits:
        operations.filter(op =>
          op.type === 'ADD CREDITS'
        ).length,
      withdrawCredits:
        operations.filter(op =>
          op.type ===
          'WITHDRAW CREDITS'
        ).length
    },
    requests: {
      createAccount:
        operations.filter(op =>
          op.type ===
          'CREATE ACCOUNT'
        ).length,
      resetPassword:
        operations.filter(op =>
          op.type ===
          'RESET PASSWORD'
        ).length,
      refreshBalance:
        operations.filter(op =>
          op.type ===
          'REFRESH BALANCE'
        ).length
    }
  };
}
