import { useEffect, useMemo, useState }
  from 'react';

import api from '../../api/client';

export default function OperationsQueue({
  session
}) {

  const [operations, setOperations] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState('movements');

  //
  // LOAD OPERATIONS
  //
  const fetchOperations = async () => {

    try {

      const response = await api.get(
        `/operations/${session.id}`
      );

      setOperations(response.data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  //
  // AUTO REFRESH
  //
  useEffect(() => {

    fetchOperations();

    const interval = setInterval(() => {
      fetchOperations();
    }, 5000);

    return () =>
      clearInterval(interval);

  }, []);

  //
  // PROCESS OPERATION
  //
  const processOperation = async (
    operationId,
    action
  ) => {

    try {

      await api.post(
        `/operations/${operationId}/process`,
        {
          action,
          traineeName:
            session.trainee_name
        }
      );

      fetchOperations();

    } catch (err) {
      console.error(err);
    }
  };

  //
  // FILTERS
  //
  const movementOperations =
    useMemo(() => {

      return operations.filter(op =>
        op.type === 'ADD CREDITS'
        ||
        op.type === 'WITHDRAW CREDITS'
      );

    }, [operations]);

  const requestOperations =
    useMemo(() => {

      return operations.filter(op =>
        op.type === 'CREATE ACCOUNT'
        ||
        op.type === 'RESET PASSWORD'
        ||
        op.type === 'REFRESH BALANCE'
      );

    }, [operations]);

  //
  // CURRENT VIEW
  //
  const displayedOperations =
    activeTab === 'movements'
      ? movementOperations
      : requestOperations;

  if (loading) {
    return (
      <p>Loading operations...</p>
    );
  }

  return (
    <div>

      {/* HEADER */}
      <div className="flex items-center justify-between mb-5">

        <div>

          <h3 className="text-xl font-semibold">
            Operations
          </h3>

          <p className="text-sm text-slate-500">
            Process incoming requests
          </p>

        </div>

      </div>

      {/* TABS */}
      <div className="flex gap-3 mb-6">

        <button
          onClick={() =>
            setActiveTab('movements')
          }
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'movements'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-200 text-slate-700'
          }`}
        >
          Movements
          {' '}
          ({movementOperations.length})
        </button>

        <button
          onClick={() =>
            setActiveTab('requests')
          }
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeTab === 'requests'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-200 text-slate-700'
          }`}
        >
          Requests
          {' '}
          ({requestOperations.length})
        </button>

      </div>

      {/* EMPTY */}
      {displayedOperations.length === 0 && (

        <div className="bg-slate-100 p-5 rounded-xl text-slate-500">
          No pending operations
        </div>

      )}

      {/* LIST */}
      <div className="space-y-4">

        {displayedOperations.map(
          operation => (

          <div
            key={operation.id}
            className="bg-slate-50 border rounded-xl p-5"
          >

            {/* TOP */}
            <div className="flex justify-between">

              <div>

                <h4 className="font-bold text-slate-800">
                  {operation.type}
                </h4>

                <p className="text-sm text-slate-500">
                  {operation.customer.username}
                </p>

                <p className="text-sm text-slate-500">
                  {operation.game_account.game}
                </p>

              </div>

              <div className="text-right">

                {operation.amount && (
                  <p className="text-2xl font-bold text-slate-800">
                    $
                    {operation.amount}
                  </p>
                )}

              </div>

            </div>

            {/* ACTIONS */}
            <div className="flex gap-3 mt-5">

              <button
                onClick={() =>
                  processOperation(
                    operation.id,
                    'APPROVED'
                  )
                }
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
              >
                Approve
              </button>

              <button
                onClick={() =>
                  processOperation(
                    operation.id,
                    'CANCELLED'
                  )
                }
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
              >
                Cancel
              </button>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}