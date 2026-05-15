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

const GAME = 'Golden Dragon';

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

const createMobileId = () => {
  const part = () =>
    Math.floor(
      100 + Math.random() * 900
    );

  return `M-${part()}-${part()}-${part()}`;
};

const createMobilePassword = () =>
  String(
    Math.floor(
      1000000 + Math.random() * 9000000
    )
  );

const toDragonCredits = amount =>
  Number(amount || 0) * 100;

const toCurrency = value =>
  Number(value || 0).toFixed(2);

const getEntriesDollars = history =>
  history
    .filter(item =>
      item.type === 'GAME ADD CREDITS'
    )
    .reduce(
      (total, item) =>
        total + Number(item.amount || 0),
      0
    );

const getGoldenDragonCustomerId = account => {
  const password =
    String(account?.password || '');

  return password.startsWith('CHANGED:')
    ? password.slice('CHANGED:'.length)
    : password;
};

const hasChangedPassword = account =>
  String(account?.password || '')
    .startsWith('CHANGED:');

export default function GoldenDragonPanel({
  session,
  sessionId
}) {
  const activeSessionId =
    session?.id || sessionId;

  const [searchType, setSearchType] =
    useState('Name');

  const [query, setQuery] =
    useState('');

  const [activeView, setActiveView] =
    useState('customer');

  const [accounts, setAccounts] =
    useState([]);

  const [selected, setSelected] =
    useState(null);

  const [history, setHistory] =
    useState([]);

  const [reportCustomerId, setReportCustomerId] =
    useState('');

  const [reportHistory, setReportHistory] =
    useState([]);

  const [reportAccount, setReportAccount] =
    useState(null);

  const [modal, setModal] =
    useState(null);

  const [form, setForm] =
    useState({});

  const [notice, setNotice] =
    useState(null);

  const selectedCustomerId =
    selected?.customer_id;

  const goldenHistory =
    history.filter(item =>
      item.game === GAME ||
      item.description?.includes(GAME)
    );

  const selectedEntriesDollars =
    getEntriesDollars(goldenHistory);

  const goldenReportHistory =
    reportHistory.filter(item =>
      item.game === GAME ||
      item.description?.includes(GAME)
    );

  const reportTotalPurchase =
    goldenReportHistory
      .filter(item =>
        item.type ===
        'GAME ADD CREDITS'
      )
      .reduce(
        (total, item) =>
          total + Number(item.amount || 0),
        0
      );

  const reportTotalRedeem =
    goldenReportHistory
      .filter(item =>
        item.type ===
        'GAME WITHDRAW CREDITS'
      )
      .reduce(
        (total, item) =>
          total + Number(item.amount || 0),
        0
      );

  const visibleAccounts =
    useMemo(() => {
      const term =
        query.trim().toLowerCase();

      if (
        !term ||
        searchType === 'Mobile ID'
      ) {
        return accounts;
      }

      return accounts.filter(account => {
        if (searchType === 'Customer ID') {
          return getGoldenDragonCustomerId(
            account
          )
            .toLowerCase()
            .includes(term);
        }

        const first =
          account.customer?.first_name ||
          '';
        const last =
          account.customer?.last_name ||
          '';

        return `${first} ${last}`
          .toLowerCase()
          .includes(term);
      });
    }, [accounts, query, searchType]);

  const fetchAccounts =
    useCallback(async () => {
      const response =
        await searchGameAccounts(
          activeSessionId,
          'Golden-Dragon',
          searchType === 'Mobile ID'
            ? query
            : ''
        );

      setAccounts(response.data);
    }, [
      activeSessionId,
      query,
      searchType
    ]);

  const fetchHistory =
    useCallback(async () => {
      if (!selectedCustomerId) {
        setHistory([]);
        return;
      }

      const response =
        await getGameAccountHistory(
          activeSessionId,
          selectedCustomerId
        );

      setHistory(response.data);
    }, [
      activeSessionId,
      selectedCustomerId
    ]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchAccounts();
    }, 200);

    return () =>
      clearTimeout(timeout);
  }, [fetchAccounts]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchHistory();
    }, 0);

    return () =>
      clearTimeout(timeout);
  }, [fetchHistory]);

  const openModal = name => {
    setNotice(null);
    setModal(name);
    setForm({});
  };

  const closeModal = () => {
    setModal(null);
    setForm({});
  };

  const updateForm = (key, value) => {
    setForm(current => ({
      ...current,
      [key]: value
    }));
  };

  const showNotice = (
    title,
    message
  ) => {
    setNotice({
      title,
      message
    });
  };

  const refreshSelected = async updated => {
    await fetchAccounts();
    await fetchHistory();

    if (updated && selected) {
      setSelected(current => ({
        ...current,
        balance: updated.balance
      }));
    }
  };

  const saveCustomer = async () => {
    const firstName =
      String(form.firstName || '').trim();

    if (!firstName) return;

    const response =
      await createGameAccount(
      activeSessionId,
      GAME,
      {
        customerName: firstName,
        gameUsername: createMobileId(),
        password: createMobilePassword()
      }
    );

    setModal('saved');

    const accountsResponse =
      await searchGameAccounts(
        activeSessionId,
        'Golden-Dragon',
        ''
      );

    setAccounts(accountsResponse.data);

    const createdAccount =
      accountsResponse.data.find(
        account =>
          account.id ===
          response.data.id
      );

    if (createdAccount) {
      setSelected(createdAccount);
      setReportCustomerId(
        getGoldenDragonCustomerId(
          createdAccount
        )
      );
    }
  };

  const runMoneyAction = async () => {
    if (!selected) return;

    try {
      if (modal === 'purchase') {
        const response =
          await rechargeGameAccount(
            selected.id,
            form.amount
          );

        closeModal();
        refreshSelected(response.data);
      }

      if (modal === 'redeem') {
                const value =
          Number(form.amount || 0);

        if (
          value >
          Number(selected.balance || 0)
        ) {
          showNotice(
            'Message',
            'Redeem amount exceeds winnings balance'
          );
          return;
        }

        const response =
          await redeemGameAccount(
            selected.id,
            value
          );

        closeModal();
        refreshSelected(response.data);
      }
    } catch (err) {
      showNotice(
        'Message',
        err.response?.data?.error ||
          'Action could not be completed'
      );
    }
  };

  const resetPasswordToDefault =
    async () => {
      if (!selected) return;

      const customerId =
        getGoldenDragonCustomerId(
          selected
        );

      try {
        const response =
          await resetGamePassword(
            selected.id,
            customerId
          );

        setSelected(current => ({
          ...current,
          password:
            response.data.password
        }));

        closeModal();
        showNotice(
          'Message',
          'Password reset successfully'
        );
        await fetchAccounts();
      } catch (err) {
        showNotice(
          'Message',
          err.response?.data?.error ||
            'Password reset failed'
        );
      }
    };

  const runReportSearch = async () => {
    const term =
      reportCustomerId.trim();

    const account =
      accounts.find(item =>
        getGoldenDragonCustomerId(
          item
        ) === term
      );

    setReportAccount(account || null);

    if (!account) {
      setReportHistory([]);
      return;
    }

    const response =
      await getGameAccountHistory(
        activeSessionId,
        account.customer_id
      );

    setReportHistory(response.data);
  };

  return (
    <div className="min-h-screen bg-[#e8e8e8] text-sm text-black">
      <header className="flex h-11 items-center justify-between bg-[#173954] px-5 text-white">
        <div className="text-xl">
          Golden Dragon Pos
          {' '}
          <span className="text-sm">
             (Release) /
            {' '}
            {activeView === 'reports'
              ? 'Reports / Transaction Report'
              : 'Customer Account / Customer Account'}
          </span>
        </div>

        <div className="flex items-center gap-5">
          <span className="rounded-full bg-[#2c668f] px-4 py-2 text-xs">
            Welcome ~ Dragons Drawer 3
          </span>
          <span>English</span>
          <span className="rounded-full bg-[#2c668f] px-4 py-2 text-xs">
            KIOSK: Dragons Luck (8093768)
          </span>
        </div>
      </header>

      <div className="m-2 rounded border border-yellow-300 bg-yellow-50 px-3 py-1 text-cyan-700">
        Please be advised that the following behaviors are NOT allowed on GD. Any violation will lead to terminate the account immediately!
      </div>

      <div className="grid grid-cols-[210px_1fr] gap-2 px-2">
        <aside className="border border-slate-300 bg-slate-100">
          <SidebarItem label="Drawer" onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
          <SidebarItem
            label="Customer Account"
            active={
              activeView === 'customer'
            }
            onClick={() =>
              setActiveView('customer')
            }
          />
          <SidebarItem
            label="Customer Account"
            child
            active={
              activeView === 'customer'
            }
            onClick={() =>
              setActiveView('customer')
            }
          />
          <SidebarItem label="Customer Info" child onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
          <SidebarItem label="Machine" onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
          <SidebarItem
            label="Reports"
            active={
              activeView === 'reports'
            }
            onClick={() =>
              setActiveView('reports')
            }
          />
          <SidebarItem
            label="Transaction Report"
            child
            active={
              activeView === 'reports'
            }
            onClick={() =>
              setActiveView('reports')
            }
          />
          <SidebarItem label="Shift Report" child onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
          <SidebarItem label="System Setup" onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
          <SidebarItem label="Account Management" onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
          <SidebarItem label="Logout" onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
          <SidebarItem label="GD platform news" onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
          <SidebarItem label="OnlineWalletSetup" onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })} />
        </aside>

        <main className="rounded border border-slate-300 bg-white shadow">
          {activeView === 'customer' ? (
          <section className="p-5">
            <div className="mb-4 flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h1 className="mb-3 text-2xl font-bold text-[#005a99]">
                  Customer Information
                </h1>

                <div className="flex gap-1">
                  <select
                    value={searchType}
                    onChange={event =>
                      setSearchType(
                        event.target.value
                      )
                    }
                    className="h-9 rounded border border-blue-400 bg-sky-200 px-3 font-semibold"
                  >
                    <option>Name</option>
                    <option>Driver License</option>
                    <option>Customer ID</option>
                    <option>Mobile ID</option>
                    <option>Phone</option>
                  </select>

                  <input
                    value={query}
                    onChange={event =>
                      setQuery(
                        event.target.value
                      )
                    }
                    className="h-9 w-48 rounded border border-slate-300 px-3"
                  />

                  <button
                    onClick={fetchAccounts}
                    className="h-9 rounded bg-[#0084bd] px-7 font-bold text-white"
                  >
                    Search
                  </button>
                </div>
              </div>

              <button
                onClick={() =>
                  openModal('create')
                }
                className="mt-4 rounded bg-[#0084bd] px-5 py-3 font-bold text-white"
              >
                New Customer
              </button>
            </div>

            <div className="overflow-hidden rounded border border-slate-200">
              <div className="grid grid-cols-2">
                <InfoRow
                  label="Driver License"
                  value="-"
                />
                <InfoRow
                  label="Internet Time"
                  value="00:00:00"
                />
                <InfoRow
                  label="Customer ID"
                  value={
                    selected
                      ? getGoldenDragonCustomerId(
                          selected
                        )
                      :
                    '-'
                  }
                  highlight
                />
                <InfoRow
                  label="Entries"
                  value={toDragonCredits(
                    selectedEntriesDollars
                  )}
                />
                <InfoRow
                  label="Name"
                  value={
                    selected?.customer
                      ?.first_name || '-'
                  }
                />
                <InfoRow
                  label="Winnings"
                  value={toDragonCredits(
                    selected?.balance
                  )}
                />
                <InfoRow
                  label="Phone"
                  value=""
                />
                <InfoRow
                  label="Account Type"
                  value={
                    selected ? 'Pos' : '-'
                  }
                />
                <InfoRow
                  label="Mobile ID"
                  value={
                    selected?.game_username ||
                    '-'
                  }
                />
                <InfoRow
                  label="Mobile Password"
                  value={renderMobilePassword({
                    selected,
                    openModal
                  })}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })}
                  className="rounded bg-[#0084bd] px-4 py-2 font-bold text-white"
                >
                  Gift History
                </button>
                <button
                  onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })}
                  className="rounded bg-[#0084bd] px-4 py-2 font-bold text-white"
                >
                  Game History
                </button>
                <button
                  onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })}
                  className="rounded bg-[#0084bd] px-4 py-2 font-bold text-white"
                >
                  Edit Customer
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={!selected}
                  onClick={() =>
                    openModal('redeem')
                  }
                  className="rounded bg-red-700 px-5 py-2 font-bold text-white disabled:bg-slate-300"
                >
                  Redeem
                </button>
                <button
                  disabled={!selected}
                  onClick={() =>
                    openModal('purchase')
                  }
                  className="rounded bg-violet-700 px-5 py-2 font-bold text-white disabled:bg-slate-300"
                >
                  Purchase
                </button>
                <button
                  onClick={() => setNotice({ title: 'Not Available', message: 'QUITE CLOSE, BUT IT IS NOT HERE.' })}
                  className="rounded bg-slate-500 px-5 py-2 font-bold text-white"
                >
                  Revert Purchase
                </button>
              </div>
            </div>

            <section className="mt-5 rounded border border-slate-300 bg-slate-50 p-3">
              <table className="w-full text-center">
                <thead>
                  <tr className="bg-[#0084bd] text-white">
                    <th className="py-2"></th>
                    <th>Mobile ID</th>
                    <th>Name</th>
                    <th>Entries</th>
                    <th>Winnings</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map(account => (
                    <tr
                      key={account.id}
                      className="border-b border-slate-300"
                    >
                      <td className="py-2">
                        <button
                          onClick={() => {
                            setSelected(account);
                            setReportCustomerId(
                              getGoldenDragonCustomerId(
                                account
                              )
                            );
                          }}
                          className="rounded bg-[#0084bd] px-4 py-2 font-bold text-white"
                        >
                          Select
                        </button>
                      </td>
                      <td>
                        {account.game_username}
                      </td>
                      <td>
                        {
                          account.customer
                            ?.first_name
                        }
                      </td>
                      <td>0</td>
                      <td>
                        {toDragonCredits(
                          account.balance
                        )}
                      </td>
                      <td>Active</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </section>
          ) : (
            <TransactionReportView
              customerId={
                reportCustomerId
              }
              setCustomerId={
                setReportCustomerId
              }
              runReportSearch={
                runReportSearch
              }
              reportAccount={
                reportAccount
              }
              reportHistory={
                goldenReportHistory
              }
              totalPurchase={
                reportTotalPurchase
              }
              totalRedeem={
                reportTotalRedeem
              }
            />
          )}
        </main>
      </div>

      {modal && (
        <GoldenDragonModal
          modal={modal}
          form={form}
          history={goldenHistory}
          selected={selected}
          closeModal={closeModal}
          updateForm={updateForm}
          saveCustomer={saveCustomer}
          runMoneyAction={runMoneyAction}
          resetPasswordToDefault={
            resetPasswordToDefault
          }
        />
      )}

      {notice && (
        <MessageDialog
          title={notice.title}
          message={notice.message}
          onClose={() =>
            setNotice(null)
          }
        />
      )}
    </div>
  );
}

function renderMobilePassword({
  selected,
  openModal
}) {
  if (!selected) return '-';

  if (!hasChangedPassword(selected)) {
    return getGoldenDragonCustomerId(
      selected
    );
  }

  return (
    <button
      onClick={() =>
        openModal('resetPassword')
      }
      className="rounded bg-[#0084bd] px-8 py-2 font-bold text-white"
    >
      Reset
    </button>
  );
}

function SidebarItem({
  label,
  child = false,
  active = false,
  onClick
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full border-b border-slate-300 px-5 py-3 text-left font-semibold ${
        child ? 'pl-11' : ''
      } ${
        active && !child
          ? 'bg-cyan-300'
          : active && child
            ? 'bg-red-100 text-red-700'
            : ''
      }`}
    >
      {label}
    </button>
  );
}

function TransactionReportView({
  customerId,
  setCustomerId,
  runReportSearch,
  reportAccount,
  reportHistory,
  totalPurchase,
  totalRedeem
}) {
  const periodStart =
    '2026-05-11 05:00:00';
  const periodEnd =
    '2026-05-18 05:00:00';

  return (
    <section className="space-y-2 bg-[#e8e8e8] p-2">
      <div className="rounded border border-slate-300 bg-white p-5 shadow">
        <h1 className="mb-3 border-b border-slate-200 pb-2 text-2xl font-bold text-[#005a99]">
          Transaction Search Rule
        </h1>

        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <span className="w-20 font-bold">
              Customer :
            </span>
            <input
              value={customerId}
              onChange={event =>
                setCustomerId(
                  event.target.value
                )
              }
              className="h-9 w-48 rounded border border-slate-300 px-3"
            />
          </label>

          <div className="flex items-center gap-3">
            <span className="w-20 font-bold">
              Period * :
            </span>
            <input
              value={periodStart}
              readOnly
              className="h-9 w-48 rounded border border-slate-300 px-3"
            />
            <span>~</span>
            <input
              value={periodEnd}
              readOnly
              className="h-9 w-48 rounded border border-slate-300 px-3"
            />
            <button
              onClick={runReportSearch}
              className="h-9 rounded bg-[#0084bd] px-6 font-bold text-white"
            >
              Reports
            </button>
          </div>

          <p className="font-bold">
            Period Limit : Max. Time Period 31 days.
          </p>

          <div className="flex gap-2">
            {[
              'Today',
              'Yesterday',
              'This Week',
              'Last Week'
            ].map(label => (
              <button
                key={label}
                className="rounded bg-[#0084bd] px-6 py-2 font-bold text-white"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded border border-slate-300 bg-white p-5 shadow">
        <h2 className="mb-3 border-b border-slate-200 pb-2 text-2xl font-bold text-[#005a99]">
          Transaction Summary
        </h2>

        <p className="mb-2">
          {periodStart}
          {' '}
          ~
          {' '}
          {periodEnd}
        </p>

        <table className="w-full text-center">
          <thead className="bg-[#3699c6] text-white">
            <tr>
              <th className="py-2">
                Total Purchase
              </th>
              <th>POS Purchase</th>
              <th>Reloader Purchase</th>
              <th>Online Purchase</th>
              <th>Daily Comps</th>
              <th>Special Comps</th>
              <th>Free Entries</th>
              <th>Total Redeem</th>
              <th>Online Redeem</th>
              <th>Reverse</th>
              <th>Gross Net</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border border-slate-200">
              <td className="py-2 text-cyan-600">
                ${totalPurchase.toFixed(2)}
              </td>
              <td>${totalPurchase.toFixed(2)}</td>
              <td>$0.00</td>
              <td>$0.00</td>
              <td>$0.00</td>
              <td>$0.00</td>
              <td>$0.00</td>
              <td className="text-orange-600">
                ${totalRedeem.toFixed(2)}
              </td>
              <td className="text-orange-600">
                $0.00
              </td>
              <td className="text-orange-600">
                $0.00
              </td>
              <td>
                $
                {(
                  totalPurchase -
                  totalRedeem
                ).toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded border border-slate-300 bg-white p-5 shadow">
        <h2 className="mb-3 border-b border-slate-200 pb-2 text-2xl font-bold text-[#005a99]">
          Transaction Detail Reports
        </h2>

        <table className="w-full text-center">
          <thead className="bg-[#3699c6] text-white">
            <tr>
              <th className="py-2">
                Time
              </th>
              <th>Station</th>
              <th>Customer ID</th>
              <th>Customer Name</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Comps</th>
              <th>Free</th>
              <th>Order ID</th>
            </tr>
          </thead>
          <tbody>
            {reportHistory.map(item => (
              <tr
                key={item.id}
                className="border-b border-slate-200 odd:bg-white even:bg-slate-100"
              >
                <td className="py-2">
                  {formatDateTime(
                    item.acceptedAt ||
                    item.created_at
                  )}
                </td>
                <td>Dragons Luck</td>
                <td>
                  {reportAccount
                    ? getGoldenDragonCustomerId(
                        reportAccount
                      )
                    : customerId}
                </td>
                <td>
                  {
                    reportAccount?.customer
                      ?.first_name
                  }
                </td>
                <td>
                  {item.type ===
                  'GAME WITHDRAW CREDITS'
                    ? 'Redeem'
                    : 'Purchase'}
                </td>
                <td>${item.amount ?? 0}</td>
                <td>$0</td>
                <td>$0</td>
                <td>{item.operationCode}</td>
              </tr>
            ))}

            {reportHistory.length === 0 && (
              <tr>
                <td
                  colSpan="9"
                  className="py-8 text-slate-500"
                >
                  No transaction records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InfoRow({
  label,
  value,
  highlight = false
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr] border-b border-slate-200 px-6 py-3">
      <span className="text-right font-bold">
        {label}
        {' '}
        :
      </span>
      <span
        className={`pl-3 font-semibold ${
          highlight
            ? 'text-orange-600'
            : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function GoldenDragonModal({
  modal,
  form,
  history,
  selected,
  closeModal,
  updateForm,
  saveCustomer,
  runMoneyAction,
  resetPasswordToDefault
}) {
  const redeemAmount =
    Number(form.amount || 0);

  const winningsDollars =
    Number(selected?.balance || 0);

  const addRedeemAmount = value => {
    updateForm(
      'amount',
      Math.min(
        winningsDollars,
        redeemAmount + value
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-4">
      <div className="w-full max-w-4xl rounded bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-xl font-bold text-[#005a99]">
            {modal === 'create' &&
              'New/Update Customer'}
            {modal === 'saved' && 'Message'}
            {modal === 'purchase' && 'Purchase'}
            {modal === 'redeem' && 'Redeem'}
            {modal === 'resetPassword' &&
              'Message'}
            {modal === 'history' &&
              'Game History'}
          </h2>

          <button
            onClick={closeModal}
            className="text-2xl font-bold"
          >
            x
          </button>
        </div>

        {modal === 'create' && (
          <div className="p-8">
            <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4">
              <label className="contents">
                <span className="text-right font-bold">
                  First Name
                </span>
                <input
                  value={form.firstName || ''}
                  onChange={event =>
                    updateForm(
                      'firstName',
                      event.target.value
                    )
                  }
                  className="rounded border border-slate-300 px-3 py-2"
                />
              </label>

              {[
                'Pin ID',
                'Driver License',
                'Birthday',
                'Last Name',
                'Phone',
                'Mail'
              ].map(label => (
                <div
                  key={label}
                  className="contents"
                >
                  <span className="text-right font-bold">
                    {label}
                  </span>
                  <input
                    disabled
                    className="rounded border border-slate-200 bg-slate-50 px-3 py-2"
                  />
                </div>
              ))}
            </div>

            <KeyboardMock />

            <div className="mt-4 flex justify-center gap-5">
              <button
                onClick={saveCustomer}
                className="rounded bg-[#0084bd] px-10 py-3 font-bold text-white"
              >
                Save
              </button>
              <button
                onClick={closeModal}
                className="rounded bg-[#0084bd] px-10 py-3 font-bold text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {modal === 'saved' && (
          <div>
            <div className="border-b px-8 py-6">
              Save Successfully
            </div>
            <div className="flex justify-end p-5">
              <button
                onClick={closeModal}
                className="rounded bg-[#0084bd] px-10 py-3 font-bold text-white"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {modal === 'purchase' && (
          <div className="p-8">
            <label className="mx-auto grid max-w-sm grid-cols-[90px_1fr] items-center gap-3">
              <span className="font-bold">
                Amount
              </span>
              <input
                type="number"
                value={form.amount || ''}
                onChange={event =>
                  updateForm(
                    'amount',
                    event.target.value
                  )
                }
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>

            <div className="mt-6 flex justify-center gap-5">
              <button
                onClick={runMoneyAction}
                disabled={
                  !Number(form.amount || 0)
                }
                className="rounded bg-[#0084bd] px-10 py-3 font-bold text-white disabled:bg-slate-300"
              >
                Save
              </button>
              <button
                onClick={closeModal}
                className="rounded bg-[#0084bd] px-10 py-3 font-bold text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {modal === 'redeem' && (
          <div className="space-y-5 p-8">
            <RedeemRow
              label="Customer ID"
              value={getGoldenDragonCustomerId(
                selected
              )}
            />
            <RedeemRow
              label="Winnings"
              value={`${toDragonCredits(
                winningsDollars
              )} ($${toCurrency(
                winningsDollars
              )})`}
            />
            <RedeemRow
              label="Drawer Balance"
              value="$ 9,999.00"
            />

            <div className="grid grid-cols-[140px_1fr] items-center border-b border-dashed border-slate-300 pb-4">
              <span className="text-right font-bold">
                Redeem Amount
              </span>
              <div className="flex items-center gap-4 pl-4">
                <span className="font-bold text-cyan-600">
                  $
                  {' '}
                  {toCurrency(
                    redeemAmount
                  )}
                </span>
                <button
                  onClick={() =>
                    updateForm(
                      'amount',
                      0
                    )
                  }
                  className="rounded bg-red-600 px-5 py-2 font-bold text-white"
                >
                  CLEAR
                </button>
              </div>
            </div>

            <div className="grid grid-cols-[140px_1fr] items-center border-b border-dashed border-slate-300 pb-4">
              <span className="text-right font-bold">
                Redeem Select
              </span>
              <div className="flex flex-wrap gap-2 pl-4">
                {[1, 5, 10, 20, 50, 100].map(value => (
                  <button
                    key={value}
                    onClick={() =>
                      addRedeemAmount(value)
                    }
                    disabled={
                      redeemAmount + value >
                      winningsDollars
                    }
                    className="rounded bg-[#0084bd] px-7 py-2 font-bold text-white disabled:bg-slate-300"
                  >
                    $
                    {value}
                  </button>
                ))}
                <button
                  onClick={() =>
                    updateForm(
                      'amount',
                      winningsDollars
                    )
                  }
                  disabled={
                    winningsDollars <= 0
                  }
                  className="rounded bg-[#0084bd] px-7 py-2 font-bold text-white disabled:bg-slate-300"
                >
                  Max
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-5">
              <button
                onClick={runMoneyAction}
                disabled={
                  redeemAmount <= 0 ||
                  redeemAmount >
                    winningsDollars
                }
                className="rounded bg-[#0084bd] px-10 py-3 font-bold text-white disabled:bg-slate-300"
              >
                Save
              </button>
              <button
                onClick={closeModal}
                className="rounded bg-[#0084bd] px-10 py-3 font-bold text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {modal === 'resetPassword' && (
          <div>
            <div className="border-b px-8 py-6">
              Reset password to Customer ID?
            </div>
            <div className="flex justify-end gap-4 p-5">
              <button
                onClick={closeModal}
                className="rounded bg-slate-500 px-8 py-3 font-bold text-white"
              >
                Cancel
              </button>
              <button
                onClick={
                  resetPasswordToDefault
                }
                className="rounded bg-[#0084bd] px-8 py-3 font-bold text-white"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {modal === 'history' && (
          <div className="max-h-[520px] overflow-auto p-5">
            <table className="w-full text-left">
              <thead className="bg-[#0084bd] text-white">
                <tr>
                  <th className="px-3 py-2">
                    Type
                  </th>
                  <th className="px-3 py-2">
                    Amount
                  </th>
                  <th className="px-3 py-2">
                    Date
                  </th>
                  <th className="px-3 py-2">
                    Manager
                  </th>
                  <th className="px-3 py-2">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map(item => (
                  <tr
                    key={item.id}
                    className="border-b"
                  >
                    <td className="px-3 py-2">
                      {item.type}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {item.amount ?? '-'}
                    </td>
                    <td className="px-3 py-2">
                      {formatDateTime(
                        item.acceptedAt ||
                        item.created_at
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.manager}
                    </td>
                    <td className="px-3 py-2">
                      {item.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RedeemRow({
  label,
  value
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center border-b border-dashed border-slate-300 pb-4">
      <span className="text-right font-bold">
        {label}
      </span>
      <span className="pl-4 font-semibold">
        {value}
      </span>
    </div>
  );
}

function MessageDialog({
  title,
  message,
  onClose
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-16">
      <div className="w-full max-w-lg rounded bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-xl"
          >
            x
          </button>
        </div>
        <div className="border-b px-8 py-6">
          {message}
        </div>
        <div className="flex justify-end p-5">
          <button
            onClick={onClose}
            className="rounded bg-[#0084bd] px-10 py-3 font-bold text-white"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyboardMock() {
  const keys = [
    '`',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '0',
    '-',
    '=',
    'Bksp',
    'Tab',
    'q',
    'w',
    'e',
    'r',
    't',
    'y',
    'u',
    'i',
    'o',
    'p',
    '[',
    ']',
    '\\',
    'a',
    's',
    'd',
    'f',
    'g',
    'h',
    'j',
    'k',
    'l',
    ';',
    "'",
    'Enter',
    'Shift',
    'z',
    'x',
    'c',
    'v',
    'b',
    'n',
    'm',
    ',',
    '.',
    '/',
    'Shift'
  ];

  return (
    <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-1 rounded border border-sky-200 bg-sky-100 p-2">
      {keys.map((key, index) => (
        <span
          key={`${key}-${index}`}
          className="min-w-9 rounded bg-sky-600 px-3 py-2 text-center font-bold text-white"
        >
          {key}
        </span>
      ))}
      <span className="rounded bg-cyan-500 px-4 py-2 font-bold text-white">
        Accept
      </span>
      <span className="w-60 rounded bg-sky-600 px-4 py-2" />
      <span className="rounded bg-cyan-500 px-4 py-2 font-bold text-white">
        Cancel
      </span>
    </div>
  );
}