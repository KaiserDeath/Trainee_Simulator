export const GOLDEN_DRAGON_GAME = 'Golden Dragon';

// No game panel lets the trainee reliably pick which customer a new
// account belongs to: Golden Dragon and Vblink link it to whatever name
// is typed, and Orion Stars to whichever player row happens to be
// selected. So only the Game ID and password are graded. The account
// must be newer than the request, so an account that already existed
// cannot answer it.
export async function hasCreatedAccount({
  client,
  operation,
  requestData = {}
}) {
  const gameUsername =
    String(requestData.gameId ?? '')
      .trim();

  const password =
    String(requestData.newPassword ?? '')
      .trim();

  const game =
    operation.game_account?.game ||
    operation.game ||
    '';

  if (!gameUsername || !password || !operation.created_at) {
    return false;
  }

  const { data, error } = await client
    .from('sandbox_game_accounts')
    .select('id')
    .eq('session_id', operation.session_id)
    .eq('game', game)
    .eq('game_username', gameUsername)
    .eq('password', password)
    .gte('created_at', operation.created_at)
    .limit(1);

  if (error) {
    throw error;
  }

  return data.length > 0;
}
