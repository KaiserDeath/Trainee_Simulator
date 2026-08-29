export const ORION_STARS_UI_ADAPTER = Object.freeze({
  key: 'orion-stars',
  game: 'Orion Stars',
  pageTitle: 'Orion Stars',
  accountCreationSuccess: Object.freeze({
    kind: 'ORION_ACCOUNT_CREATED',
    title: 'Success',
    message: 'Player account created successfully.'
  })
});

export function getOrionAccountCreationPrompt(responseData = {}) {
  const prompt = responseData.adapterOutcome?.successPrompt;

  if (prompt?.kind === ORION_STARS_UI_ADAPTER.accountCreationSuccess.kind) {
    return {
      title: String(prompt.title || ORION_STARS_UI_ADAPTER.accountCreationSuccess.title),
      message: String(prompt.message || ORION_STARS_UI_ADAPTER.accountCreationSuccess.message)
    };
  }

  return ORION_STARS_UI_ADAPTER.accountCreationSuccess;
}
