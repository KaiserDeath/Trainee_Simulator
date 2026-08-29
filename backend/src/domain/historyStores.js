export const CUSTOMER_MOVEMENT_HISTORY_TABLE =
  'sandbox_transaction_history';

export const GAME_HISTORY_TABLE =
  'sandbox_game_history';

export function isGameHistoryType(type) {
  return String(type || '')
    .startsWith('GAME ');
}
