import { useMemo, useState } from 'react';

import {
  startHubFocusedPractice,
} from '../../api/client';

const DEFAULT_GAME_TABS = [
  { id: 'orion-stars', label: 'Orion Stars', status: 'available' },
  { id: 'vblink', label: 'Vblink', status: 'not_ready' },
  { id: 'golden-dragon', label: 'Golden Dragon', status: 'not_ready' },
];

const gameTabsFor = (activity) => {
  const configured = Array.isArray(activity.content?.gameOptions)
    ? activity.content.gameOptions
    : [];

  return DEFAULT_GAME_TABS.map((fallback) => {
    const option = configured.find((candidate) => (
      candidate?.id === fallback.id || candidate?.code === fallback.id
    ));
    return {
      ...fallback,
      ...(option || {}),
      id: fallback.id,
      label: option?.label || fallback.label,
      status: option?.status || fallback.status,
    };
  });
};

const instructionsFor = (activity) => activity.content?.instructions || [
  'Open the focused game surface and locate the assigned player.',
  'Read the game-side Credit and Available Balance values.',
  'Enter those values in the Trez Backend update form.'
];

export default function HubFocusedBalanceActivity({ activity, disabled, onComplete }) {
  const [view, setView] = useState(null);
  const [selectedGame, setSelectedGame] = useState('orion-stars');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [observedCredit, setObservedCredit] = useState('');
  const [observedAvailableBalance, setObservedAvailableBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedAccount = useMemo(
    () => view?.accounts?.find((account) => account.id === selectedAccountId) || view?.accounts?.[0],
    [selectedAccountId, view?.accounts]
  );
  const gameTabs = useMemo(() => gameTabsFor(activity), [activity]);

  const startPractice = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await startHubFocusedPractice(activity.id, {
        idempotencyKey: crypto.randomUUID(),
      });
      const nextView = response.data;
      setView(nextView);
      setSelectedAccountId(nextView.accounts?.[0]?.id || '');
    } catch (startError) {
      setError(startError?.response?.data?.error?.message || 'The focused game surface could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedAccount || observedCredit === '' || observedAvailableBalance === '') return;
    setBusy(true);
    setError('');
    try {
      await onComplete({
        accountId: selectedAccount.id,
        observedCredit: Number(observedCredit),
        observedAvailableBalance: Number(observedAvailableBalance),
      });
    } catch (submitError) {
      setError(submitError?.response?.data?.error?.message || 'The observed balance could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hub-focused-balance">
      <nav className="hub-game-tabs" aria-label="Game practice">
        <span className="hub-game-tabs-label">Game</span>
        <div className="hub-game-tab-list" role="tablist" aria-label="Available games">
          {gameTabs.map((game) => {
            const available = game.status === 'available';
            const active = selectedGame === game.id;
            return (
              <button
                key={game.id}
                id={`hub-game-tab-${game.id}`}
                className={`hub-game-tab${active ? ' is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={available ? `hub-game-panel-${game.id}` : undefined}
                aria-label={`${game.label}${available ? '' : ' (coming soon)'}`}
                disabled={disabled || !available}
                onClick={() => {
                  if (available && !disabled) setSelectedGame(game.id);
                }}
              >
                <span>{game.label}</span>
                {!available && <small className="hub-game-tab-status">Coming soon</small>}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="hub-focused-instructions">
        <h4>What to do</h4>
        <ol>
          {instructionsFor(activity).map((instruction, index) => <li key={`${instruction}-${index}`}>{instruction}</li>)}
        </ol>
      </div>

      {!view && (
        <button className="hub-primary-button" type="button" disabled={disabled || busy} onClick={startPractice}>
          {busy ? 'Opening Orion Stars…' : 'Open focused Orion Stars view'}
        </button>
      )}

      {view && (
        <>
          <section
            className="hub-game-surface"
            id="hub-game-panel-orion-stars"
            aria-label={`${view.game} balance page`}
          >
            <header>
              <strong>{view.game}</strong>
              <span>Balance / User Management</span>
            </header>
            <div className="hub-game-surface-toolbar">Player account lookup</div>
            <label>
              Player account
              <select value={selectedAccount?.id || ''} disabled={disabled || busy} onChange={(event) => {
                setSelectedAccountId(event.target.value);
                setObservedCredit('');
              }}>
                {view.accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.gameUsername}</option>
                ))}
              </select>
            </label>
            {selectedAccount && (
              <div className="hub-game-surface-values">
                <div><span>Account</span><strong>{selectedAccount.gameUsername}</strong></div>
                <div><span>Credit</span><strong>{selectedAccount.credit}</strong></div>
                <div><span>Available Balance</span><strong>{view.availableBalance}</strong></div>
              </div>
            )}
            <p className="hub-game-surface-note">This is a focused game surface. It does not start the timed simulator.</p>
          </section>

          {!activity.completed && (
            <form className="hub-backend-update" onSubmit={submit}>
              <h4>Trez Backend update</h4>
              <p>Enter the values you observed in the game page. The server verifies them before completing this activity.</p>
              <label>
                Observed Credit
                <input type="number" min="0" step="any" value={observedCredit} disabled={disabled || busy} onChange={(event) => setObservedCredit(event.target.value)} />
              </label>
              <label>
                Observed Available Balance
                <input type="number" min="0" step="any" value={observedAvailableBalance} disabled={disabled || busy} onChange={(event) => setObservedAvailableBalance(event.target.value)} />
              </label>
              <button className="hub-primary-button" type="submit" disabled={disabled || busy || !selectedAccount || observedCredit === '' || observedAvailableBalance === ''}>
                {busy ? 'Verifying…' : 'Update Trez Backend'}
              </button>
            </form>
          )}
        </>
      )}

      {error && <p className="hub-inline-error" role="alert">{error}</p>}
    </div>
  );
}
