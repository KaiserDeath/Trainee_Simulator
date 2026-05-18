import { useState } from 'react';
import { getCustomers, getCustomerHistory } from '../../api/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
}

function OperationBadge({ type, amount }) {
  const isAdd = type === 'ADD CREDITS' || type === 'ADD_CREDITS';
  const isWithdraw = type === 'WITHDRAW CREDITS' || type === 'WITHDRAW_CREDITS';
  if (isAdd) return (
    <div className="inline-flex flex-col items-center rounded-lg bg-purple-100 px-3 py-1 min-w-[100px]">
      <span className="text-[10px] font-bold uppercase text-purple-700 tracking-wide">Add Credits</span>
      <span className="text-base font-bold text-purple-700">{amount ?? '—'}</span>
    </div>
  );
  if (isWithdraw) return (
    <div className="inline-flex flex-col items-center rounded-lg bg-orange-100 px-3 py-1 min-w-[100px]">
      <span className="text-[10px] font-bold uppercase text-orange-700 tracking-wide">Withdraw Credits</span>
      <span className="text-base font-bold text-orange-700">{amount ?? '—'}</span>
    </div>
  );
  return (
    <div className="inline-flex flex-col items-center rounded-lg bg-slate-100 px-3 py-1 min-w-[100px]">
      <span className="text-[10px] font-bold uppercase text-slate-600">{type}</span>
      <span className="text-base font-bold text-slate-600">{amount ?? '—'}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = (status || '').toUpperCase();
  const map = {
    APPROVED: 'bg-green-100 text-green-700 border-green-300',
    CANCELLED: 'bg-red-100 text-red-700 border-red-300',
    PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    COMPLETED: 'bg-blue-100 text-blue-700 border-blue-300',
  };
  const cls = map[s] || 'bg-slate-100 text-slate-600 border-slate-300';
  const icon = s === 'APPROVED' ? '✓' : s === 'CANCELLED' ? '✕' : s === 'PENDING' ? '⏱' : '';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      {icon && <span>{icon}</span>}{status || '—'}
    </span>
  );
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(4, totalPages) }, (_, i) => i + 1);
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(1)} disabled={page === 1} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30">«</button>
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30">‹</button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)} className={`rounded px-3 py-1 text-sm font-medium ${page === p ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
      ))}
      {totalPages > 4 && <span className="text-slate-400 px-1">...</span>}
      {totalPages > 4 && (
        <button onClick={() => onChange(totalPages)} className={`rounded px-3 py-1 text-sm font-medium ${page === totalPages ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{totalPages}</button>
      )}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30">›</button>
      <button onClick={() => onChange(totalPages)} disabled={page === totalPages} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30">»</button>
    </div>
  );
}

// ─── History View (full page, not modal) ─────────────────────────────────────

function HistoryView({ customer, session, onBack }) {
  const [activeTab, setActiveTab] = useState('Movements');
  const [history, setHistory] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  // Fetch movements on mount
  useState(() => {
    getCustomerHistory(session.id, customer.id)
      .then(res => setHistory(res.data || []))
      .catch(err => { console.error(err); setHistory([]); });
  }, []);

  const totalPages = history ? Math.max(1, Math.ceil(history.length / PER_PAGE)) : 1;
  const pageItems = history ? history.slice((page - 1) * PER_PAGE, page * PER_PAGE) : [];

  const tabs = ['Transactions', 'Movements', 'Transfers'];

  return (
    <div className="space-y-5">
      {/* Back button */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
        >
          ← Back
        </button>
      </div>

      {/* Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => tab === 'Movements' && setActiveTab(tab)}
              className={`px-8 py-2.5 text-sm font-medium transition border-r border-slate-200 last:border-r-0 ${
                activeTab === tab
                  ? 'bg-white text-slate-800 font-semibold shadow-inner'
                  : 'text-slate-500 bg-slate-50 hover:bg-slate-100'
              } ${tab !== 'Movements' ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'Movements' && (
        <div className="rounded-2xl bg-white shadow overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-600">
              Movements of <span className="font-bold text-slate-800">{customer.username}</span>
            </p>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>

          {/* Table */}
          {history === null ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No movement history found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-4 py-3 font-medium">Operation code</th>
                    <th className="px-4 py-3 font-medium">Player</th>
                    <th className="px-4 py-3 font-medium">Game</th>
                    <th className="px-4 py-3 font-medium">Operation</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Manager</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item, i) => (
                    <tr key={item.id || i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {item.operation_code || (item.id || '').slice(0, 8).toUpperCase() || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">👤</span>
                          <div>
                            <p className="text-xs text-slate-600">ID: {item.game_username || item.mobile_id || '—'}</p>
                            <p className="text-xs text-slate-400">{customer.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.game || '—'}</td>
                      <td className="px-4 py-3">
                        <OperationBadge type={item.type} amount={item.amount} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <div><span className="font-medium text-slate-400">R: </span>{formatDate(item.created_at || item.requested_at)}</div>
                        <div><span className="font-medium text-slate-400">A: </span>{formatDate(item.processed_at || item.approved_at || item.created_at)}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.processed_by || item.manager || 'Bot'}</td>
                      <td className="px-4 py-3"><StatusBadge status={item.status || 'APPROVED'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transactions and Transfers — empty, no functionality */}
      {(activeTab === 'Transactions' || activeTab === 'Transfers') && (
        <div className="rounded-2xl bg-white shadow overflow-hidden">
          <div className="py-20 text-center text-slate-400 text-sm">
            No data available.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Games Modal ─────────────────────────────────────────────────────────────

function GamesModal({ customer, onClose }) {
  const accounts = customer.game_accounts || [];
  const gameStyle = {
    'Orion Stars': 'bg-indigo-50 border-indigo-200',
    'Vblink': 'bg-cyan-50 border-cyan-200',
    'Golden Dragon': 'bg-yellow-50 border-yellow-200',
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Game Accounts</h2>
            <p className="text-sm text-slate-500">{customer.username} — {customer.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold px-2">✕</button>
        </div>
        <div className="p-6 space-y-3">
          {accounts.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">No game accounts found.</p>
          ) : accounts.map(acc => (
            <div key={acc.id} className={`rounded-xl border p-4 ${gameStyle[acc.game] || 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{acc.game}</p>
                  <p className="text-sm text-slate-500 mt-0.5">ID: <span className="font-mono">{acc.game_username || acc.mobile_id || '—'}</span></p>
                  {acc.kiosk && <p className="text-xs text-slate-400 mt-0.5">Kiosk: {acc.kiosk}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Balance</p>
                  <p className="text-xl font-bold text-slate-800">${Number(acc.balance || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomerPanel({ session }) {
  const [searchType, setSearchType] = useState('All');
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [gamesCustomer, setGamesCustomer] = useState(null);

  // If viewing history, show that view instead
  if (historyCustomer) {
    return (
      <HistoryView
        customer={historyCustomer}
        session={session}
        onBack={() => setHistoryCustomer(null)}
      />
    );
  }

  const needsInput = searchType !== 'All';

  const handleSearch = async () => {
    try {
      setLoading(true);
      setSearched(true);
      const res = await getCustomers(session.id, needsInput ? query.trim() : '');
      setCustomers(res.data || []);
    } catch (err) {
      console.error(err);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="rounded-2xl bg-white shadow p-6">
        <p className="text-sm font-medium text-slate-600 mb-3">Select type:</p>
        <div className="flex items-center gap-3">
          {/* Type dropdown */}
          <select
            value={searchType}
            onChange={e => {
              setSearchType(e.target.value);
              setQuery('');
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 min-w-[150px]"
          >
            <option value="All">All</option>
            <option value="Username">Username</option>
            <option value="Email">Email</option>
          </select>

          {/* Input — only shown when a specific type is selected */}
          {needsInput && (
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Write here"
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"            />
          )}

          {/* Search button */}
          <button
            onClick={handleSearch}
            disabled={loading || (needsInput && !query.trim())}
            className="rounded-lg bg-slate-700 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50 transition"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div className="rounded-2xl bg-white shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-sm text-slate-600">
              Total customers found: <span className="font-semibold text-slate-800">{customers.length}</span>
            </p>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Searching...</div>
          ) : customers.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No customers found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-4 py-3 font-medium">Username</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Last name</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">History</th>
                    <th className="px-4 py-3 font-medium">Games</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-base">🏷️</span>
                          <span className="font-semibold text-slate-800">{c.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{c.first_name}</td>
                      <td className="px-4 py-3 text-slate-700">{c.last_name}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">${Number(c.balance || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setHistoryCustomer(c)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 transition"
                        >
                          🕐 See History
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setGamesCustomer(c)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition"
                        >
                          🎮 See Games
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{c.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Games Modal */}
      {gamesCustomer && (
        <GamesModal customer={gamesCustomer} onClose={() => setGamesCustomer(null)} />
      )}
    </div>
  );
}
