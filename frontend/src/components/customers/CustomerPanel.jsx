import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  getCustomerHistory,
  getCustomers
} from '../../api/client';

export default function CustomerPanel({
  session
}) {
  const [query, setQuery] =
    useState('');

  const [customers, setCustomers] =
    useState([]);

  const [
    selectedCustomerId,
    setSelectedCustomerId
  ] = useState(null);

  const [history, setHistory] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const selectedCustomer =
    useMemo(() => {
      return customers.find(
        customer =>
          customer.id ===
          selectedCustomerId
      );
    }, [
      customers,
      selectedCustomerId
    ]);

  const fetchCustomers =
    useCallback(async () => {
      try {
        setLoading(true);

        const response =
          await getCustomers(
            session.id,
            query
          );

        setCustomers(response.data);

        if (
          response.data.length > 0 &&
          !selectedCustomerId
        ) {
          setSelectedCustomerId(
            response.data[0].id
          );
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, [
      query,
      selectedCustomerId,
      session.id
    ]);

  const fetchHistory =
    useCallback(async () => {
      if (!selectedCustomerId) {
        setHistory([]);
        return;
      }

      try {
        const response =
          await getCustomerHistory(
            session.id,
            selectedCustomerId
          );

        setHistory(response.data);
      } catch (err) {
        console.error(err);
      }
    }, [
      selectedCustomerId,
      session.id
    ]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchCustomers();
    }, 250);

    return () =>
      clearTimeout(timeout);
  }, [fetchCustomers]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchHistory();
    }, 0);

    return () =>
      clearTimeout(timeout);
  }, [fetchHistory]);

  return (
    <div className="grid grid-cols-[320px_1fr] gap-6">
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-800">
            Customers
          </h3>

          <p className="text-sm text-slate-500">
            Search sandbox customer records
          </p>
        </div>

        <input
          value={query}
          onChange={event => {
            setSelectedCustomerId(null);
            setQuery(
              event.target.value
            );
          }}
          placeholder="Search name, username, email"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        {loading && (
          <p className="text-sm text-slate-500">
            Loading customers...
          </p>
        )}

        <div className="space-y-2">
          {customers.map(customer => (
            <button
              key={customer.id}
              onClick={() =>
                setSelectedCustomerId(
                  customer.id
                )
              }
              className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                selectedCustomerId ===
                customer.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <p className="font-semibold text-slate-800">
                {customer.username}
              </p>

              <p className="text-sm text-slate-500">
                {customer.first_name}
                {' '}
                {customer.last_name}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow p-5">
        {!selectedCustomer ? (
          <div className="rounded-xl bg-slate-50 p-6 text-slate-500">
            Select a customer to inspect accounts and history.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between border-b border-slate-200 pb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {
                    selectedCustomer.username
                  }
                </h3>

                <p className="text-sm text-slate-500">
                  {
                    selectedCustomer.email
                  }
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm text-slate-500">
                  Customer Balance
                </p>

                <p className="text-2xl font-bold text-slate-800">
                  $
                  {
                    selectedCustomer.balance
                  }
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-3 font-semibold text-slate-800">
                Game Accounts
              </h4>

              <div className="grid grid-cols-3 gap-3">
                {selectedCustomer.game_accounts
                  ?.map(account => (
                    <div
                      key={account.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <p className="font-semibold text-slate-800">
                        {account.game}
                      </p>

                      <p className="text-sm text-slate-500">
                        {
                          account.game_username
                        }
                      </p>

                      <p className="mt-3 text-lg font-bold text-slate-800">
                        $
                        {account.balance}
                      </p>
                    </div>
                  ))}
              </div>
            </div>

            <div>
              <h4 className="mb-3 font-semibold text-slate-800">
                Transaction History
              </h4>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="px-4 py-3">
                        Type
                      </th>

                      <th className="px-4 py-3">
                        Amount
                      </th>

                      <th className="px-4 py-3">
                        Description
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {history.map(item => (
                      <tr
                        key={item.id}
                        className="border-t border-slate-200"
                      >
                        <td className="px-4 py-3">
                          {item.type}
                        </td>

                        <td className="px-4 py-3">
                          {item.amount ?? '-'}
                        </td>

                        <td className="px-4 py-3 text-slate-500">
                          {
                            item.description
                          }
                        </td>
                      </tr>
                    ))}

                    {history.length === 0 && (
                      <tr>
                        <td
                          colSpan="3"
                          className="px-4 py-5 text-center text-slate-500"
                        >
                          No history available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
