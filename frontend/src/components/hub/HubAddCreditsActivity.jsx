import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useMemo, useState } from 'react';

import {
  rechargeHubAddCreditsPractice,
  startHubAddCreditsPractice,
} from '../../api/client';
import MovementConfirmationModal from '../operations/MovementConfirmationModal';

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
  const {t} = useHubLocale();
  const [view, setView] = useState(null);
  const [selectedGame] = useState('orion-stars');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const gameTabs = useMemo(() => gameTabsFor(activity), [activity]);

  const startPractice = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await startHubAddCreditsPractice(activity.id, { idempotencyKey: crypto.randomUUID() });
      setView(response.data);
    } catch (startError) {
      setError(startError?.response?.data?.error?.message || hubMessage("The focused Add Credits surface could not be opened."));
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
      setError(rechargeError?.response?.data?.error?.message || hubMessage("The game-side credit could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  const settle = async (action, cancellationReason = null) => {
    setBusy(true);
    setError('');
    try {
      await onComplete({
        action,
        accountId: view.account.id,
        amount: view.operation.amount,
        gameActionExecuted: view.operation.gameActionExecuted,
        ...(action === 'CANCELLED'
          ? { cancellationReason }
          : {}),
      });
      return true;
    } catch (settleError) {
      setError(settleError?.response?.data?.error?.message || hubMessage("The Backend movement could not be settled."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hub-focused-balance">
      <nav className="hub-game-tabs" aria-label={t("Game practice")}>
        <span className="hub-game-tabs-label">{t("Game")}</span>
        <div className="hub-game-tab-list" role="tablist" aria-label={t("Available games")}>
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
                <span>{t(game.label)}</span>
                {!available && <small className="hub-game-tab-status">{t("Coming soon")}</small>}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="hub-focused-instructions">
        <h4>{t("What to do")}</h4>
        <ol>{instructionsFor(activity).map((instruction, index) => <li key={`${instruction}-${index}`}>{instruction}</li>)}</ol>
      </div>

      {!view && (
        <button className="hub-primary-button" type="button" disabled={disabled || busy} onClick={startPractice}>
          {busy ? t("Opening Orion Stars…") : t("Open focused Orion Stars Add Credits view")}
        </button>
      )}

      {view && (
        <>
          <section className="hub-game-surface" aria-label={t("Orion Stars Add Credits page")}>
            <header>
              <strong>{view.game}</strong>
              <span>{t("Balance / User Management")}</span>
            </header>
            <div className="hub-game-surface-toolbar">{t("Add Credits request · verify before acting")}</div>
            <div className="hub-add-credits-grid">
              <div><span>{t("Customer")}</span><strong>{view.account.customer.username || t("Assigned customer")}</strong></div>
              <div><span>{t("Game account")}</span><strong>{view.account.gameUsername}</strong></div>
              <div><span>{t("Requested amount")}</span><strong>{view.operation.amount}</strong></div>
              <div><span>{t("Customer balance after reservation")}</span><strong>{view.operation.customerBalance}</strong></div>
              <div><span>{t("Game Credit before action")}</span><strong>{view.operation.gameCredit}</strong></div>
              <div><span>{t("Game wallet balance")}</span><strong>{view.operation.gameWalletBalance}</strong></div>
            </div>
            <p className="hub-game-surface-note">{t("Customer balance and game wallet are independent. This focused surface does not start the timed simulator.")}</p>
          </section>

          <section className="hub-backend-update hub-add-credits-actions" aria-label={t("Add Credits game action")}>
            <h4>{t("Game-side operation")}</h4>
            <p>{t("Use the assigned account and exact requested amount once. The server records the game history separately.")}</p>
            <button className="hub-primary-button" type="button" disabled={disabled || busy || view.operation.status !== 'PENDING' || view.operation.gameActionExecuted} onClick={performGameCredit}>
              {view.operation.gameActionExecuted ? t("Game credit recorded") : (busy ? t("Processing…") : t("Add {0} credits in Orion Stars", [view.operation.amount]))}
            </button>
          </section>

          {view.operation.status === 'PENDING' && (
            <section className="hub-backend-update hub-add-credits-actions" aria-label={t("Add Credits Backend decision")}>
              <h4>{t("Backend decision")}</h4>
              <p>{view.operation.gameActionExecuted ? t("Game evidence exists. Approve the existing request once.") : t("If the movement must stop before the game action, cancel the existing request once.")}</p>
              <div className="hub-inline-actions">
                <button className="hub-primary-button" type="button" disabled={disabled || busy || !view.operation.gameActionExecuted} onClick={() => setPendingAction('APPROVED')}>{t("Approve movement")}</button>
                <button className="hub-secondary-button" type="button" disabled={disabled || busy} onClick={() => setPendingAction('CANCELLED')}>{t("Cancel movement")}</button>
              </div>
            </section>
          )}
        </>
      )}

      {error && <p className="hub-inline-error" role="alert">{t(error)}</p>}
      {pendingAction && (
        <MovementConfirmationModal
          action={pendingAction}
          error={error}
          isSubmitting={busy}
          onClose={() => setPendingAction(null)}
          onConfirm={async (cancellationReason) => {
            if (await settle(pendingAction, cancellationReason)) {
              setPendingAction(null);
            }
          }}
        />
      )}
    </div>
  );
}
