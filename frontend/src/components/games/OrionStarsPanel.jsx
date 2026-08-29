import {
  useCallback,
  useEffect,
  useState
} from 'react';
import {
  CircleDollarSign,
  Download,
  Gamepad2,
  Gift,
  Globe2,
  Handshake,
  LogOut,
  Network,
  Rocket,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Users
} from 'lucide-react';

import {
  createGameAccount,
  getGameAccountHistory,
  getGameWallet,
  getSessionById,
  rechargeGameAccount,
  redeemGameAccount,
  resetGamePassword,
  searchGameAccounts
} from '../../api/client';
import {
  getOrionAccountCreationPrompt
} from '../../gameAdapters/orionStarsAdapter';
import '../../styles/orion-stars.css';

const GAME = 'Orion Stars';

const ORION_NAV_ITEMS = [
  { label: 'User Management', icon: Users },
  { label: 'Transaction Records', icon: ScrollText },
  { label: 'Game Records', icon: Gamepad2 },
  { label: 'JP Records', icon: Gift },
  { label: 'Welfare Records', icon: CircleDollarSign },
  { label: 'Admin Structure', icon: Network },
  { label: 'Transaction Records', icon: Handshake },
  { label: 'Reports', icon: CircleDollarSign },
  { label: 'JP Setting', icon: SlidersHorizontal },
  { label: 'Setting', icon: Settings },
  { label: 'Rocket Ramp', icon: Rocket },
  { label: 'Download', icon: Download },
  { label: 'Logout', icon: LogOut }
];

const formatDateTime = value => {
  if (!value) return '-';

  return new Intl.DateTimeFormat(
    'en-CA',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }
  )
    .format(new Date(value))
    .replace(',', '');
};

const formatOrionAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: false
  }).format(amount);
};

export default function OrionStarsPanel({
  session,
  sessionId
}) {
  const activeSessionId = session?.id || sessionId;

  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [walletBalance, setWalletBalance] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [successPrompt, setSuccessPrompt] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // --- FIX: Track an intentional override flag instead of manually mirroring a prop down into local state ---
  const [forceSessionEnd, setForceSessionEnd] = useState(false);

  // DERIVED STATE: This resolves instantly on every single render loop.
  // This eliminates the cascading render loop error thrown by your IA Helper.
  const isSessionEnded = forceSessionEnd || !activeSessionId;

  // --- SYNCHRONIZATION EFFECT: SAFELY CAPTURES CROSS-WINDOW STORAGE EVAPORATION ---
  useEffect(() => {
    const handleSessionUpdate = (event) => {
      const updatedSession = event?.detail;
      if (!updatedSession || updatedSession.id !== activeSessionId) {
        setForceSessionEnd(true);
      } else if (updatedSession.status && updatedSession.status !== 'active') {
        setForceSessionEnd(true);
      }
    };

    const handleStorageChange = (event) => {
      if (event.key === 'casino_trainer_session') {
        if (!event.newValue) {
          setForceSessionEnd(true);
        } else {
          try {
            const currentSession = JSON.parse(event.newValue);
            if (
              currentSession.id !== activeSessionId ||
              currentSession.status !== 'active'
            ) {
              setForceSessionEnd(true);
            }
          } catch (error) {
            console.error('Failed to process updated session token:', error);
          }
        }
      }
    };

    window.addEventListener(
      'casino_trainer_session_update',
      handleSessionUpdate
    );
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(
        'casino_trainer_session_update',
        handleSessionUpdate
      );
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || isSessionEnded) return;

    let mounted = true;

    const pollSessionStatus = async () => {
      try {
        const response = await getSessionById(activeSessionId);
        if (
          mounted &&
          response.data?.status &&
          response.data.status !== 'active'
        ) {
          setForceSessionEnd(true);
        }
      } catch (err) {
        console.error('Failed to verify session status', err);
      }
    };

    pollSessionStatus();
    const interval = setInterval(pollSessionStatus, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [activeSessionId, isSessionEnded]);

  const selectedCustomerId = selected?.customer_id;

  const orionHistory = history.filter(item =>
    item.game === GAME || item.description?.includes(GAME)
  );

  const fetchAccounts = useCallback(async () => {
    if (isSessionEnded || !activeSessionId) return;

    try {
      const response = await searchGameAccounts(
        activeSessionId,
        GAME,
        query
      );

      const nextAccounts = response.data || [];
      setAccounts(nextAccounts);

      if (nextAccounts[0]?.game_wallet_balance != null) {
        setWalletBalance(Number(nextAccounts[0].game_wallet_balance));
      }

      setSelected(current => {
        if (!current) return current;
        return nextAccounts.find(account => account.id === current.id) || current;
      });
    } catch (err) {
      if (err.response?.status === 404) {
        setForceSessionEnd(true);
        return;
      }

      console.error('Failed to load Orion Stars accounts', err);
    }
  }, [activeSessionId, query, isSessionEnded]);

  const fetchWallet = useCallback(async () => {
    if (isSessionEnded || !activeSessionId) return;

    try {
      const response = await getGameWallet(activeSessionId, GAME);
      setWalletBalance(Number(response.data.balance));
    } catch (err) {
      if (err.response?.status === 404) {
        setForceSessionEnd(true);
        return;
      }

      console.error('Failed to load Orion Stars wallet', err);
    }
  }, [activeSessionId, isSessionEnded]);

  const fetchHistory = useCallback(async () => {
    if (!selectedCustomerId || isSessionEnded || !activeSessionId) {
      setHistory([]);
      return;
    }

    try {
      const response = await getGameAccountHistory(
        activeSessionId,
        selectedCustomerId,
        GAME
      );

      setHistory(response.data || []);
    } catch (err) {
      if (err.response?.status === 404) {
        setForceSessionEnd(true);
        return;
      }

      console.error('Failed to load Orion Stars history', err);
    }
  }, [activeSessionId, selectedCustomerId, isSessionEnded]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchAccounts();
      fetchWallet();
    }, 200);

    return () => clearTimeout(timeout);
  }, [fetchAccounts, fetchWallet]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchHistory();
    }, 0);

    return () => clearTimeout(timeout);
  }, [fetchHistory]);

  const openModal = name => {
    setActionError('');
    setModal(name);
    if (name === 'create') {
      setForm({ gameUsername: selected?.customer?.username || '' });
      return;
    }
    if (name === 'recharge') {
      setForm({ amount: '0', note: '' });
      return;
    }
    if (name === 'redeem') {
      setForm({ amount: '0', note: '' });
      return;
    }
    setForm({});
  };

  const closeModal = () => {
    setModal(null);
    setForm({});
    setActionError('');
  };

  const updateForm = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const refreshSelected = async () => {
    await Promise.all([
      fetchAccounts(),
      fetchHistory(),
      fetchWallet()
    ]);
  };

  const applyUpdatedAccount = updatedAccount => {
    if (!updatedAccount?.id) return;

    setAccounts(current => current.map(account =>
      account.id === updatedAccount.id
        ? updatedAccount
        : account
    ));
    setSelected(current =>
      current?.id === updatedAccount.id
        ? updatedAccount
        : current
    );

    if (updatedAccount.game_wallet_balance != null) {
      setWalletBalance(Number(updatedAccount.game_wallet_balance));
    }
  };

  const runAction = async () => {
    if (isSessionEnded || !activeSessionId) {
      closeModal();
      return;
    }

    if (modal === 'create') {
      const account = String(form.gameUsername || '').trim();
      const password = String(form.password || '');
      const passwordConfirmation = String(form.passwordConfirmation || '');

      if (!account || !password || !passwordConfirmation) {
        setActionError('Account, login password, and password confirmation are required.');
        return;
      }

      if (password !== passwordConfirmation) {
        setActionError('The password confirmation does not match.');
        return;
      }
    }

    setActionBusy(true);
    setActionError('');

    try {
      let updatedAccount = null;

      if (modal === 'recharge' && selected) {
        const response = await rechargeGameAccount(
          selected.id,
          form.amount,
          form.note
        );
        updatedAccount = response.data;
      }
      if (modal === 'redeem' && selected) {
        const response = await redeemGameAccount(
          selected.id,
          form.amount,
          form.note
        );
        updatedAccount = response.data;
      }
      if (modal === 'password' && selected) {
        const response = await resetGamePassword(selected.id, form.newPassword);
        updatedAccount = response.data;
      }
      if (modal === 'create') {
        const response = await createGameAccount(
          activeSessionId,
          GAME,
          {
            customerId: selected?.customer_id,
            gameUsername: form.gameUsername,
            nickname:
              String(form.nickname || '').trim() ||
              String(form.gameUsername || '').trim(),
            password: form.password
          }
        );
        setSuccessPrompt(getOrionAccountCreationPrompt(response.data));
      }

      if (updatedAccount) {
        setSuccessPrompt({
          message: 'Successful operation.'
        });
      }

      applyUpdatedAccount(updatedAccount);
      closeModal();
      if (modal === 'create') {
        await refreshSelected();
      } else {
        await fetchHistory();
      }
    } catch (error) {
      setActionError(error.response?.data?.error || 'The Orion Stars operation could not be completed.');
    } finally {
      setActionBusy(false);
    }
  };

  const selectedActionsDisabled = !selected;
  const gameWalletBalance = Number(walletBalance);
  const hasWalletBalance =
    walletBalance !== null &&
    Number.isFinite(gameWalletBalance);

  // --- SESSION LOCK SCREEN CUT-OFF ---
  if (isSessionEnded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-950 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-2xl text-amber-500 animate-pulse">
            ⏳
          </div>
          <h3 className="text-xl font-bold text-slate-100">
            Training Session Ended
          </h3>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed">
            This training simulation session has completed its time tracking or was closed from the main dashboard tab. Operations are now locked.
          </p>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-6 w-full rounded-xl bg-slate-800 py-3 text-sm font-semibold text-slate-200 border border-slate-700 transition hover:bg-slate-700 active:scale-[0.98]"
          >
            Close This Window
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="orion-shell">
      <header className="orion-topbar">
        <h2 className="orion-brand">
          OrionStars <span>(Release) / User Management</span>
        </h2>
        <div className="orion-topbar-actions">
          <button type="button" className="orion-pill orion-download-code">
            Iphone download code
          </button>
          <div className="orion-pill">Welcome TrainingStore&nbsp; (STORE)</div>
        </div>
      </header>

      <div className="orion-walletbar">
        <span data-testid="orion-wallet-balance">
          Balance:{hasWalletBalance ? formatOrionAmount(gameWalletBalance) : 'Loading…'}
        </span>
        <label className="orion-language">
          <Globe2 aria-hidden="true" size={19} strokeWidth={1.6} />
          <span className="sr-only">Language</span>
          <select defaultValue="English" aria-label="Language">
            <option>English</option>
          </select>
        </label>
      </div>

      <div className="orion-workspace">
        <aside className="orion-sidebar" aria-label="Orion Stars navigation">
          {ORION_NAV_ITEMS.map(({ label, icon: Icon }, index) => (
            <button
              key={`${label}-${index}`}
              type="button"
              className={`orion-nav-item ${index === 0 ? 'is-active' : ''}`}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
              <span>{label}</span>
            </button>
          ))}
        </aside>

        <main className="orion-main">
          <section className="orion-management-panel">
            <h3 className="orion-section-title">User Management</h3>
            <div className="orion-divider" />

            <div className="orion-toolbar">
              <div className="orion-search-controls">
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="ID or Account"
                  aria-label="ID or Account"
                />
                <button type="button" onClick={fetchAccounts} className="orion-button orion-button-blue">
                  Search
                </button>
              </div>
              <div className="orion-toolbar-actions">
                <button type="button" onClick={() => openModal('create')} className="orion-button orion-button-purple">
                  Create Player
                </button>
                <button type="button" className="orion-button orion-button-purple">
                  Announcement
                </button>
              </div>
            </div>

            <fieldset className="orion-prohibited-filter">
              <legend>Display prohibited accounts:</legend>
              <label><input type="radio" name="orion-prohibited" /> ON</label>
              <label><input type="radio" name="orion-prohibited" defaultChecked /> OFF</label>
            </fieldset>

            <div className="orion-account-card">
              <table className="orion-detail-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Account</th>
                    <th>NickName</th>
                    <th>Credit</th>
                    <th>Total win</th>
                    <th>Register Date</th>
                    <th>Manager</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="orion-detail-row">
                    <td title={selected?.id || ''}>{selected ? String(selected.id).slice(0, 8) : ''}</td>
                    <td>{selected?.game_username || ''}</td>
                    <td>{selected?.nickname || selected?.game_username || ''}</td>
                    <td data-testid="orion-player-credit">{selected ? formatOrionAmount(selected.balance) : ''}</td>
                    <td>{selected ? '0' : ''}</td>
                    <td>{selected ? formatDateTime(selected.created_at) : ''}</td>
                    <td>{selected ? 'TrainingStore' : ''}</td>
                    <td><span className="orion-status">Active</span></td>
                  </tr>
                  <tr className="orion-actions-row">
                    <td colSpan="8">
                      <div className="orion-account-actions orion-account-actions-primary">
                        <button type="button" disabled={selectedActionsDisabled} onClick={() => openModal('recharge')} className="orion-button orion-button-red">Recharge</button>
                        <button type="button" disabled={selectedActionsDisabled} onClick={() => openModal('redeem')} className="orion-button orion-button-purple">Redeem</button>
                        <button type="button" disabled={selectedActionsDisabled} onClick={() => openModal('password')} className="orion-button orion-button-blue">Reset Password</button>
                        <button type="button" disabled={selectedActionsDisabled} onClick={() => openModal('records')} className="orion-button orion-button-blue">Game Records</button>
                        <button type="button" disabled={selectedActionsDisabled} onClick={() => openModal('records')} className="orion-button orion-button-blue">JP Records</button>
                      </div>
                    </td>
                  </tr>
                  <tr className="orion-actions-row">
                    <td colSpan="8">
                      <div className="orion-account-actions orion-account-actions-secondary">
                        <button type="button" disabled={selectedActionsDisabled} onClick={() => openModal('records')} className="orion-button orion-button-blue">Transaction Records</button>
                        <button type="button" disabled={selectedActionsDisabled} className="orion-button orion-button-blue">Device:Unbind</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="orion-results-panel">
            <div className="orion-results-scroll">
              <table className="orion-results-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>ID</th>
                    <th>Account</th>
                    <th>NickName</th>
                    <th>Register Date</th>
                    <th>Last Login</th>
                    <th>Manager</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(account => (
                    <tr key={account.id}>
                      <td>
                        <button type="button" onClick={() => setSelected(account)} className="orion-select-account">
                          Update
                        </button>
                      </td>
                      <td title={account.id}>{String(account.id).slice(0, 8)}</td>
                      <td>{account.game_username}</td>
                      <td>{account.nickname || account.game_username}</td>
                      <td>{formatDateTime(account.created_at)}</td>
                      <td>—</td>
                      <td>TrainingStore</td>
                      <td>Active</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {modal && (
        <div className={modal === 'create' ? 'orion-create-overlay' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60'}>
          {modal === 'create' ? (
            <section className="orion-create-dialog" role="dialog" aria-modal="true" aria-labelledby="orion-create-title">
              <header className="orion-create-header">
                <h3 id="orion-create-title">Create Player</h3>
                <button type="button" onClick={closeModal} aria-label="Close Create Player">×</button>
              </header>
              <form className="orion-create-form" onSubmit={event => { event.preventDefault(); runAction(); }}>
                <div className="orion-create-row">
                  <label htmlFor="orion-create-account">Account:</label>
                  <input
                    id="orion-create-account"
                    aria-label="Account"
                    value={form.gameUsername || ''}
                    onChange={event => updateForm('gameUsername', event.target.value)}
                    autoComplete="off"
                  />
                  <span className="orion-required-mark">*</span>
                  <p className="orion-create-required">Use 13 or less characters with letters, underscore &amp; numbers.</p>
                </div>

                <div className="orion-create-row">
                  <label htmlFor="orion-create-nickname">NickName:</label>
                  <input
                    id="orion-create-nickname"
                    aria-label="NickName"
                    value={form.nickname || ''}
                    onChange={event => updateForm('nickname', event.target.value)}
                    autoComplete="off"
                  />
                  <span aria-hidden="true" />
                  <p>Will be same as the account if not fill it</p>
                </div>

                <div className="orion-create-row">
                  <label htmlFor="orion-create-password">Login password:</label>
                  <input
                    id="orion-create-password"
                    aria-label="Login password"
                    type="password"
                    value={form.password || ''}
                    onChange={event => updateForm('password', event.target.value)}
                    autoComplete="new-password"
                  />
                  <span className="orion-required-mark">*</span>
                  <p className="orion-create-required">Use letters, underscore &amp; numbers.</p>
                </div>

                <div className="orion-create-row">
                  <label htmlFor="orion-create-password-confirmation">Confirm password:</label>
                  <input
                    id="orion-create-password-confirmation"
                    aria-label="Confirm password"
                    type="password"
                    value={form.passwordConfirmation || ''}
                    onChange={event => updateForm('passwordConfirmation', event.target.value)}
                    autoComplete="new-password"
                  />
                  <span className="orion-required-mark">*</span>
                  <p className="orion-create-required">Please re-enter the password</p>
                </div>

                <button type="submit" disabled={actionBusy} className="orion-create-submit">
                  {actionBusy ? 'Processing…' : 'Create Player'}
                </button>

                {actionError && (
                  <p className="orion-create-error" role="alert">{actionError}</p>
                )}
              </form>
            </section>
          ) : (
            <div className="w-full max-w-4xl rounded bg-white shadow-xl">
              <div className="flex justify-end border-b px-5 py-3">
                <button type="button" onClick={closeModal} className="text-2xl">x</button>
              </div>

              <div className="p-6">
                <h3 className="mb-5 text-center text-xl font-bold text-sky-900">
                  {modal === 'recharge' && 'Recharge'}
                  {modal === 'redeem' && 'Redeem'}
                  {modal === 'password' && 'Reset Password'}
                  {modal === 'records' && 'Transaction Records'}
                </h3>

                {modal === 'recharge' || modal === 'redeem' ? (
                  <form
                    className="orion-recharge-form"
                    onSubmit={event => {
                      event.preventDefault();
                      runAction();
                    }}
                  >
                    <div className="orion-recharge-row">
                      <label htmlFor={modal === 'recharge' ? 'orion-recharge-id' : 'orion-redeem-id'}>ID:</label>
                      <input id={modal === 'recharge' ? 'orion-recharge-id' : 'orion-redeem-id'} value={selected?.id || ''} readOnly />
                    </div>
                    <div className="orion-recharge-row">
                      <label htmlFor={modal === 'recharge' ? 'orion-recharge-account' : 'orion-redeem-account'}>Account:</label>
                      <input id={modal === 'recharge' ? 'orion-recharge-account' : 'orion-redeem-account'} value={selected?.game_username || ''} readOnly />
                    </div>
                    <div className="orion-recharge-row">
                      <label htmlFor={modal === 'recharge' ? 'orion-recharge-credit' : 'orion-redeem-credit'}>Credit:</label>
                      <input id={modal === 'recharge' ? 'orion-recharge-credit' : 'orion-redeem-credit'} value={selected ? formatOrionAmount(selected.balance) : ''} readOnly className="orion-recharge-value" />
                    </div>
                    <div className="orion-recharge-row">
                      <label htmlFor={modal === 'recharge' ? 'orion-recharge-total-win' : 'orion-redeem-total-win'}>Total win:</label>
                      <input id={modal === 'recharge' ? 'orion-recharge-total-win' : 'orion-redeem-total-win'} value="0" readOnly className="orion-recharge-value" />
                    </div>
                    <div className="orion-recharge-row">
                      <label htmlFor={modal === 'recharge' ? 'orion-recharge-available' : 'orion-redeem-available'}>Available Balance:</label>
                      <input id={modal === 'recharge' ? 'orion-recharge-available' : 'orion-redeem-available'} value={hasWalletBalance ? formatOrionAmount(gameWalletBalance) : 'Loading…'} readOnly className="orion-recharge-value" />
                    </div>
                    <div className="orion-recharge-row">
                      <label htmlFor={modal === 'recharge' ? 'orion-recharge-amount' : 'orion-redeem-amount'}>{modal === 'recharge' ? 'Recharge Amount:' : 'Redeem Amount:'}</label>
                      <input id={modal === 'recharge' ? 'orion-recharge-amount' : 'orion-redeem-amount'} aria-label="Amount" type="number" min="1" value={form.amount || ''} onChange={event => updateForm('amount', event.target.value)} autoComplete="off" />
                    </div>
                    <div className="orion-recharge-row orion-recharge-note-row">
                      <label htmlFor={modal === 'recharge' ? 'orion-recharge-note' : 'orion-redeem-note'}>Note:</label>
                      <textarea id={modal === 'recharge' ? 'orion-recharge-note' : 'orion-redeem-note'} value={form.note || ''} onChange={event => updateForm('note', event.target.value)} rows="2" />
                    </div>
                    <button type="submit" disabled={actionBusy} className="orion-recharge-submit">
                      {actionBusy ? 'Processing…' : modal === 'recharge' ? 'Recharge' : 'Redeem'}
                    </button>
                    {actionError && (
                      <p className="orion-recharge-error" role="alert">{actionError}</p>
                    )}
                  </form>
                ) : modal === 'records' ? (
                  <div className="max-h-96 overflow-auto rounded border border-slate-200">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="bg-sky-600 text-white">
                        <tr>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Amount</th>
                          <th className="px-3 py-2">Game</th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Manager</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orionHistory.map(item => (
                          <tr key={item.id} className="border-b">
                            <td className="px-3 py-2">{item.type}</td>
                            <td className="px-3 py-2 font-semibold">{item.amount ?? '-'}</td>
                            <td className="px-3 py-2">{item.game}</td>
                            <td className="px-3 py-2">{formatDateTime(item.acceptedAt || item.created_at)}</td>
                            <td className="px-3 py-2">{item.manager}</td>
                            <td className="px-3 py-2"><span className="rounded-full border border-green-500 px-3 py-1 font-semibold text-green-600">{item.status}</span></td>
                          </tr>
                        ))}
                        {orionHistory.length === 0 && (
                          <tr><td colSpan="6" className="px-3 py-6 text-center text-slate-500">No transaction records available</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {modal !== 'password' && (
                      <label className="block text-sm font-semibold text-slate-800">
                        <span className="mb-1 block">Amount</span>
                        <input type="number" value={form.amount || ''} onChange={event => updateForm('amount', event.target.value)} className="w-full rounded border bg-white px-3 py-2 font-normal text-slate-900 caret-slate-900 selection:bg-sky-200 selection:text-slate-900" />
                      </label>
                    )}
                    {modal === 'password' && (
                      <label className="block text-sm font-semibold text-slate-800">
                        <span className="mb-1 block">New Password</span>
                        <input type="text" value={form.newPassword || ''} onChange={event => updateForm('newPassword', event.target.value)} className="w-full rounded border bg-white px-3 py-2 font-normal text-slate-900 caret-slate-900 selection:bg-sky-200 selection:text-slate-900" />
                      </label>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 border-t">
                <button type="button" onClick={closeModal} className="py-4 font-semibold text-red-500">Close</button>
                {modal !== 'records' && modal !== 'recharge' && modal !== 'redeem' && (
                  <button type="button" disabled={actionBusy} onClick={runAction} className="border-l py-4 font-semibold text-slate-700 disabled:cursor-wait disabled:text-slate-400">{actionBusy ? 'Processing…' : 'Confirm'}</button>
                )}
              </div>
              {actionError && (
                <p className="border-t border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700" role="alert">{actionError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {successPrompt && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" role="presentation">
          <section className="min-h-[150px] w-full max-w-[600px] rounded-[15px] bg-white" role="alertdialog" aria-modal="true" aria-labelledby="orion-success-title" aria-describedby="orion-success-message">
            <h3 id="orion-success-title" className="px-[15px] py-[10px] text-[15px] font-bold text-[#444]">
              Message
            </h3>
            <div className="mx-auto h-px w-[95%] bg-slate-300" aria-hidden="true" />
            <p id="orion-success-message" className="mt-[5px] px-[30px] font-sans text-[13px] leading-5 text-[#4c4c4c]">
              {successPrompt.message}
            </p>
            <div className="mb-[10px] mt-[15px] flex justify-end pr-[135px]">
              <button type="button" onClick={() => setSuccessPrompt(null)} className="h-[30px] w-[65px] rounded bg-[#0382b7] text-sm font-bold text-white hover:bg-[#026f9c]">
              OK
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
