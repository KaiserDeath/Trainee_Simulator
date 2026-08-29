import { useMemo, useState } from 'react';

import {
  rechargeHubAddCreditsPractice,
  startHubAddCreditsPractice,
} from '../../api/client';

const DEFAULT_GAME_TABS = [
  { id: 'orion-stars', label: 'Orion Stars', status: 'available' },
  { id: 'vblink', label: 'Vblink', status: 'not_ready' },
  { id: 'golden-dragon', label: 'Golden Dragon', status: 'not_ready' },
];

const instructionsFor = (activity) => activity.content?.instructions || [
  'Verify the assigned customer, game account, requested amount, and existing movement history.',
  'Understand that the customer amount is reserved before the game-side credit is performed.',
  'Perform one game-side credit, then approve the existing Backend movement once—or cancel it once if it must stop.',
];

const gameTabsFor = (activity) => {
  const configured = Array.isArray(activity.content?.gameOptions) ? activity.content.gameOptions : [];
  return DEFAULT_GAME_TABS.map((fallback) => {
    const option = configured.find((candidate) => candidate?.id === fallback.id || candidate?.code === fallback.id);
    return {
      ...fallback,
      ...(option || {}),
      id: fallback.id,
      label: option?.label || fallback.label,
      status: option?.status || fallback.status,
    };
  });
};

export default function HubAddCreditsActivity({ activity, disabled, onComplete }) {
  const [view, setView] = useState(null);
  const [selectedGame] = useState('orion-stars');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const gameTabs = useMemo(() => gameTabsFor(activity), [activity]);

  const startPractice = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await startHubAddCreditsPractice(activity.id, { idempotencyKey: crypto.randomUUID() });
      setView(response.data);
    } catch (startError) {
      setError(startError?.response?.data?.error?.message || 'The focused Add Credits surface could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const performGameCredit = async () => {
    if (!view?.account?.id || !view.operation?.amount) return;
    setBusy(true);
    setError('');
    try {
      const response = await rechargeHubAddCreditsPractice(activity.id, {
        accountId: view.account.id,
        amount: view.operation.amount,
      });
      setView(response.data);
    } catch (rechargeError) {
      setError(rechargeError?.response?.data?.error?.message || 'The game-side credit could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const settle = async (action) => {
    setBusy(true);
    setError('');
    try {
      await onComplete({
        action,
        accountId: view.account.id,
        amount: view.operation.amount,
        gameActionExecuted: view.operation.gameActionExecuted,
      });
    } catch (settleError) {
      setError(settleError?.response?.data?.error?.message || 'The Backend movement could not be settled.');
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
                id={`hub-game-tab-add-credits-${game.id}`}
                className={`hub-game-tab${active ? ' is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${game.label}${available ? '' : ' (coming soon)'}`}
                disabled={disabled || !available}
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
        <ol>{instructionsFor(activity).map((instruction, index) => <li key={`${instruction}-${index}`}>{instruction}</li>)}</ol>
      </div>

      {!view && (
        <button className="hub-primary-button" type="button" disabled={disabled || busy} onClick={startPractice}>
          {busy ? 'Opening Orion Stars…' : 'Open focused Orion Stars Add Credits view'}
        </button>
      )}

      {view && (
        <>
          <section className="hub-game-surface" aria-label="Orion Stars Add Credits page">
            <header>
              <strong>{view.game}</strong>
              <span>Balance / User Management</span>
            </header>
            <div className="hub-game-surface-toolbar">Add Credits request · verify before acting</div>
            <div className="hub-add-credits-grid">
              <div><span>Customer</span><strong>{view.account.customer.username || 'Assigned customer'}</strong></div>
              <div><span>Game account</span><strong>{view.account.gameUsername}</strong></div>
              <div><span>Requested amount</span><strong>{view.operation.amount}</strong></div>
              <div><span>Customer balance after reservation</span><strong>{view.operation.customerBalance}</strong></div>
              <div><span>Game Credit before action</span><strong>{view.operation.gameCredit}</strong></div>
              <div><span>Game wallet balance</span><strong>{view.operation.gameWalletBalance}</strong></div>
            </div>
            <p className="hub-game-surface-note">Customer balance and game wallet are independent. This focused surface does not start the timed simulator.</p>
          </section>

          <section className="hub-backend-update hub-add-credits-actions" aria-label="Add Credits game action">
            <h4>Game-side operation</h4>
            <p>Use the assigned account and exact requested amount once. The server records the game history separately.</p>
            <button className="hub-primary-button" type="button" disabled={disabled || busy || view.operation.status !== 'PENDING' || view.operation.gameActionExecuted} onClick={performGameCredit}>
              {view.operation.gameActionExecuted ? 'Game credit recorded' : (busy ? 'Processing…' : `Add ${view.operation.amount} credits in Orion Stars`)}
            </button>
          </section>

          {view.operation.status === 'PENDING' && (
            <section className="hub-backend-update hub-add-credits-actions" aria-label="Add Credits Backend decision">
              <h4>Backend decision</h4>
              <p>{view.operation.gameActionExecuted ? 'Game evidence exists. Approve the existing request once.' : 'If the movement must stop before the game action, cancel the existing request once.'}</p>
              <div className="hub-inline-actions">
                <button className="hub-primary-button" type="button" disabled={disabled || busy || !view.operation.gameActionExecuted} onClick={() => settle('APPROVED')}>Approve movement</button>
                <button className="hub-secondary-button" type="button" disabled={disabled || busy} onClick={() => settle('CANCELLED')}>Cancel movement</button>
              </div>
            </section>
          )}
        </>
      )}

      {error && <p className="hub-inline-error" role="alert">{error}</p>}
    </div>
  );
}
