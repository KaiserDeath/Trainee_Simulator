import { useMemo, useState } from 'react';

import { redeemHubWithdrawCreditsPractice, startHubWithdrawCreditsPractice } from '../../api/client';

const games = [
  { id: 'orion-stars', label: 'Orion Stars', status: 'available' },
  { id: 'vblink', label: 'Vblink', status: 'not_ready' },
  { id: 'golden-dragon', label: 'Golden Dragon', status: 'not_ready' },
];

export default function HubWithdrawCreditsActivity({ activity, disabled, onComplete }) {
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tabs = useMemo(() => games.map((fallback) => ({ ...fallback, ...(activity.content?.gameOptions || []).find((option) => option.id === fallback.id) })), [activity]);
  const start = async () => {
    setBusy(true); setError('');
    try { setView((await startHubWithdrawCreditsPractice(activity.id, { idempotencyKey: crypto.randomUUID() })).data); }
    catch (e) { setError(e?.response?.data?.error?.message || 'The focused Withdraw Credits surface could not be opened.'); }
    finally { setBusy(false); }
  };
  const redeem = async () => {
    setBusy(true); setError('');
    try { setView((await redeemHubWithdrawCreditsPractice(activity.id, { accountId: view.account.id, amount: view.operation.amount })).data); }
    catch (e) { setError(e?.response?.data?.error?.message || 'The game-side withdrawal could not be completed.'); }
    finally { setBusy(false); }
  };
  const settle = async (action) => {
    setBusy(true); setError('');
    try { await onComplete({ action, accountId: view.account.id, amount: view.operation.amount, gameActionExecuted: view.operation.gameActionExecuted }); }
    catch (e) { setError(e?.response?.data?.error?.message || 'The Backend movement could not be settled.'); }
    finally { setBusy(false); }
  };
  return <div className="hub-focused-balance">
    <nav className="hub-game-tabs" aria-label="Game practice"><span className="hub-game-tabs-label">Game</span><div className="hub-game-tab-list" role="tablist" aria-label="Available games">
      {tabs.map((game) => <button key={game.id} className={`hub-game-tab${game.id === 'orion-stars' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={game.id === 'orion-stars'} disabled={disabled || game.status !== 'available'}><span>{game.label}</span>{game.status !== 'available' && <small className="hub-game-tab-status">Coming soon</small>}</button>)}
    </div></nav>
    <div className="hub-focused-instructions"><h4>What to do</h4><ol>{(activity.content?.instructions || []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol></div>
    {!view && <button className="hub-primary-button" type="button" disabled={disabled || busy} onClick={start}>{busy ? 'Opening Orion Stars…' : 'Open focused Orion Stars Withdraw Credits view'}</button>}
    {view && <>
      <section className="hub-game-surface" aria-label="Orion Stars Withdraw Credits page"><header><strong>{view.game}</strong><span>Balance / User Management</span></header><div className="hub-game-surface-toolbar">Withdraw Credits request · verify before acting</div>
        <div className="hub-add-credits-grid"><div><span>Customer</span><strong>{view.account.customer.username || 'Assigned customer'}</strong></div><div><span>Game account</span><strong>{view.account.gameUsername}</strong></div><div><span>Requested amount</span><strong>{view.operation.amount}</strong></div><div><span>Customer balance at request</span><strong>{view.operation.customerBalanceAtRequest}</strong></div><div><span>Customer balance</span><strong>{view.operation.customerBalance}</strong></div><div><span>Game Credit before action</span><strong>{view.operation.gameCreditAtRequest}</strong></div><div><span>Game Credit</span><strong>{view.operation.gameCredit}</strong></div><div><span>Game wallet balance</span><strong>{view.operation.gameWalletBalance}</strong></div></div>
        <p className="hub-game-surface-note">Customer balance and game wallet are independent. This focused surface does not start the timed simulator.</p>
      </section>
      <section className="hub-backend-update hub-add-credits-actions" aria-label="Withdraw Credits game action"><h4>Game-side operation</h4><p>Use the assigned account and exact requested amount once. The server records the game history separately.</p><button className="hub-primary-button" type="button" disabled={disabled || busy || view.operation.status !== 'PENDING' || view.operation.gameActionExecuted} onClick={redeem}>{view.operation.gameActionExecuted ? 'Game withdrawal recorded' : (busy ? 'Processing…' : `Withdraw ${view.operation.amount} credits in Orion Stars`)}</button></section>
      {view.operation.status === 'PENDING' && <section className="hub-backend-update hub-add-credits-actions" aria-label="Withdraw Credits Backend decision"><h4>Backend decision</h4><p>{view.operation.gameActionExecuted ? 'Game evidence exists. Approve the existing request once.' : 'If the movement must stop before the game action, cancel the existing request once.'}</p><div className="hub-inline-actions"><button className="hub-primary-button" type="button" disabled={disabled || busy || !view.operation.gameActionExecuted} onClick={() => settle('APPROVED')}>Approve movement</button><button className="hub-secondary-button" type="button" disabled={disabled || busy} onClick={() => settle('CANCELLED')}>Cancel movement</button></div></section>}
    </>}
    {error && <p className="hub-inline-error" role="alert">{error}</p>}
  </div>;
}
