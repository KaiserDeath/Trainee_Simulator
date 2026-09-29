export const PLAYER_IN_GAME_CODE = 'PLAYER_IN_GAME';

export function isPlayerInGameError(error) {
  return (
    error?.response?.data?.code ===
    PLAYER_IN_GAME_CODE
  );
}
