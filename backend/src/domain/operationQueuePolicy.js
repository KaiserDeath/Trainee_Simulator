export const MOVEMENT_TYPES = new Set([
  'ADD CREDITS',
  'WITHDRAW CREDITS'
]);

export const REQUEST_TYPES = new Set([
  'CREATE ACCOUNT',
  'REFRESH BALANCE',
  'RESET PASSWORD'
]);

const requestKey = operation =>
  `${operation.customer_id}:${operation.game}`;

export function createPendingOperationOccupancy(
  operations = []
) {
  const occupancy = {
    movementCustomers: new Set(),
    requestCustomerGames: new Set()
  };

  for (const operation of operations) {
    if (operation.status !== 'PENDING') {
      continue;
    }

    occupyPendingOperation(
      occupancy,
      operation
    );
  }

  return occupancy;
}

export function canQueueOperation(
  occupancy,
  operation
) {
  if (MOVEMENT_TYPES.has(operation.type)) {
    return !occupancy.movementCustomers.has(
      operation.customer_id
    );
  }

  if (REQUEST_TYPES.has(operation.type)) {
    return !occupancy.requestCustomerGames.has(
      requestKey(operation)
    );
  }

  return false;
}

export function occupyPendingOperation(
  occupancy,
  operation
) {
  if (MOVEMENT_TYPES.has(operation.type)) {
    occupancy.movementCustomers.add(
      operation.customer_id
    );
  }

  if (REQUEST_TYPES.has(operation.type)) {
    occupancy.requestCustomerGames.add(
      requestKey(operation)
    );
  }

  return occupancy;
}
