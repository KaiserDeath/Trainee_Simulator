import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  createGameAccount,
  getGameAccountHistory,
  getSessionById,
  rechargeGameAccount,
  redeemGameAccount,
  resetGamePassword,
  searchGameAccounts
} from '../../api/client';

const GAME = 'Vblink';

const PASSWORD_REGEX =
  /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^/.,()]{6,16}$/;

const PASSWORD_HINT =
  'Length must be 6-16 characters! Must include a combination of numbers and letters, and allows some special characters: !@#$%^/.,()';

const NOT_AVAILABLE_MSG =
  'OPSS, QUITE CLOSE BUT NOT HERE 😛';

const HARDCODED = {
  operatorName: 'Atencionpre1',
  myScore: '27497.62',
  inviteCode: 'STROS1',
  registrationToday: 1,
  loginToday: 78,
  profitToday: '1,222.92',
  totalProfit: '47,728.10',
  agent: {
    userName: 'MushKing',
    score: 0,
    inviteCode: 'MUSH',
    buildUpTime: '2025-05-22 15:31:38'
  }
};

const formatDateTime = value => {
  if (!value) return '-';
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const useClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
};

export default function VblinkPanel({ session, sessionId }) {
  const activeSessionId = session?.id || sessionId;
  const now = useClock();

  const [view, setView] = useState('home');
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('Player account');

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState(null);
  const [scoreLog, setScoreLog] = useState([]);

  // --- SESSION MANIPULATION STATE ---
  const [forceSessionEnd, setForceSessionEnd] = useState(false);

  // DERIVED STATE: Instantly active tracking on every render engine loop
  const isSessionEnded = forceSessionEnd || !activeSessionId;

  // --- CROSS-TAB SYNCHRONIZATION EFFECT ---
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

  const fetchAccounts = useCallback(async () => {
    if (isSessionEnded || !activeSessionId) return;
    const response = await searchGameAccounts(
      activeSessionId,
      'Vblink',
      ''
    );
    setAccounts(response.data);
  }, [activeSessionId, isSessionEnded]);

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchAccounts();
      } catch (err) {
        console.error(err);
      }
    };
    loadData();
  }, [fetchAccounts]);

  const filteredAccounts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter(a =>
      a.game_username?.toLowerCase().includes(term)
    );
  }, [accounts, searchTerm]);

  const openModal = (name, initial = {}) => {
    setForm(initial);
    setFormError('');
    setModal(name);
  };

  const closeModal = () => {
    setModal(null);
    setForm({});
    setFormError('');
  };

  const updateForm = (key, value) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const showNotAvailable = () =>
    setNotice({ title: 'Message', message: NOT_AVAILABLE_MSG });

  const customerBalance = Number(selected?.customer?.balance || 0);
  const playerScore = Number(selected?.balance || 0);

  // =================== HANDLE TOP SEARCH ===================
  const handleTopSearch = (query) => {
    setSearchTerm(query);
    setView('searchUser');
  };

  // =================== ADD PLAYER ===================
  const submitAddPlayer = async () => {
    if (isSessionEnded) {
      closeModal();
      return;
    }
    const userName = String(form.userName || '').trim();
    const password = String(form.password || '');
    const initialScore = Number(form.setScore || 0);

    if (!userName) {
      setFormError('User Name is required');
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setFormError(PASSWORD_HINT);
      return;
    }
    if (initialScore < 0) {
      setFormError('Set Score must be 0 or positive');
      return;
    }

    try {
      const created = await createGameAccount(
        activeSessionId,
        GAME,
        {
          gameUsername: userName,
          password,
          customerName: String(form.name || '').trim() || userName
        }
      );

      if (initialScore > 0) {
        await rechargeGameAccount(created.data.id, initialScore);
      }

      closeModal();
      await fetchAccounts();
      setNotice({ title: 'Message', message: 'Player created successfully' });
    } catch (err) {
      setFormError(err.response?.data?.error || 'Could not create player');
    }
  };

  // =================== SET SCORE ===================
  const submitSetScore = async () => {
    if (isSessionEnded || !selected) {
      closeModal();
      return;
    }
    const value = Number(form.amount);
    if (!Number.isFinite(value) || value === 0) {
      setFormError('Enter a non-zero amount (positive to add, negative to redeem)');
      return;
    }

    try {
      if (value > 0) {
        if (value > customerBalance) {
          setFormError(`Maximum allowed: ${customerBalance.toFixed(2)}`);
          return;
        }
        await rechargeGameAccount(selected.id, value);
      } else {
        const abs = Math.abs(value);
        if (abs > playerScore) {
          setFormError(`Player score is ${playerScore.toFixed(2)}`);
          return;
        }
        await redeemGameAccount(selected.id, abs);
      }
      closeModal();
      await fetchAccounts();
      setNotice({ title: 'Message', message: 'Score updated successfully' });
    } catch (err) {
      setFormError(err.response?.data?.error || 'Set Score failed');
    }
  };

  // =================== EDIT (RESET PASSWORD) ===================
  const submitEditPassword = async () => {
    if (isSessionEnded || !selected) {
      closeModal();
      return;
    }
    const password = String(form.password || '');
    if (!PASSWORD_REGEX.test(password)) {
      setFormError(PASSWORD_HINT);
      return;
    }
    try {
      await resetGamePassword(selected.id, password);
      closeModal();
      await fetchAccounts();
      setNotice({ title: 'Message', message: 'Password reset successfully' });
    } catch (err) {
      setFormError(err.response?.data?.error || 'Password reset failed');
    }
  };

  // =================== SCORE LOG ===================
  const openScoreLog = async account => {
    if (isSessionEnded) return;
    setSelected(account);
    const response = await getGameAccountHistory(
      activeSessionId,
      account.customer_id
    );
    setScoreLog(
      response.data.filter(item => item.game === GAME)
    );
    openModal('scoreLog');
  };

  // --- VBLINK LOCK SCREEN CUT-OFF ---
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

  // =================== UI ===================
  return (
    <div className="h-screen bg-[#f4f6fb] flex flex-col overflow-hidden" data-testid="vblink-panel">
      <Header now={now} view={view} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          setView={setView}
          showNotAvailable={showNotAvailable}
          onSearchSubmit={handleTopSearch}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <Breadcrumb view={view} setView={setView} />

          {view === 'home' && <HomeView />}

          {view === 'userManagement' && (
            <UserManagementView
              accounts={filteredAccounts}
              selected={selected}
              setSelected={setSelected}
              openModal={openModal}
              openScoreLog={openScoreLog}
              showNotAvailable={showNotAvailable}
            />
          )}

          {view === 'searchUser' && (
            <SearchUserView
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              searchType={searchType}
              setSearchType={setSearchType}
              accounts={filteredAccounts}
              setSelected={setSelected}
              openModal={openModal}
              openScoreLog={openScoreLog}
            />
          )}
        </main>
      </div>

      {modal === 'addPlayer' && (
        <AddPlayerModal
          form={form}
          updateForm={updateForm}
          submit={submitAddPlayer}
          close={closeModal}
          error={formError}
          maximum={HARDCODED.myScore}
        />
      )}

      {modal === 'setScore' && (
        <SetScoreModal
          selected={selected}
          form={form}
          updateForm={updateForm}
          submit={submitSetScore}
          close={closeModal}
          error={formError}
          customerBalance={customerBalance}
          playerScore={playerScore}
        />
      )}

      {modal === 'editPassword' && (
        <EditPasswordModal
          selected={selected}
          form={form}
          updateForm={updateForm}
          submit={submitEditPassword}
          close={closeModal}
          error={formError}
        />
      )}

      {modal === 'scoreLog' && (
        <ScoreLogModal
          selected={selected}
          log={scoreLog}
          close={closeModal}
        />
      )}

      {notice && (
        <MessageDialog
          title={notice.title}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  );
}

// ======================================================
// HEADER
// ======================================================
function Header({ now, view }) {
  const viewLabel =
    view === 'home'
      ? 'Home'
      : view === 'userManagement'
        ? 'User management / User Management'
        : 'User management / Search User';

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
      <div className="flex items-center gap-5">
        <span className="text-slate-600 text-xl">≡</span>
        <span className="font-semibold text-slate-800 text-base">👤 {HARDCODED.operatorName}</span>
        <span
          className="rounded-full bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm"
          data-testid="vblink-my-score"
        >
          My score: {HARDCODED.myScore}
        </span>
        <span className="text-sm text-slate-500">
          📅 system time: {formatDateTime(now)} UTC-00:00
        </span>
        <span className="text-sm text-slate-500">{viewLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-500 text-lg">❓</span>
        <span className="rounded border border-green-400 bg-white px-4 py-1.5 text-sm text-green-600">
          🟢 Contact Customer Service
        </span>
      </div>
    </header>
  );
}

// ======================================================
// SIDEBAR (full height, wider, larger font)
// ======================================================
function Sidebar({ view, setView, showNotAvailable, onSearchSubmit }) {
  const [openUM, setOpenUM] = useState(true);
  const [localSearch, setLocalSearch] = useState('');

  const itemClass = active =>
    `block w-full cursor-pointer border-b border-slate-700 px-6 py-4 text-left text-base ${
      active ? 'text-cyan-300 font-semibold' : 'text-slate-200 hover:bg-slate-700'
    }`;

  const handleSearch = () => {
    if (localSearch.trim()) {
      onSearchSubmit?.(localSearch.trim());
      setLocalSearch('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <aside className="w-64 bg-[#1f3148] text-slate-200 flex flex-col h-full overflow-y-auto">
      <div className="border-b border-slate-700 px-4 py-4">
        <div className="relative">
          <input
            placeholder="Search..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded bg-slate-700 px-4 py-2 pl-9 text-base text-white outline-none placeholder:text-slate-400"
          />
          <button
            onClick={handleSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-lg"
          >
            🔍
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setView('home')}
        className={itemClass(view === 'home')}
        data-testid="vblink-sidebar-home"
      >
        🏠 Home
      </button>

      <button
        type="button"
        onClick={() => setOpenUM(o => !o)}
        className={itemClass(view === 'userManagement' || view === 'searchUser')}
        data-testid="vblink-sidebar-user-management"
      >
        👤 User management {openUM ? '˄' : '˅'}
      </button>

      {openUM && (
        <div className="bg-[#172638]">
          <button
            type="button"
            onClick={() => setView('userManagement')}
            className={`block w-full pl-12 py-3 text-left text-base ${
              view === 'userManagement' ? 'text-cyan-300 font-semibold' : 'text-slate-300 hover:bg-slate-700'
            }`}
            data-testid="vblink-sidebar-user-management-sub"
          >
            👤 User Management
          </button>
          <button
            type="button"
            onClick={() => setView('searchUser')}
            className={`block w-full pl-12 py-3 text-left text-base ${
              view === 'searchUser' ? 'text-cyan-300 font-semibold' : 'text-slate-300 hover:bg-slate-700'
            }`}
            data-testid="vblink-sidebar-search-user"
          >
            🔍 Search User
          </button>
          <button
            type="button"
            onClick={showNotAvailable}
            className="block w-full pl-12 py-3 text-left text-base text-slate-300 hover:bg-slate-700"
          >
            ✅ Online Player
          </button>
        </div>
      )}

      <button type="button" onClick={showNotAvailable} className={itemClass(false)}>
        ⚙ Deposit setting
      </button>
      <button type="button" onClick={showNotAvailable} className={itemClass(false)}>
        📄 Record enquiry
      </button>
      <button type="button" onClick={showNotAvailable} className={itemClass(false)}>
        🧾 Personal Info
      </button>
      <button
        type="button"
        onClick={showNotAvailable}
        className="block w-full px-6 py-4 text-left text-base text-orange-400 hover:bg-slate-700"
      >
        ↪ Logout
      </button>
    </aside>
  );
}

// ======================================================
// BREADCRUMB
// ======================================================
function Breadcrumb({ view, setView }) {
  return (
    <div className="mb-4 flex gap-2">
      <button
        type="button"
        onClick={() => setView('home')}
        className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Home
      </button>
      {view === 'userManagement' && (
        <span className="rounded border border-green-400 bg-green-50 px-4 py-2 text-sm text-green-700">
          ● User Management ×
        </span>
      )}
      {view === 'searchUser' && (
        <span className="rounded border border-green-400 bg-green-50 px-4 py-2 text-sm text-green-700">
          ● Search User ×
        </span>
      )}
    </div>
  );
}

// ======================================================
// HOME VIEW (decorative)
// ======================================================
function HomeView() {
  const cards = [
    { icon: '👤', label: 'Registration today', value: HARDCODED.registrationToday, color: 'bg-cyan-100 text-cyan-600' },
    { icon: '👥', label: 'Login today', value: HARDCODED.loginToday, color: 'bg-cyan-100 text-cyan-600' },
    { icon: '💰', label: 'Profit today', value: HARDCODED.profitToday, color: 'bg-rose-100 text-rose-600' },
    { icon: '💰', label: 'Total profit', value: HARDCODED.totalProfit, color: 'bg-rose-100 text-rose-600' }
  ];

  return (
    <div>
      <button className="mb-4 rounded bg-cyan-100 px-5 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-200">
        Refresh
      </button>
      <div className="grid grid-cols-4 gap-5">
        {cards.map(c => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-5">
              <div className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${c.color}`}>
                {c.icon}
              </div>
              <div>
                <p className="text-sm text-slate-500">{c.label}</p>
                <p className="text-2xl font-bold text-slate-800">{c.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======================================================
// USER MANAGEMENT VIEW
// ======================================================
function UserManagementView({
  accounts,
  selected,
  setSelected,
  openModal,
  openScoreLog,
  showNotAvailable
}) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">User Management</h1>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <span className="rounded bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white">
            {HARDCODED.operatorName} - Agents List
          </span>
          <button onClick={showNotAvailable} className="text-sm font-medium text-cyan-600 hover:text-cyan-800">
            Agent total report
          </button>
          <button onClick={showNotAvailable} className="text-sm font-medium text-cyan-600 hover:text-cyan-800">
            Refresh
          </button>
        </div>

        <table className="w-full text-center">
          <thead className="bg-[#6c63ff] text-white">
            <tr>
              <th className="py-4 font-medium">#</th>
              <th className="py-4 font-medium">User Name</th>
              <th className="py-4 font-medium">Score</th>
              <th className="py-4 font-medium">Invite Code</th>
              <th className="py-4 font-medium">Regional restrictions</th>
              <th className="py-4 font-medium">Build up time</th>
              <th className="py-4 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-4">1</td>
              <td className="text-cyan-600 font-medium">{HARDCODED.agent.userName}</td>
              <td>{HARDCODED.agent.score}</td>
              <td>{HARDCODED.agent.inviteCode}</td>
              <td>-</td>
              <td>{HARDCODED.agent.buildUpTime}</td>
              <td>
                <div className="flex justify-center gap-2">
                  {['Set Score', 'Score Log', 'Edit', 'Report', 'Disable'].map(label => (
                    <button
                      key={label}
                      onClick={showNotAvailable}
                      className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <span className="rounded bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white">
            {HARDCODED.operatorName} - Players list
          </span>
          <button
            onClick={() => openModal('addPlayer')}
            className="text-sm font-medium text-cyan-600 hover:text-cyan-800"
            data-testid="vblink-add-player-btn"
          >
            Add Player
          </button>
          <button onClick={showNotAvailable} className="text-sm font-medium text-cyan-600 hover:text-cyan-800">
            Players Total Report
          </button>
          <button onClick={showNotAvailable} className="text-sm font-medium text-cyan-600 hover:text-cyan-800">
            Enable All Players
          </button>
          <button onClick={showNotAvailable} className="text-sm font-medium text-cyan-600 hover:text-cyan-800">
            Disable All Players
          </button>
          <button onClick={showNotAvailable} className="text-sm font-medium text-cyan-600 hover:text-cyan-800">
            Reload PlayerList
          </button>
        </div>

        <PlayersTable
          accounts={accounts}
          selected={selected}
          setSelected={setSelected}
          openModal={openModal}
          openScoreLog={openScoreLog}
        />
      </section>
    </div>
  );
}

// ======================================================
// SEARCH USER VIEW
// ======================================================
function SearchUserView({
  searchTerm,
  setSearchTerm,
  searchType,
  setSearchType,
  accounts,
  setSelected,
  openModal,
  openScoreLog
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-8">
        {['Agent account', 'Player account', 'Connect game provider UID'].map(type => (
          <label key={type} className="flex items-center gap-2">
            <input
              type="radio"
              checked={searchType === type}
              onChange={() => setSearchType(type)}
              className="h-4 w-4 text-cyan-600 focus:ring-cyan-500"
            />
            <span className={searchType === type ? 'font-semibold text-cyan-600' : 'text-slate-700'}>
              {type}
            </span>
          </label>
        ))}
      </div>

      <div className="mb-5 flex gap-3">
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Enter user name"
          className="h-10 w-80 rounded-md border border-slate-300 px-4 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          data-testid="vblink-search-input"
        />
        <button
          onClick={() => {}}
          className="rounded-md bg-cyan-500 px-8 font-semibold text-white shadow-sm hover:bg-cyan-600"
          data-testid="vblink-search-ok"
        >
          OK
        </button>
      </div>

      <PlayersTable
        accounts={accounts}
        selected={null}
        setSelected={setSelected}
        openModal={openModal}
        openScoreLog={openScoreLog}
      />
    </div>
  );
}

// ======================================================
// PLAYERS TABLE
// ======================================================
function PlayersTable({ accounts, selected, setSelected, openModal, openScoreLog }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse text-center">
        <thead className="bg-[#6c63ff] text-white">
          <tr>
            <th className="py-4 px-3 font-medium text-base">#</th>
            <th className="py-4 px-3 font-medium text-base">User Name</th>
            <th className="py-4 px-3 font-medium text-base">Player Level</th>
            <th className="py-4 px-3 font-medium text-base">Score</th>
            <th className="py-4 px-3 font-medium text-base">Slotmania Score</th>
            <th className="py-4 px-3 font-medium text-base">Bonus Score</th>
            <th className="py-4 px-3 font-medium text-base">Convertible Bonus Score</th>
            <th className="py-4 px-3 font-medium text-base">Safe</th>
            <th className="py-4 px-3 font-medium text-base">Online</th>
            <th className="py-4 px-3 font-medium text-base">Build up time</th>
            <th className="py-4 px-3 font-medium text-base">Action</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {accounts.length === 0 && (
            <tr>
              <td colSpan="11" className="py-8 text-center text-slate-500">
                No players to display
              </td>
            </tr>
          )}
          {accounts.map((a, i) => {
            const isSelected = selected?.id === a.id;
            return (
              <tr
                key={a.id}
                className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-cyan-50' : ''}`}
                data-testid={`vblink-player-row-${a.game_username}`}
              >
                <td className="py-4 px-3">{i + 1}</td>
                <td className="text-cyan-600 font-medium">{a.game_username}</td>
                <td>1</td>
                <td className="font-semibold text-slate-800">{Number(a.balance || 0).toFixed(2)}</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-600">Offline</span>
                </td>
                <td>{formatDateTime(a.created_at)}</td>
                <td>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() => {
                        setSelected(a);
                        openModal('setScore', { amount: '' });
                      }}
                      className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
                      data-testid={`vblink-set-score-${a.game_username}`}
                    >
                      Set Score
                    </button>
                    <button
                      onClick={() => openScoreLog(a)}
                      className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
                      data-testid={`vblink-score-log-${a.game_username}`}
                    >
                      Score Log
                    </button>
                    <button
                      onClick={() => {
                        setSelected(a);
                        openModal('editPassword', { password: '' });
                      }}
                      className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
                      data-testid={`vblink-edit-${a.game_username}`}
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ======================================================
// MODALS
// ======================================================
function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
        </div>
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
}

function AddPlayerModal({ form, updateForm, submit, close, error, maximum }) {
  return (
    <ModalShell title="Add Player" onClose={close}>
      <div className="space-y-5">
        <Field label="Upline">
          <span className="rounded bg-slate-100 px-4 py-2 text-sm text-slate-700">{HARDCODED.operatorName}</span>
        </Field>

        <Field label="* User Name" highlight>
          <input
            value={form.userName || ''}
            onChange={e => updateForm('userName', e.target.value)}
            className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            data-testid="vblink-add-player-username"
          />
        </Field>

        <Field label="* Password" highlight>
          <input
            value={form.password || ''}
            onChange={e => updateForm('password', e.target.value)}
            placeholder={PASSWORD_HINT}
            className="w-full rounded-md border border-rose-300 px-4 py-2.5 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            data-testid="vblink-add-player-password"
          />
        </Field>

        <Field label={`Set Score (Maximum ${maximum})`}>
          <input
            type="number"
            value={form.setScore || ''}
            onChange={e => updateForm('setScore', e.target.value)}
            placeholder="0"
            className="w-full rounded-md border border-slate-300 px-4 py-2.5 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            data-testid="vblink-add-player-set-score"
          />
        </Field>

        <Field label="Name">
          <input
            value={form.name || ''}
            onChange={e => updateForm('name', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-4 py-2.5 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </Field>

        <Field label="Tel">
          <input
            value={form.tel || ''}
            onChange={e => updateForm('tel', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-4 py-2.5 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </Field>

        <Field label="Remarks">
          <textarea
            value={form.remarks || ''}
            onChange={e => updateForm('remarks', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-4 py-2.5 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            rows="3"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={submit}
            className="rounded-md bg-cyan-500 px-8 py-2.5 font-semibold text-white shadow-sm hover:bg-cyan-600"
            data-testid="vblink-add-player-ok"
          >
            OK
          </button>
          <button
            onClick={close}
            className="rounded-md border border-slate-300 bg-white px-8 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function SetScoreModal({
  selected,
  form,
  updateForm,
  submit,
  close,
  error,
  customerBalance,
  playerScore
}) {
  return (
    <ModalShell title={`Set Score — ${selected?.game_username}`} onClose={close}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <div>
            <span className="font-semibold text-slate-700">Player Score: </span>
            <span className="font-mono font-medium" data-testid="vblink-set-score-current">
              {playerScore.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="font-semibold text-slate-700">Customer Balance (Max load): </span>
            <span className="font-mono font-medium" data-testid="vblink-set-score-max">
              {customerBalance.toFixed(2)}
            </span>
          </div>
        </div>

        <Field label="Amount (positive = add, negative = redeem)">
          <input
            type="number"
            value={form.amount ?? ''}
            onChange={e => updateForm('amount', e.target.value)}
            className="w-full rounded-md border border-slate-300 px-4 py-2.5 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            data-testid="vblink-set-score-amount"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={submit}
            className="rounded-md bg-cyan-500 px-8 py-2.5 font-semibold text-white shadow-sm hover:bg-cyan-600"
            data-testid="vblink-set-score-ok"
          >
            OK
          </button>
          <button
            onClick={close}
            className="rounded-md border border-slate-300 bg-white px-8 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function EditPasswordModal({ selected, form, updateForm, submit, close, error }) {
  return (
    <ModalShell title={`Edit — ${selected?.game_username}`} onClose={close}>
      <div className="space-y-5">
        <Field label="* New Password" highlight>
          <input
            value={form.password || ''}
            onChange={e => updateForm('password', e.target.value)}
            placeholder={PASSWORD_HINT}
            className="w-full rounded-md border border-rose-300 px-4 py-2.5 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            data-testid="vblink-edit-password-input"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={submit}
            className="rounded-md bg-cyan-500 px-8 py-2.5 font-semibold text-white shadow-sm hover:bg-cyan-600"
            data-testid="vblink-edit-password-ok"
          >
            OK
          </button>
          <button
            onClick={close}
            className="rounded-md border border-slate-300 bg-white px-8 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ScoreLogModal({ selected, log, close }) {
  return (
    <ModalShell title={`Score Log — ${selected?.game_username}`} onClose={close}>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#6c63ff] text-white">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Manager</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {log.length === 0 && (
              <tr>
                <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                  No transaction records
                </td>
              </tr>
            )}
            {log.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">{item.type}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{item.amount ?? '-'}</td>
                <td className="px-4 py-3">{formatDateTime(item.acceptedAt || item.created_at)}</td>
                <td className="px-4 py-3">{item.manager}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-green-500 px-3 py-1 text-xs font-semibold text-green-600">
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}

function MessageDialog({ title, message, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-24">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
        </div>
        <div className="px-6 py-8 text-center text-slate-700">{message}</div>
        <div className="flex justify-end p-4">
          <button
            onClick={onClose}
            className="rounded-md bg-cyan-500 px-8 py-2.5 font-semibold text-white shadow-sm hover:bg-cyan-600"
            data-testid="vblink-notice-ok"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, highlight = false }) {
  return (
    <label className="block">
      <span className={`mb-1 block text-sm font-semibold ${highlight ? 'text-rose-600' : 'text-slate-700'}`}>
        {label}
      </span>
      {children}
    </label>
  );
}