export const GAME_HISTORY_TYPE_PATTERN =
  'GAME %';

export const GAME_HISTORY_TABLE =
  'sandbox_game_history';

export function isGameHistoryType(type) {
  return String(type || '')
    .startsWith('GAME ');
}

export function filterGameHistoryRows(
  rows = []
) {
  return rows.filter(row =>
    isGameHistoryType(row.type)
  );
}

export function filterBackendHistoryRows(
  rows = []
) {
  return rows.filter(row =>
    !isGameHistoryType(row.type)
  );
}

function parseHistoryMetadata(description) {
  try {
    return JSON.parse(description || '{}');
  } catch {
    return {};
  }
}

function normalizeGame(game) {
  return String(game ?? '')
    .replaceAll('-', ' ')
    .trim()
    .toLowerCase();
}

export function gameHistoryMatchesOperation(
  row,
  operation
) {
  if (row.game_account_id) {
    return (
      row.game_account_id ===
      operation.game_account_id
    );
  }

  const details = parseHistoryMetadata(
    row.description
  );
  const recordedGame =
    row.game || details.game;
  const recordedUsername =
    row.game_username ||
    details.mobileId ||
    details.mobile_id ||
    details.playerId;
  const expectedGame =
    operation.game_account?.game;
  const expectedUsername =
    operation.game_account
      ?.game_username;

  return Boolean(
    recordedGame &&
    recordedUsername &&
    normalizeGame(recordedGame) ===
      normalizeGame(expectedGame) &&
    recordedUsername === expectedUsername
  );
}
