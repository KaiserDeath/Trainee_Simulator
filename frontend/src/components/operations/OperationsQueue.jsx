import {
  useCallback,
  useEffect,
  useMemo,
  useState
}
  from 'react';

import api from '../../api/client';

const requestTitles = {
  'CREATE ACCOUNT': 'Create Account',
  'RESET PASSWORD': 'Reset Password',
  'REFRESH BALANCE': 'Refresh Balance'
};

const kioskByGame = {
  'Orion Stars': 'OrionStars',
  Vblink: 'Vblink',
  'Golden Dragon': 'GoldenDragon'
};

function getInitialRequestForm(
  operation
) {
  const gameId =
    operation?.game_account
      ?.game_username || '';

  const kiosk =
    kioskByGame[
      operation?.game_account?.game
    ] || '';

  if (
    operation?.type ===
    'CREATE ACCOUNT'
  ) {
    return {
      gameId: '',
      newPassword: '',
      kiosk
    };
  }

  if (
    operation?.type ===
    'REFRESH BALANCE'
  ) {
    return {
      gameId,
      kiosk,
      amount: ''
    };
  }

  return {
    gameId,
    newPassword: '',
    kiosk
  };
}

export default function OperationsQueue({
  session,
  isSessionClosed
}) {

  const [operations, setOperations] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState('movements');

  const [
    selectedRequest,
    setSelectedRequest
  ] = useState(null);

  const [requestForm, setRequestForm] =
    useState({});

  //
  // LOAD OPERATIONS
  //
  const fetchOperations =
    useCallback(async () => {

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
  }, [session.id]);

  //
  // AUTO REFRESH
  //
  useEffect(() => {

    const timeout = setTimeout(() => {
      fetchOperations();
    }, 0);

    const interval = setInterval(() => {
      fetchOperations();
    }, 5000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };

  }, [fetchOperations]);

  //
  // PROCESS OPERATION
  //
  const processOperation = async (
    operationId,
    action,
    requestData
  ) => {
    if (isSessionClosed) {
      return;
    }

    try {

      await api.post(
        `/operations/${operationId}/process`,
        {
          action,
          traineeName:
            session.trainee_name,
          requestData
        }
      );

      fetchOperations();
      setSelectedRequest(null);
      setRequestForm({});

    } catch (err) {
      console.error(err);
    }
  };

  const openRequestModal = operation => {
    if (isSessionClosed) {
      return;
    }

    setSelectedRequest(operation);
    setRequestForm(
      getInitialRequestForm(operation)
    );
  };

  const updateRequestForm = (
    field,
    value
  ) => {
    setRequestForm(current => ({
      ...current,
      [field]: value
    }));
  };

  const confirmRequest = () => {
    if (!selectedRequest) return;

    processOperation(
      selectedRequest.id,
      'APPROVED',
      requestForm
    );
  };

  const isRequestFormComplete =
    selectedRequest?.type ===
    'REFRESH BALANCE'
      ? requestForm.gameId &&
        requestForm.kiosk &&
        requestForm.amount !== ''
      : requestForm.gameId &&
        requestForm.newPassword &&
        requestForm.kiosk;

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

  if (isSessionClosed) {
    return (
      <div className="bg-slate-100 p-8 rounded-xl border border-slate-300">
        <h3 className="text-xl font-semibold text-slate-900">
          Session finished
        </h3>
        <p className="mt-3 text-slate-500">
          The session is complete and pending operations are frozen. Review your final results in the reports tab.
        </p>
      </div>
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

                <p className="text-sm text-slate-500 font-medium">
                  {operation.type === 'CREATE ACCOUNT'
                    ? operation.customer?.username
                    : operation.game_account?.game_username}
                </p>

                <p className="text-sm text-slate-500">
                  {operation.game_account.game}
                </p>

                <p className="text-xs text-slate-500 mt-2 font-medium">
                  Requested:
                  {' '}
                  {operation.created_at
                    ? new Date(operation.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'N/A'}
                  {operation.processed_at && (
                    <> · Processed:
                    {' '}
                    {new Date(operation.processed_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </>
                  )}
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

              {activeTab === 'requests' ? (
                <button
                  onClick={() =>
                    openRequestModal(
                      operation
                    )
                  }
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  Action
                </button>
              ) : (
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
              )}

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

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-130 rounded-lg bg-white shadow-xl">

            <div className="flex items-center justify-between border-b px-6 py-4">
              <div />

              <button
                onClick={() =>
                  setSelectedRequest(null)
                }
                className="text-2xl leading-none text-slate-900"
                aria-label="Close request form"
              >
                ×
              </button>
            </div>

            <div className="px-8 py-6">
              <h2 className="mb-6 text-center text-xl font-bold text-slate-800">
                {
                  requestTitles[
                    selectedRequest.type
                  ]
                }
              </h2>

              <div className="grid grid-cols-2 gap-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    New Game ID
                  </span>

                  <input
                    value={
                      requestForm.gameId ||
                      ''
                    }
                    onChange={event =>
                      updateRequestForm(
                        'gameId',
                        event.target.value
                      )
                    }
                    placeholder="New Game ID"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                  />
                </label>

                {selectedRequest.type !==
                  'REFRESH BALANCE' && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">
                      New Password
                    </span>

                    <input
                      value={
                        requestForm
                          .newPassword ||
                        ''
                      }
                      onChange={event =>
                        updateRequestForm(
                          'newPassword',
                          event.target.value
                        )
                      }
                      placeholder="New Password"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    />
                  </label>
                )}

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Kiosk
                  </span>

                  <input
                    value={
                      requestForm.kiosk || ''
                    }
                    onChange={event =>
                      updateRequestForm(
                        'kiosk',
                        event.target.value
                      )
                    }
                    placeholder="Kiosk"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                  />
                </label>

                {selectedRequest.type ===
                  'REFRESH BALANCE' && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">
                      Amount
                    </span>

                    <input
                      type="number"
                      value={
                        requestForm.amount ||
                        ''
                      }
                      onChange={event =>
                        updateRequestForm(
                          'amount',
                          event.target.value
                        )
                      }
                      placeholder="Amount"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 border-t">
              <button
                onClick={() =>
                  setSelectedRequest(null)
                }
                className="py-4 font-semibold text-red-500 hover:bg-slate-50"
              >
                Close
              </button>

              <button
                onClick={confirmRequest}
                disabled={
                  !isRequestFormComplete
                }
                className="border-l py-4 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
