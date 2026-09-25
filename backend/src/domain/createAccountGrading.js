export const GOLDEN_DRAGON_GAME = 'Golden Dragon';

export async function hasCreatedAccount({
  client,
  operation,
  requestData = {}
}) {
  const gameUsername =
    String(requestData.gameId ?? '')
      .trim();

  if (!gameUsername) {
    return false;
  }

  const game =
    operation.game_account?.game ||
    operation.game ||
    '';

  // Golden Dragon links the account to whatever customer the trainee
  // types as First Name, so only the Mobile ID and Mobile Password are
  // graded there. The account must be newer than the request, so an
  // account that already existed cannot answer it.
  if (game === GOLDEN_DRAGON_GAME) {
    const password =
      String(requestData.newPassword ?? '')
        .trim();

    if (!password || !operation.created_at) {
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

  const { data, error } = await client
    .from('sandbox_game_accounts')
    .select('id')
    .eq(
      'session_id',
      operation.session_id
    )
    .eq('customer_id', operation.customer_id)
    .eq('game', game)
    .eq('game_username', gameUsername)
    .limit(1);

  if (error) {
    throw error;
  }

  return data.length > 0;
}
