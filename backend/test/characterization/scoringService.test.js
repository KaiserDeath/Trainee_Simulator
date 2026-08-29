import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOperationBreakdown,
  buildSessionPerformance,
  evaluateMovementOperation,
  evaluateRequestOperation,
  getExpectedOperationAction,
  getExpectedRequestContext,
  isValidAction
} from '../../src/services/scoringService.js';

const baseGameAccount = {
  game: 'Orion Stars',
  game_username: 'prototype-player-01',
  balance: 125
};

const operation = (type, overrides = {}) => ({
  type,
  amount: 50,
  game_account: baseGameAccount,
  ...overrides
});

test('prototype accepts only its two current final actions', () => {
  assert.equal(isValidAction('APPROVED'), true);
  assert.equal(isValidAction('CANCELLED'), true);
  assert.equal(isValidAction('REJECTED'), false);
  assert.equal(isValidAction('approved'), false);
});

test('prototype add-credits decision currently expects approval', () => {
  const addCredits = operation('ADD CREDITS');

  assert.equal(
    evaluateMovementOperation(addCredits, 'APPROVED'),
    true
  );
  assert.equal(
    evaluateMovementOperation(addCredits, 'CANCELLED'),
    false
  );
});

test('prototype withdrawal decision currently uses the request-time balance snapshot', () => {
  const sufficientAtRequest = operation('WITHDRAW CREDITS', {
    amount: 80,
    game_balance_at_request: 100,
    game_account: {
      ...baseGameAccount,
      balance: 10
    }
  });
  const insufficientAtRequest = operation('WITHDRAW CREDITS', {
    amount: 80,
    game_balance_at_request: 20,
    game_account: {
      ...baseGameAccount,
      balance: 200
    }
  });

  assert.equal(
    evaluateMovementOperation(sufficientAtRequest, 'APPROVED'),
    true
  );
  assert.equal(
    evaluateMovementOperation(insufficientAtRequest, 'CANCELLED'),
    true
  );
});

test('prototype account creation checks only that required request fields are present', () => {
  const createAccount = operation('CREATE ACCOUNT');

  assert.equal(
    evaluateRequestOperation(createAccount, 'APPROVED', {
      gameId: 'new-player',
      newPassword: 'prototype-value',
      kiosk: 'OrionStars'
    }),
    true
  );
  assert.equal(
    evaluateRequestOperation(createAccount, 'APPROVED', {
      gameId: 'new-player',
      newPassword: '',
      kiosk: 'OrionStars'
    }),
    false
  );
  assert.equal(
    evaluateRequestOperation(createAccount, 'CANCELLED', {
      gameId: 'new-player',
      newPassword: 'prototype-value',
      kiosk: 'OrionStars'
    }),
    false
  );
});

test('prototype reset-password validation binds player and game kiosk but not password policy', () => {
  const resetPassword = operation('RESET PASSWORD');

  assert.equal(
    evaluateRequestOperation(resetPassword, 'APPROVED', {
      gameId: 'prototype-player-01',
      newPassword: 'any-non-empty-prototype-value',
      kiosk: 'OrionStars'
    }),
    true
  );
  assert.equal(
    evaluateRequestOperation(resetPassword, 'APPROVED', {
      gameId: 'another-player',
      newPassword: 'any-non-empty-prototype-value',
      kiosk: 'OrionStars'
    }),
    false
  );
});

test('prototype refresh-balance validation requires exact player, kiosk, and numeric balance', () => {
  const refreshBalance = operation('REFRESH BALANCE');

  assert.deepEqual(
    getExpectedRequestContext(refreshBalance),
    {
      gameId: 'prototype-player-01',
      kiosk: 'OrionStars',
      currentBalance: 125
    }
  );
  assert.equal(
    evaluateRequestOperation(refreshBalance, 'APPROVED', {
      gameId: 'prototype-player-01',
      kiosk: 'OrionStars',
      amount: '125'
    }),
    true
  );
  assert.equal(
    evaluateRequestOperation(refreshBalance, 'APPROVED', {
      gameId: 'prototype-player-01',
      kiosk: 'OrionStars',
      amount: '124.99'
    }),
    false
  );
});

test('prototype request context exposes an empty kiosk for an unmapped game', () => {
  const unknownGame = operation('REFRESH BALANCE', {
    game_account: {
      game: 'Unapproved Game Fixture',
      game_username: 'search-target',
      balance: 0
    }
  });

  assert.deepEqual(
    getExpectedRequestContext(unknownGame),
    {
      gameId: 'search-target',
      kiosk: '',
      currentBalance: 0
    }
  );
});

test('prototype expected-action helper reports its current operation branches', () => {
  assert.equal(
    getExpectedOperationAction(operation('ADD CREDITS')),
    'APPROVED'
  );
  assert.equal(
    getExpectedOperationAction(operation('WITHDRAW CREDITS', {
      amount: 200,
      game_balance_at_request: 100
    })),
    'CANCELLED'
  );
  assert.equal(
    getExpectedOperationAction(operation('CREATE ACCOUNT')),
    'APPROVED'
  );
  assert.equal(
    getExpectedOperationAction(operation('UNMODELLED')),
    'UNKNOWN'
  );
});

test('prototype session scoring counts only non-pending operations as completed', () => {
  const result = buildSessionPerformance([
    {
      status: 'APPROVED',
      is_correct: true,
      processing_time_seconds: 10
    },
    {
      status: 'CANCELLED',
      is_correct: false,
      processing_time_seconds: 20
    },
    {
      status: 'PENDING',
      is_correct: null,
      processing_time_seconds: null
    }
  ]);

  assert.deepEqual(result, {
    totalOperations: 3,
    completedOperations: 2,
    pendingOperations: 1,
    correctOperations: 1,
    incorrectOperations: 1,
    accuracy: 50,
    averageProcessingTimeSeconds: 15
  });
});

test('prototype session scoring excludes zero-second samples from its average', () => {
  const result = buildSessionPerformance([
    {
      status: 'APPROVED',
      is_correct: true,
      processing_time_seconds: 0
    },
    {
      status: 'APPROVED',
      is_correct: true,
      processing_time_seconds: 12
    }
  ]);

  assert.equal(result.averageProcessingTimeSeconds, 12);
});

test('prototype operation breakdown preserves its five current operation buckets', () => {
  const result = buildOperationBreakdown([
    operation('ADD CREDITS'),
    operation('WITHDRAW CREDITS'),
    operation('CREATE ACCOUNT'),
    operation('RESET PASSWORD'),
    operation('REFRESH BALANCE'),
    operation('UNMODELLED')
  ]);

  assert.deepEqual(result, {
    movements: {
      addCredits: 1,
      withdrawCredits: 1
    },
    requests: {
      createAccount: 1,
      resetPassword: 1,
      refreshBalance: 1
    }
  });
});
