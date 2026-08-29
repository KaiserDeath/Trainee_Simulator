import test from 'node:test';
import assert from 'node:assert/strict';

import {
  reserveAddCredits,
  settleAddCredits
} from '../../src/domain/addCreditsReservation.js';

test('a pending Add Credits movement immediately reserves customer balance', () => {
  assert.deepEqual(
    reserveAddCredits({
      customerBalance: 500,
      amount: 125
    }),
    {
      customerBalance: 375,
      reservedAmount: 125,
      reservationStatus: 'HELD'
    }
  );
});

test('approval commits the reservation without debiting the customer twice', () => {
  assert.deepEqual(
    settleAddCredits({
      customerBalance: 375,
      reservedAmount: 125,
      reservationStatus: 'HELD',
      action: 'APPROVED'
    }),
    {
      customerBalance: 375,
      reservedAmount: 125,
      reservationStatus: 'COMMITTED'
    }
  );
});

test('cancellation releases the reserved amount exactly once', () => {
  assert.deepEqual(
    settleAddCredits({
      customerBalance: 375,
      reservedAmount: 125,
      reservationStatus: 'HELD',
      action: 'CANCELLED'
    }),
    {
      customerBalance: 500,
      reservedAmount: 125,
      reservationStatus: 'RELEASED'
    }
  );

  assert.throws(
    () => settleAddCredits({
      customerBalance: 500,
      reservedAmount: 125,
      reservationStatus: 'RELEASED',
      action: 'CANCELLED'
    }),
    /not held/
  );
});

test('reservation cannot exceed the customer available balance', () => {
  assert.throws(
    () => reserveAddCredits({
      customerBalance: 50,
      amount: 51
    }),
    /exceeds the available customer balance/
  );
});
