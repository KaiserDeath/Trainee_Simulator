import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useMemo, useState } from 'react';

import { redeemHubWithdrawCreditsPractice, startHubWithdrawCreditsPractice } from '../../api/client';
import MovementConfirmationModal from '../operations/MovementConfirmationModal';

const games = [
  { id: 'orion-stars', label: 'Orion Stars', status: 'available' },
  { id: 'vblink', label: 'Vblink', status: 'not_ready' },
  { id: 'golden-dragon', label: 'Golden Dragon', status: 'not_ready' },
];

export default function HubWithdrawCreditsActivity({ activity, disabled, onComplete }) {
  const {t} = useHubLocale();
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const tabs = useMemo(() => games.map((fallback) => ({ ...fallback, ...(activity.content?.gameOptions || []).find((option) => option.id === fallback.id) })), [activity]);
  const start = async () => {
    setBusy(true); setError('');
    try { setView((await startHubWithdrawCreditsPractice(activity.id, { idempotencyKey: crypto.randomUUID() })).data); }
    catch (e) { setError(e?.response?.data?.error?.message || hubMessage("The focused Withdraw Credits surface could not be opened.")); }
    finally { setBusy(false); }
  };
  const redeem = async () => {
    setBusy(true); setError('');
    try { setView((await redeemHubWithdrawCreditsPractice(activity.id, { accountId: view.account.id, amount: view.operation.amount })).data); }
    catch (e) { setError(e?.response?.data?.error?.message || hubMessage("The game-side withdrawal could not be completed.")); }
    finally { setBusy(false); }
  };
  const settle = async (action, cancellationReason = null) => {
    setBusy(true); setError('');
    try {
      await onComplete({
        action,
        accountId: view.account.id,
        amount: view.operation.amount,
        gameActionExecuted: view.operation.gameActionExecuted,
        ...(action === 'CANCELLED' ? { cancellationReason } : {}),
      });
      return true;
    }
    catch (e) { setError(e?.response?.data?.error?.message || hubMessage("The Backend movement could not be settled.")); return false; }
    finally { setBusy(false); }
  };
  return <div className="hub-focused-balance">
    <nav className="hub-game-tabs" aria-label={t("Game practice")}><span className="hub-game-tabs-label">{t("Game")}</span><div className="hub-game-tab-list" role="tablist" aria-label={t("Available games")}>
      {tabs.map((game) => <button key={game.id} className={`hub-game-tab${game.id === 'orion-stars' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={game.id === 'orion-stars'} disabled={disabled || game.status !== 'available'}><span>{t(game.label)}</span>{game.status !== 'available' && <small className="hub-game-tab-status">{t("Coming soon")}</small>}</button>)}
    </div></nav>
    <div className="hub-focused-instructions"><h4>{t("What to do")}</h4><ol>{(activity.content?.instructions || []).map((item, index) => <li key={`${item}-${index}`}>{t(item)}</li>)}</ol></div>
    {!view && <button className="hub-primary-button" type="button" disabled={disabled || busy} onClick={start}>{busy ? t("Opening Orion Stars…") : t("Open focused Orion Stars Withdraw Credits view")}</button>}
    {view && <>
      <section className="hub-game-surface" aria-label={t("Orion Stars Withdraw Credits page")}><header><strong>{view.game}</strong><span>{t("Balance / User Management")}</span></header><div className="hub-game-surface-toolbar">{t("Withdraw Credits request · verify before acting")}</div>
        <div className="hub-add-credits-grid"><div><span>{t("Customer")}</span><strong>{view.account.customer.username || t("Assigned customer")}</strong></div><div><span>{t("Game account")}</span><strong>{view.account.gameUsername}</strong></div><div><span>{t("Requested amount")}</span><strong>{view.operation.amount}</strong></div><div><span>{t("Customer balance at request")}</span><strong>{view.operation.customerBalanceAtRequest}</strong></div><div><span>{t("Customer balance")}</span><strong>{view.operation.customerBalance}</strong></div><div><span>{t("Game Credit before action")}</span><strong>{view.operation.gameCreditAtRequest}</strong></div><div><span>{t("Game Credit")}</span><strong>{view.operation.gameCredit}</strong></div><div><span>{t("Game wallet balance")}</span><strong>{view.operation.gameWalletBalance}</strong></div></div>
        <p className="hub-game-surface-note">{t("Customer balance and game wallet are independent. This focused surface does not start the timed simulator.")}</p>
      </section>
      <section className="hub-backend-update hub-add-credits-actions" aria-label={t("Withdraw Credits game action")}><h4>{t("Game-side operation")}</h4><p>{t("Use the assigned account and exact requested amount once. The server records the game history separately.")}</p><button className="hub-primary-button" type="button" disabled={disabled || busy || view.operation.status !== 'PENDING' || view.operation.gameActionExecuted} onClick={redeem}>{view.operation.gameActionExecuted ? t("Game withdrawal recorded") : (busy ? t("Processing…") : t("Withdraw {0} credits in Orion Stars", [view.operation.amount]))}</button></section>
      {view.operation.status === 'PENDING' && <section className="hub-backend-update hub-add-credits-actions" aria-label={t("Withdraw Credits Backend decision")}><h4>{t("Backend decision")}</h4><p>{view.operation.gameActionExecuted ? t("Game evidence exists. Approve the existing request once.") : t("If the movement must stop before the game action, cancel the existing request once.")}</p><div className="hub-inline-actions"><button className="hub-primary-button" type="button" disabled={disabled || busy || !view.operation.gameActionExecuted} onClick={() => setPendingAction('APPROVED')}>{t("Approve movement")}</button><button className="hub-secondary-button" type="button" disabled={disabled || busy} onClick={() => setPendingAction('CANCELLED')}>{t("Cancel movement")}</button></div></section>}
    </>}
    {error && <p className="hub-inline-error" role="alert">{t(error)}</p>}
    {pendingAction && <MovementConfirmationModal action={pendingAction} error={error} isSubmitting={busy} onClose={() => setPendingAction(null)} onConfirm={async (cancellationReason) => { if (await settle(pendingAction, cancellationReason)) setPendingAction(null); }} />}
  </div>;
}
