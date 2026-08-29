export function buildIlikeFilter(
  fields,
  query = ''
) {
  const term = query.trim();

  if (!term) {
    return null;
  }

  return fields
    .map(field =>
      `${field}.ilike.%${term}%`
    )
    .join(',');
}

export function normalizeGameName(game) {
  return String(game ?? '')
    .replaceAll('-', ' ')
    .trim()
    .toLowerCase();
}

export function gameNamesMatch(
  accountGame,
  requestedGame
) {
  return (
    normalizeGameName(accountGame) ===
    normalizeGameName(requestedGame)
  );
}
