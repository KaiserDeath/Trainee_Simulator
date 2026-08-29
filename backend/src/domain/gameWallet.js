export const MINIMUM_GAME_WALLET_SEED = 20000;

export function buildGameWalletSeeds({
  sessionId,
  games,
  openingBalance =
    MINIMUM_GAME_WALLET_SEED
}) {
  const balance = Number(openingBalance);

  if (
    !Number.isFinite(balance) ||
    balance < MINIMUM_GAME_WALLET_SEED
  ) {
    throw new RangeError(
      `Game wallet opening balance must be at least ${MINIMUM_GAME_WALLET_SEED}.`
    );
  }

  return Array.from(new Set(games)).map(
    game => ({
      session_id: sessionId,
      game,
      balance
    })
  );
}
