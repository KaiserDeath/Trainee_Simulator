import {
  useCallback,
  useEffect,
  useMemo,
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

  const fetchAccounts = useCallback(async () => {
    const response = await searchGameAccounts(
      activeSessionId,
      'Vblink',
      ''
    );
    setAccounts(response.data);
  }, [activeSessionId]);

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

  // =================== ADD PLAYER ===================
  const submitAddPlayer = async () => {
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
    if (!selected) return;
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
    if (!selected) return;
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

  // =================== UI ===================
  return (
    <div className="min-h-screen bg-[#f4f6fb] text-sm text-slate-800" data-testid="vblink-panel">
      <Header now={now} view={view} />

      <div className="flex">
        <Sidebar
          view={view}
          setView={setView}
          showNotAvailable={showNotAvailable}
        />

        <main className="flex-1 p-4">
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
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="text-slate-600">≡</span>
        <span className="font-semibold">👤 {HARDCODED.operatorName}</span>
        <span
          className="rounded-full bg-cyan-400 px-3 py-1 text-xs font-semibold text-white"
          data-testid="vblink-my-score"
        >
          My score: {HARDCODED.myScore}
        </span>
        <span className="text-xs text-slate-500">
          📅 system time: {formatDateTime(now)} UTC-00:00
        </span>
        <span className="text-xs text-slate-500">{viewLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-500">❓</span>
        <span className="rounded border border-green-400 px-3 py-1 text-xs text-green-600">
          🟢 Contact Customer Service
        </span>
      </div>
    </header>
  );
}

// ======================================================
// SIDEBAR
// ======================================================
function Sidebar({ view, setView, showNotAvailable }) {
  const [openUM, setOpenUM] = useState(true);

  const itemClass = active =>
    `block w-full cursor-pointer border-b border-slate-700 px-5 py-3 text-left ${
      active ? 'text-cyan-300' : 'text-slate-200 hover:bg-slate-700'
    }`;

  return (
    <aside className="w-56 bg-[#1f3148] text-slate-200">
      <div className="border-b border-slate-700 px-4 py-3">
        <input
          placeholder="Search..."
          className="w-full rounded bg-slate-700 px-3 py-1 text-sm text-white outline-none"
        />
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
            className={`block w-full px-10 py-2 text-left text-sm ${
              view === 'userManagement' ? 'text-cyan-300' : 'text-slate-300 hover:bg-slate-700'
            }`}
            data-testid="vblink-sidebar-user-management-sub"
          >
            👤 User Management
          </button>
          <button
            type="button"
            onClick={() => setView('searchUser')}
            className={`block w-full px-10 py-2 text-left text-sm ${
              view === 'searchUser' ? 'text-cyan-300' : 'text-slate-300 hover:bg-slate-700'
            }`}
            data-testid="vblink-sidebar-search-user"
          >
            🔍 Search User
          </button>
          <button
            type="button"
            onClick={showNotAvailable}
            className="block w-full px-10 py-2 text-left text-sm text-slate-300 hover:bg-slate-700"
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
        className="block w-full px-5 py-3 text-left text-orange-400 hover:bg-slate-700"
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
    <div className="mb-3 flex gap-2">
      <button
        type="button"
        onClick={() => setView('home')}
        className="rounded border border-slate-300 bg-white px-3 py-1 text-sm"
      >
        Home
      </button>
      {view === 'userManagement' && (
        <span className="rounded border border-green-400 bg-green-50 px-3 py-1 text-sm text-green-700">
          ● User Management ×
        </span>
      )}
      {view === 'searchUser' && (
        <span className="rounded border border-green-400 bg-green-50 px-3 py-1 text-sm text-green-700">
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
      <button className="mb-3 rounded bg-cyan-100 px-4 py-1 text-cyan-700">Refresh</button>
      <div className="grid grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="rounded bg-white p-5 shadow">
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${c.color}`}>
                {c.icon}
              </div>
              <div>
                <p className="text-sm text-slate-500">{c.label}</p>
                <p className="text-2xl font-semibold">{c.value}</p>
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
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">User Management</h1>

      <section className="rounded border border-slate-200 bg-white shadow">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
          <span className="rounded bg-rose-400 px-3 py-1 text-xs font-semibold text-white">
            {HARDCODED.operatorName} - Agents List
          </span>
          <button onClick={showNotAvailable} className="text-sm text-cyan-600">Agent total report</button>
          <button onClick={showNotAvailable} className="text-sm text-cyan-600">Refresh</button>
        </div>

        <table className="w-full text-center">
          <thead className="bg-[#6c63ff] text-white">
            <tr>
              <th className="py-3">#</th>
              <th>User Name</th>
              <th>Score</th>
              <th>Invite Code</th>
              <th>Regional restrictions</th>
              <th>Build up time</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-3">1</td>
              <td className="text-cyan-600">{HARDCODED.agent.userName}</td>
              <td>{HARDCODED.agent.score}</td>
              <td>{HARDCODED.agent.inviteCode}</td>
              <td>-</td>
              <td>{HARDCODED.agent.buildUpTime}</td>
              <td>
                <div className="flex justify-center gap-1">
                  {['Set Score', 'Score Log', 'Edit', 'Report', 'Disable'].map(label => (
                    <button
                      key={label}
                      onClick={showNotAvailable}
                      className="rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-white"
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

      <section className="rounded border border-slate-200 bg-white shadow">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
          <span className="rounded bg-rose-400 px-3 py-1 text-xs font-semibold text-white">
            {HARDCODED.operatorName} - Players list
          </span>
          <button
            onClick={() => openModal('addPlayer')}
            className="text-sm text-cyan-600"
            data-testid="vblink-add-player-btn"
          >
            Add Player
          </button>
          <button onClick={showNotAvailable} className="text-sm text-cyan-600">Players Total Report</button>
          <button onClick={showNotAvailable} className="text-sm text-cyan-600">Enable All Players</button>
          <button onClick={showNotAvailable} className="text-sm text-cyan-600">Disable All Players</button>
          <button onClick={showNotAvailable} className="text-sm text-cyan-600">Reload PlayerList</button>
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
    <div className="rounded border border-slate-200 bg-white p-5 shadow">
      <div className="mb-4 flex items-center gap-6">
        {['Agent account', 'Player account', 'Connect game provider UID'].map(type => (
          <label key={type} className="flex items-center gap-2">
            <input
              type="radio"
              checked={searchType === type}
              onChange={() => setSearchType(type)}
            />
            <span className={searchType === type ? 'font-semibold text-cyan-600' : ''}>{type}</span>
          </label>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Enter user name"
          className="h-9 w-72 rounded border border-slate-300 px-3"
          data-testid="vblink-search-input"
        />
        <button
          onClick={() => {}}
          className="rounded bg-cyan-500 px-6 font-semibold text-white"
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
      <table className="w-full min-w-[1100px] text-center">
        <thead className="bg-[#6c63ff] text-white">
          <tr>
            <th className="py-3">#</th>
            <th>User Name</th>
            <th>Player Level</th>
            <th>Score</th>
            <th>Slotmania Score</th>
            <th>Bonus Score</th>
            <th>Convertible Bonus Score</th>
            <th>Safe</th>
            <th>Online</th>
            <th>Build up time</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 && (
            <tr>
              <td colSpan="11" className="py-6 text-slate-500">
                No players to display
              </td>
            </tr>
          )}
          {accounts.map((a, i) => {
            const isSelected = selected?.id === a.id;
            return (
              <tr
                key={a.id}
                className={`border-b ${isSelected ? 'bg-cyan-50' : ''}`}
                data-testid={`vblink-player-row-${a.game_username}`}
              >
                <td className="py-3">{i + 1}</td>
                <td className="text-cyan-600">{a.game_username}</td>
                <td>1</td>
                <td className="font-semibold">{Number(a.balance || 0).toFixed(2)}</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
                <td>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs">Offline</span>
                </td>
                <td>{formatDateTime(a.created_at)}</td>
                <td>
                  <div className="flex flex-wrap justify-center gap-1">
                    <button
                      onClick={() => {
                        setSelected(a);
                        openModal('setScore', { amount: '' });
                      }}
                      className="rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-white"
                      data-testid={`vblink-set-score-${a.game_username}`}
                    >
                      Set Score
                    </button>
                    <button
                      onClick={() => openScoreLog(a)}
                      className="rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-white"
                      data-testid={`vblink-score-log-${a.game_username}`}
                    >
                      Score Log
                    </button>
                    <button
                      onClick={() => {
                        setSelected(a);
                        openModal('editPassword', { password: '' });
                      }}
                      className="rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-white"
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
      <div className="w-full max-w-2xl rounded bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function AddPlayerModal({ form, updateForm, submit, close, error, maximum }) {
  return (
    <ModalShell title="Add Player" onClose={close}>
      <div className="space-y-4">
        <Field label="Upline">
          <span className="rounded bg-slate-200 px-3 py-1 text-sm">{HARDCODED.operatorName}</span>
        </Field>

        <Field label="* User Name" highlight>
          <input
            value={form.userName || ''}
            onChange={e => updateForm('userName', e.target.value)}
            className="w-full rounded border border-amber-300 bg-amber-50 px-3 py-2"
            data-testid="vblink-add-player-username"
          />
        </Field>

        <Field label="* Password" highlight>
          <input
            value={form.password || ''}
            onChange={e => updateForm('password', e.target.value)}
            placeholder={PASSWORD_HINT}
            className="w-full rounded border border-rose-300 px-3 py-2"
            data-testid="vblink-add-player-password"
          />
        </Field>

        <Field label={`Set Score (Maximum ${maximum})`}>
          <input
            type="number"
            value={form.setScore || ''}
            onChange={e => updateForm('setScore', e.target.value)}
            placeholder="0"
            className="w-full rounded border border-slate-300 px-3 py-2"
            data-testid="vblink-add-player-set-score"
          />
        </Field>

        <Field label="Name">
          <input
            value={form.name || ''}
            onChange={e => updateForm('name', e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </Field>

        <Field label="Tel">
          <input
            value={form.tel || ''}
            onChange={e => updateForm('tel', e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </Field>

        <Field label="Remarks">
          <textarea
            value={form.remarks || ''}
            onChange={e => updateForm('remarks', e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={submit}
            className="rounded bg-cyan-500 px-8 py-2 font-semibold text-white"
            data-testid="vblink-add-player-ok"
          >
            OK
          </button>
          <button onClick={close} className="rounded bg-slate-200 px-8 py-2 font-semibold">
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <span className="font-semibold">Player Score: </span>
            <span data-testid="vblink-set-score-current">{playerScore.toFixed(2)}</span>
          </div>
          <div>
            <span className="font-semibold">Customer Balance (Max load): </span>
            <span data-testid="vblink-set-score-max">{customerBalance.toFixed(2)}</span>
          </div>
        </div>

        <Field label="Amount (positive = add, negative = redeem)">
          <input
            type="number"
            value={form.amount ?? ''}
            onChange={e => updateForm('amount', e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
            data-testid="vblink-set-score-amount"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={submit}
            className="rounded bg-cyan-500 px-8 py-2 font-semibold text-white"
            data-testid="vblink-set-score-ok"
          >
            OK
          </button>
          <button onClick={close} className="rounded bg-slate-200 px-8 py-2 font-semibold">
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
      <div className="space-y-4">
        <Field label="* New Password" highlight>
          <input
            value={form.password || ''}
            onChange={e => updateForm('password', e.target.value)}
            placeholder={PASSWORD_HINT}
            className="w-full rounded border border-rose-300 px-3 py-2"
            data-testid="vblink-edit-password-input"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={submit}
            className="rounded bg-cyan-500 px-8 py-2 font-semibold text-white"
            data-testid="vblink-edit-password-ok"
          >
            OK
          </button>
          <button onClick={close} className="rounded bg-slate-200 px-8 py-2 font-semibold">
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
          <thead className="bg-[#6c63ff] text-white">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Manager</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && (
              <tr>
                <td colSpan="5" className="px-3 py-6 text-center text-slate-500">
                  No transaction records
                </td>
              </tr>
            )}
            {log.map(item => (
              <tr key={item.id} className="border-b">
                <td className="px-3 py-2">{item.type}</td>
                <td className="px-3 py-2 font-semibold">{item.amount ?? '-'}</td>
                <td className="px-3 py-2">{formatDateTime(item.acceptedAt || item.created_at)}</td>
                <td className="px-3 py-2">{item.manager}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full border border-green-500 px-2 py-1 text-xs text-green-600">
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
      <div className="w-full max-w-md rounded bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-2xl">×</button>
        </div>
        <div className="px-6 py-8 text-center">{message}</div>
        <div className="flex justify-end p-4">
          <button
            onClick={onClose}
            className="rounded bg-cyan-500 px-8 py-2 font-semibold text-white"
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
      <span className={`mb-1 block text-sm font-semibold ${highlight ? 'text-rose-600' : ''}`}>
        {label}
      </span>
      {children}
    </label>
  );
}