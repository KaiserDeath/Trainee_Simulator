export const RESERVATION_STATUS = Object.freeze({
  NONE: 'NONE',
  HELD: 'HELD',
  COMMITTED: 'COMMITTED',
  RELEASED: 'RELEASED'
});

function finiteNonNegative(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError(
      `${label} must be a non-negative number.`
    );
  }

  return number;
}

export function reserveAddCredits({
  customerBalance,
  amount
}) {
  const balance = finiteNonNegative(
    customerBalance,
    'Customer balance'
  );
  const value = finiteNonNegative(
    amount,
    'Movement amount'
  );

  if (value <= 0) {
    throw new RangeError(
      'Movement amount must be greater than zero.'
    );
  }

  if (value > balance) {
    throw new RangeError(
      'Movement amount exceeds the available customer balance.'
    );
  }

  return {
    customerBalance: balance - value,
    reservedAmount: value,
    reservationStatus:
      RESERVATION_STATUS.HELD
  };
}

export function settleAddCredits({
  customerBalance,
  reservedAmount,
  reservationStatus,
  action
}) {
  const balance = finiteNonNegative(
    customerBalance,
    'Customer balance'
  );
  const reserved = finiteNonNegative(
    reservedAmount,
    'Reserved amount'
  );

  if (
    reservationStatus !==
    RESERVATION_STATUS.HELD
  ) {
    throw new Error(
      'Add Credits reservation is not held.'
    );
  }

  if (action === 'APPROVED') {
    return {
      customerBalance: balance,
      reservedAmount: reserved,
      reservationStatus:
        RESERVATION_STATUS.COMMITTED
    };
  }

  if (action === 'CANCELLED') {
    return {
      customerBalance: balance + reserved,
      reservedAmount: reserved,
      reservationStatus:
        RESERVATION_STATUS.RELEASED
    };
  }

  throw new Error(
    'Unsupported Add Credits settlement action.'
  );
}
