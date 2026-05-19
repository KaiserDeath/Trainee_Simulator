import {
  useCallback,
  useEffect,
  useState
} from 'react';

import {
  createGameAccount,
  getGameAccountHistory,
  rechargeGameAccount,
  redeemGameAccount,
  resetGamePassword,
  searchGameAccounts
} from '../../api/client';

const GAME = 'Orion Stars';

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

export default function OrionStarsPanel({
  session,
  sessionId
}) {
  const activeSessionId = session?.id || sessionId;

  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  // --- FIX: Track an intentional override flag instead of manually mirroring a prop down into local state ---
  const [forceSessionEnd, setForceSessionEnd] = useState(false);

  // DERIVED STATE: This resolves instantly on every single render loop.
  // This eliminates the cascading render loop error thrown by your IA Helper.
  const isSessionEnded = forceSessionEnd || !activeSessionId;

  // --- SYNCHRONIZATION EFFECT: SAFELY CAPTURES CROSS-WINDOW STORAGE EVAPORATION ---
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === 'casino_trainer_session') {
        if (!event.newValue) {
          setForceSessionEnd(true);
        } else {
          try {
            const currentSession = JSON.parse(event.newValue);
            if (currentSession.id !== activeSessionId) {
              setForceSessionEnd(true);
            }
          } catch (error) {
            console.error('Failed to process updated session token:', error);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [activeSessionId]);

  const selectedCustomerId = selected?.customer_id;

  const orionHistory = history.filter(item =>
    item.game === GAME || item.description?.includes(GAME)
  );

  const fetchAccounts = useCallback(async () => {
    if (isSessionEnded || !activeSessionId) return;

    const response = await searchGameAccounts(
      activeSessionId,
      'Orion-Stars',
      query
    );

    setAccounts(response.data || []);
    
    if (selected) {
      const updatedSelected = (response.data || []).find(acc => acc.id === selected.id);
      if (updatedSelected) {
        setSelected(updatedSelected);
      }
    }
  }, [activeSessionId, query, isSessionEnded, selected]);

  const fetchHistory = useCallback(async () => {
    if (!selectedCustomerId || isSessionEnded || !activeSessionId) {
      setHistory([]);
      return;
    }

    const response = await getGameAccountHistory(
      activeSessionId,
      selectedCustomerId
    );

    setHistory(response.data || []);
  }, [activeSessionId, selectedCustomerId, isSessionEnded]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchAccounts();
    }, 200);

    return () => clearTimeout(timeout);
  }, [fetchAccounts]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchHistory();
    }, 0);

    return () => clearTimeout(timeout);
  }, [fetchHistory]);

  const openModal = name => {
    setModal(name);
    if (name === 'create') {
      setForm({ gameUsername: selected?.customer?.username || '' });
      return;
    }
    setForm({});
  };

  const closeModal = () => {
    setModal(null);
    setForm({});
  };

  const updateForm = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const refreshSelected = async () => {
    await fetchAccounts();
    await fetchHistory();
  };

  const runAction = async () => {
    if (isSessionEnded || !activeSessionId) {
      closeModal();
      return;
    }

    if (modal === 'recharge' && selected) {
      await rechargeGameAccount(selected.id, form.amount);
    }
    if (modal === 'redeem' && selected) {
      await redeemGameAccount(selected.id, form.amount);
    }
    if (modal === 'password' && selected) {
      await resetGamePassword(selected.id, form.newPassword);
    }
    if (modal === 'create') {
      await createGameAccount(
        activeSessionId,
        GAME,
        {
          customerId: selected?.customer_id,
          gameUsername: form.gameUsername,
          password: form.password
        }
      );
    }

    closeModal();
    refreshSelected();
  };

  const selectedActionsDisabled = !selected;

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
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
      <div className="flex items-center justify-between bg-[#173954] px-5 py-3 text-white">
        <h2 className="text-xl font-semibold">
          OrionStars
          {' '}
          <span className="text-sm font-normal">
            (Release) / User Management
          </span>
        </h2>
        <div className="rounded-full bg-[#24577d] px-4 py-2 text-sm">
          Welcome Training Store
        </div>
      </div>

      <div className="bg-amber-50 px-4 py-2 text-sm text-blue-600">
        Balance:5016
      </div>

      <div className="grid grid-cols-[210px_1fr]">
        <aside className="border-r border-slate-300 bg-slate-100 p-2">
          {[
            'User Management',
            'Transaction Records',
            'Game Records',
            'JP Records',
            'Reports',
            'Setting',
            'Logout'
          ].map((item, index) => (
            <div
              key={item}
              className={`border-b border-slate-300 px-3 py-3 text-sm font-semibold ${
                index === 0 ? 'bg-white text-slate-900' : 'text-slate-700'
              }`}
            >
              {item}
            </div>
          ))}
        </aside>

        <main className="space-y-4 bg-slate-50 p-5">
          <section className="rounded border border-slate-300 bg-white p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="mb-3 text-lg font-bold text-sky-700">
                  User Management
                </h3>
                <div className="flex gap-2">
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="ID or Account"
                    className="h-10 w-56 rounded border border-slate-400 px-3 outline-none"
                  />
                  <button
                    type="button"
                    onClick={fetchAccounts}
                    className="h-10 rounded bg-sky-700 px-6 text-white"
                  >
                    Search
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openModal('create')}
                className="rounded bg-purple-600 px-5 py-3 text-white"
              >
                Create Player
              </button>
            </div>

            <div className="mb-3 text-sm font-semibold">
              Display prohibited accounts: <span className="font-normal">OFF</span>
            </div>

            <div className="overflow-hidden border border-slate-300">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr className="border-b border-slate-300 bg-white">
                    <th className="py-3">ID</th>
                    <th>Account</th>
                    <th>NickName</th>
                    <th>Credit</th>
                    <th>Total win</th>
                    <th>Manager</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selected ? (
                    <tr className="border-b border-slate-300">
                      <td className="py-3">{selected.id}</td>
                      <td>{selected.game_username}</td>
                      <td>{selected.game_username}</td>
                      <td className="font-semibold">{Number(selected.balance).toFixed(2)}</td>
                      <td>0.00</td>
                      <td>TrainingStore</td>
                      <td>
                        <span className="rounded bg-sky-600 px-3 py-2 text-white">Active</span>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan="7" className="py-4 text-slate-500">
                        Search and click Update to select an account.
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan="7" className="py-3">
                      <div className="flex flex-wrap justify-center gap-6">
                        <button
                          type="button"
                          disabled={selectedActionsDisabled}
                          onClick={() => openModal('recharge')}
                          className="rounded bg-red-600 px-5 py-2 text-white disabled:bg-slate-300"
                        >
                          Recharge
                        </button>
                        <button
                          type="button"
                          disabled={selectedActionsDisabled}
                          onClick={() => openModal('redeem')}
                          className="rounded bg-purple-600 px-5 py-2 text-white disabled:bg-slate-300"
                        >
                          Redeem
                        </button>
                        <button
                          type="button"
                          disabled={selectedActionsDisabled}
                          onClick={() => openModal('password')}
                          className="rounded bg-sky-700 px-5 py-2 text-white disabled:bg-slate-300"
                        >
                          Reset Password
                        </button>
                        <button
                          type="button"
                          disabled={selectedActionsDisabled}
                          onClick={() => openModal('records')}
                          className="rounded bg-sky-700 px-5 py-2 text-white disabled:bg-slate-300"
                        >
                          Transaction Records
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-slate-300 bg-white p-3">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className="bg-sky-600 text-white">
                  <th className="py-2"></th>
                  <th>ID</th>
                  <th>Account</th>
                  <th>NickName</th>
                  <th>Manager</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => (
                  <tr key={account.id} className="border-b border-slate-300">
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setSelected(account)}
                        className="rounded bg-sky-600 px-4 py-2 text-white"
                      >
                        Update
                      </button>
                    </td>
                    <td>{account.id}</td>
                    <td>{account.game_username}</td>
                    <td>{account.game_username}</td>
                    <td>TrainingStore</td>
                    <td>Active</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-4xl rounded bg-white shadow-xl">
            <div className="flex justify-end border-b px-5 py-3">
              <button type="button" onClick={closeModal} className="text-2xl">x</button>
            </div>

            <div className="p-6">
              <h3 className="mb-5 text-center text-xl font-bold text-sky-900">
                {modal === 'recharge' && 'Recharge'}
                {modal === 'redeem' && 'Redeem'}
                {modal === 'password' && 'Reset Password'}
                {modal === 'create' && 'Create Player'}
                {modal === 'records' && 'Transaction Records'}
              </h3>

              {modal === 'records' ? (
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
                          <td className="px-3 py-2">
                            {formatDateTime(item.acceptedAt || item.created_at)}
                          </td>
                          <td className="px-3 py-2">{item.manager}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full border border-green-500 px-3 py-1 font-semibold text-green-600">
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {orionHistory.length === 0 && (
                        <tr>
                          <td colSpan="6" className="px-3 py-6 text-center text-slate-500">
                            No transaction records available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {modal === 'create' && (
                    <label className="block text-sm font-semibold">
                      <span className="mb-1 block">Account</span>
                      <input
                        value={form.gameUsername || ''}
                        onChange={event => updateForm('gameUsername', event.target.value)}
                        className="w-full rounded border px-3 py-2 font-normal"
                      />
                    </label>
                  )}

                  {modal !== 'create' && modal !== 'password' && (
                    <label className="block text-sm font-semibold">
                      <span className="mb-1 block">Amount</span>
                      <input
                        type="number"
                        value={form.amount || ''}
                        onChange={event => updateForm('amount', event.target.value)}
                        className="w-full rounded border px-3 py-2 font-normal"
                      />
                    </label>
                  )}

                  {(modal === 'create' || modal === 'password') && (
                    <label className="block text-sm font-semibold">
                      <span className="mb-1 block">New Password</span>
                      <input
                        type="text"
                        value={form.password || form.newPassword || ''}
                        onChange={event =>
                          updateForm(
                            modal === 'create' ? 'password' : 'newPassword',
                            event.target.value
                          )
                        }
                        className="w-full rounded border px-3 py-2 font-normal"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 border-t">
              <button type="button" onClick={closeModal} className="py-4 font-semibold text-red-500">
                Close
              </button>
              {modal !== 'records' && (
                <button type="button" onClick={runAction} className="border-l py-4 font-semibold text-slate-700">
                  Confirma
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}