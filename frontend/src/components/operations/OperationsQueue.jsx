import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import api, { logTraineeAction } from '../../api/client';
import MovementConfirmationModal from './MovementConfirmationModal';

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

// ── Card theme for Movements only ────────────────────────────────────────
const cardTheme = (type) => {
  switch (type) {
    case 'ADD CREDITS':
      return {
        border: 'border-l-[6px] border-l-emerald-500',
        bg: 'bg-emerald-500/10',
        actionBg: 'bg-emerald-500',
        badgeBg: 'bg-emerald-500',
        badgeText: 'text-white'
      };
    case 'WITHDRAW CREDITS':
      return {
        border: 'border-l-[6px] border-l-red-500',
        bg: 'bg-red-500/10',
        actionBg: 'bg-red-500',
        badgeBg: 'bg-red-500',
        badgeText: 'text-white'
      };
    default:
      return {
        border: 'border-l-[6px] border-l-slate-400',
        bg: 'bg-slate-500/10',
        actionBg: 'bg-slate-600',
        badgeBg: 'bg-slate-600',
        badgeText: 'text-white'
      };
  }
};

function getInitialRequestForm(operation) {
  const gameId = operation?.game_account?.game_username || '';
  const kiosk = kioskByGame[
    operation?.game_account?.game || operation?.game
  ] || '';

  if (operation?.type === 'CREATE ACCOUNT') {
    return {
      gameId: '',
      newPassword: '',
      kiosk
    };
  }

  if (operation?.type === 'REFRESH BALANCE') {
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
  isSessionClosed,
  onSessionMissing,
  activeTab = 'movements',
  onCountsChange
}) {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [movementTab, setMovementTab] = useState('pending');
  const [reconciliationReasons, setReconciliationReasons] = useState({});
  const [reconciliationSubmitting, setReconciliationSubmitting] = useState(null);
  const [reconciliationErrors, setReconciliationErrors] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestForm, setRequestForm] = useState({});
  const [movementDecision, setMovementDecision] = useState(null);
  const [movementSubmitting, setMovementSubmitting] = useState(false);
  const [movementError, setMovementError] = useState('');
  const [movementStatus, setMovementStatus] = useState('');
  const movementTriggerRef = useRef(null);
  const movementFallbackRef = useRef(null);
  const movementSubmitLockRef = useRef(false);
  // Keeps track of operation IDs that have already logged a selection action to prevent duplicates
  const [trackedOperations, setTrackedOperations] = useState([]);

  const fetchOperations = useCallback(async () => {
    try {
      const response = await api.get(`/operations/${session.id}`);
      setOperations(response.data);
    } catch (err) {
      if (err.response?.status === 404) {
        onSessionMissing?.();
        return;
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [onSessionMissing, session.id]);

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

  const processOperation = async (operationId, action, requestData) => {
    if (isSessionClosed) {
      return {
        ok: false,
        error: 'The session is already closed.'
      };
    }

    try {
      const response = await api.post(`/operations/${operationId}/process`, {
        action,
        traineeName: session.trainee_name,
        requestData
      });

      setOperations(current =>
        current.filter(
          operation => operation.id !== operationId
        )
      );
      void fetchOperations();

      return {
        ok: true,
        data: response.data
      };
    } catch (err) {
      if (err.response?.status === 404) {
        onSessionMissing?.();
      }
      console.error(err);

      return {
        ok: false,
        status: err.response?.status,
        code: err.response?.data?.code,
        conflict:
          err.response?.status === 409 ||
          err.response?.data?.code ===
            'OPERATION_ALREADY_PROCESSED',
        error:
          err.response?.data?.error ||
          'Unable to process this transaction. Please try again.'
      };
    }
  };

  const openMovementConfirmation = (
    operation,
    action,
    trigger
  ) => {
    if (isSessionClosed) return;

    movementTriggerRef.current = trigger;
    setMovementError('');
    setMovementStatus('');
    setMovementDecision({
      operation,
      action
    });
  };

  const closeMovementConfirmation = () => {
    if (movementSubmitting) return;

    setMovementDecision(null);
    setMovementError('');

    requestAnimationFrame(() => {
      const focusTarget =
        movementTriggerRef.current?.isConnected
          ? movementTriggerRef.current
          : movementFallbackRef.current;
      focusTarget?.focus();
    });
  };

  const confirmMovementDecision = async cancellationReason => {
    if (
      !movementDecision ||
      movementSubmitting ||
      movementSubmitLockRef.current
    ) return;

    movementSubmitLockRef.current = true;
    setMovementSubmitting(true);
    setMovementError('');

    const requestData =
      movementDecision.action === 'CANCELLED'
        ? { cancellationReason }
        : undefined;
    let result;

    try {
      result = await processOperation(
        movementDecision.operation.id,
        movementDecision.action,
        requestData
      );
    } finally {
      movementSubmitLockRef.current = false;
      setMovementSubmitting(false);
    }

    if (result.ok) {
      setMovementDecision(null);
      requestAnimationFrame(() => {
        const focusTarget =
          movementTriggerRef.current?.isConnected
            ? movementTriggerRef.current
            : movementFallbackRef.current;
        focusTarget?.focus();
      });
      return;
    }

    if (result.conflict) {
      setOperations(current =>
        current.filter(
          operation =>
            operation.id !==
            movementDecision.operation.id
        )
      );
      setMovementDecision(null);
      setMovementError('');
      setMovementStatus(
        'This operation was already processed. The queue was refreshed.'
      );
      void fetchOperations();
      requestAnimationFrame(() => {
        movementFallbackRef.current?.focus();
      });
      return;
    }

    setMovementError(result.error);
  };

  const openRequestModal = operation => {
    if (isSessionClosed) return;
    setSelectedRequest(operation);
    setRequestForm(getInitialRequestForm(operation));
  };

  // ── RESTRUCTURED ACTION COPIED LOGIC ────────────────────────────────────
  const getCopiedIdentifier = operation => {
    if (operation.type === 'CREATE ACCOUNT') {
      return {
        actionType: 'USERNAME_COPIED',
        label: 'Username',
        value: operation.customer?.username || ''
      };
    }

    return {
      actionType: 'GAME_ID_COPIED',
      label: 'Game ID',
      value: operation.game_account?.game_username || ''
    };
  };

  const logManualSelection = useCallback(async (operation) => {
    const copied = getCopiedIdentifier(operation);
    if (!copied.value) return;

    try {
      await logTraineeAction(session.id, copied.actionType, {
        operationId: operation.id,
        operationType: operation.type,
        label: copied.label,
        username: copied.actionType === 'USERNAME_COPIED' ? copied.value : undefined,
        gameId: copied.actionType === 'GAME_ID_COPIED' ? copied.value : undefined,
        copiedValue: copied.value,
        timestamp: new Date().toISOString()
      });
      
      // Lock this operation so it doesn't log again
      setTrackedOperations(prev => [...prev, operation.id]);
    } catch (err) {
      console.error('Failed to log manual selection/operation start', err);
    }
  }, [session.id]);

  const movementOperations = useMemo(() => {
    return operations.filter(op =>
      op.type === 'ADD CREDITS' || op.type === 'WITHDRAW CREDITS'
    );
  }, [operations]);

  const requestOperations = useMemo(() => {
    return operations.filter(op =>
      op.type === 'CREATE ACCOUNT' || op.type === 'RESET PASSWORD' || op.type === 'REFRESH BALANCE'
    );
  }, [operations]);

  const reconciliationOperations = useMemo(() => {
    return movementOperations.filter(op => op.needs_reconciliation);
  }, [movementOperations]);

  useEffect(() => {
    onCountsChange?.({
      movements: movementOperations.length,
      requests: requestOperations.length
    });
  }, [movementOperations.length, requestOperations.length, onCountsChange]);

  // "It applied" settles as APPROVED, "It did not apply" as CANCELLED; the
  // trainee never operates the game for a pending reconciliation.
  const answerReconciliation = async (operation, applied) => {
    const reason = (reconciliationReasons[operation.id] || '').trim();
    if (!reason || reconciliationSubmitting) return;

    setReconciliationSubmitting(operation.id);
    setReconciliationErrors(current => ({ ...current, [operation.id]: '' }));

    const result = await processOperation(
      operation.id,
      applied ? 'APPROVED' : 'CANCELLED',
      {
        reconciliation: true,
        cancellationReason: reason
      }
    );

    setReconciliationSubmitting(null);

    if (!result.ok) {
      setReconciliationErrors(current => ({
        ...current,
        [operation.id]: result.error
      }));
      if (result.conflict) void fetchOperations();
    }
  };

  const displayedOperations =
    activeTab === 'movements' ? movementOperations : requestOperations;

  // ── SELECTION CHANGE EVENT LISTENER ─────────────────────────────────────
  useEffect(() => {
    if (isSessionClosed) return;

    const handleSelectionChange = () => {
      const selectedText = window.getSelection().toString().trim();

      // Condition check: Selection must contain more than 4 characters
      if (selectedText.length > 4) {
        // Find if the selected text matches any active identifier on the current tab view
        const matchingOperation = displayedOperations.find(op => {
          const targetConfig = getCopiedIdentifier(op);
          return targetConfig.value === selectedText && !trackedOperations.includes(op.id);
        });

        if (matchingOperation) {
          logManualSelection(matchingOperation);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [displayedOperations, trackedOperations, logManualSelection, isSessionClosed]);

  const updateRequestForm = (field, value) => {
    setRequestForm(current => ({
      ...current,
      [field]: value
    }));
  };

  const confirmRequest = async () => {
    if (!selectedRequest) return;
    const result = await processOperation(
      selectedRequest.id,
      'APPROVED',
      requestForm
    );

    if (result.ok) {
      setSelectedRequest(null);
      setRequestForm({});
    }
  };

  const isRequestFormComplete =
    selectedRequest?.type === 'REFRESH BALANCE'
      ? requestForm.gameId && requestForm.kiosk && requestForm.amount !== ''
      : requestForm.gameId && requestForm.newPassword && requestForm.kiosk;

  // ── Derived data helpers ───────────────────────────────────────────────
  const getOperationCode = op => op.operation_code || (op.id || '').slice(0, 8).toUpperCase() || '—';
  const getCustomerName = op => {
    if (op.customer?.first_name) return `${op.customer.first_name} ${op.customer.last_name || ''}`.trim();
    if (op.customer_name) return op.customer_name;
    return op.game_account?.game_username || '—';
  };

  const getMobileId = op => {
    if (op.type === 'CREATE ACCOUNT') return '—';
    return op.game_account?.game_username || '—';
  };

  const getKiosk = op => op.game_account?.kiosk || '—';
  const getUsername = op => op.customer?.username || '—';
  const getEmail = op => op.customer?.email || '—';
  const getGame = op =>
    op.game_account?.game || op.game || '—';

  if (loading) {
    return <p>Loading operations...</p>;
  }

  if (isSessionClosed) {
    return (
      <div className="bg-slate-100 p-8 rounded-xl border border-slate-300">
        <h3 className="text-xl font-semibold text-slate-900">Session finished</h3>
        <p className="mt-3 text-slate-500">
          The session is complete and pending operations are frozen. Review your final results in the reports tab.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* MOVEMENT TABS */}
      {activeTab === 'movements' && (
        <div className="mb-[22px] flex gap-[30px] border-b border-[#e8eaf2]">
          {[
            ['pending', 'Pending', movementOperations.length],
            ['reconciliation', 'Needs reconciliation', reconciliationOperations.length]
          ].map(([tab, label, count]) => (
            <button
              key={tab}
              ref={tab === 'pending' ? movementFallbackRef : undefined}
              type="button"
              onClick={() => setMovementTab(tab)}
              className={`-mb-px border-b-2 px-1 py-2.5 transition ${
                movementTab === tab
                  ? 'border-[#6d6fe0] font-semibold text-[#6d6fe0]'
                  : 'border-transparent text-[#59607a]'
              }`}
            >
              {label}
              <span className="ml-1.5 rounded-full bg-[#e6e8fa] px-[7px] py-px text-[11px] text-[#6d6fe0]">
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {movementStatus && (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800"
        >
          {movementStatus}
        </p>
      )}

      {/* EMPTY */}
      {activeTab === 'movements' && (
        movementTab === 'pending'
          ? movementOperations.length === 0
          : reconciliationOperations.length === 0
      ) && (
        <div className="border-t border-[#e8eaf2] py-12 text-center text-[15px] text-[#8a93a8]">
          Nothing to process
        </div>
      )}

      {/* ─────────────── NEEDS RECONCILIATION ─────────────── */}
      {activeTab === 'movements' && movementTab === 'reconciliation' && (
        <div className="space-y-[18px]">
          {reconciliationOperations.map(operation => {
            const reason = reconciliationReasons[operation.id] || '';
            const submitting = reconciliationSubmitting === operation.id;
            const canAnswer = reason.trim() !== '' && !reconciliationSubmitting;

            return (
              <div
                key={operation.id}
                data-testid={`reconciliation-${operation.id}`}
                className="rounded-md border border-[#f2e3c8] border-l-4 border-l-[#f0a81c] bg-[#fff5e6] px-5 py-4"
              >
                <div className="flex justify-between text-sm font-bold">
                  <span>
                    {getGame(operation).toUpperCase().replace(/[^A-Z0-9]+/g, '_')} - {operation.type.replace(' ', '_')}
                  </span>
                  <em className="text-xl not-italic">{Number(operation.amount || 0).toFixed(2)}</em>
                </div>
                <p className="mt-1 text-xs text-[#333]">
                  {getCustomerName(operation)} · {getEmail(operation)}
                </p>
                <p className="mt-1 text-xs text-[#7c8294]">
                  player {getUsername(operation)} &nbsp;·&nbsp; {getMobileId(operation)}
                </p>
                <p className="mt-1 text-xs text-[#7c8294]">
                  received {operation.created_at ? new Date(operation.created_at).toLocaleString() : '—'}
                  &nbsp;·&nbsp; code {getOperationCode(operation)}
                </p>
                <p className="my-2.5 text-xs">{operation.reconciliation_note}</p>

                <input
                  value={reason}
                  onChange={event => setReconciliationReasons(current => ({
                    ...current,
                    [operation.id]: event.target.value
                  }))}
                  maxLength={1000}
                  placeholder="Reason (required) - e.g. found the bot's load in the game history"
                  className="w-full rounded-[7px] border border-[#e3d6c0] bg-[#fffaf2] p-3 text-[12.5px] outline-none focus:border-[#f0a81c]"
                />

                {reconciliationErrors[operation.id] && (
                  <p role="alert" className="mt-2 text-xs text-[#d93a3a]">
                    {reconciliationErrors[operation.id]}
                  </p>
                )}

                <div className="mt-3 flex justify-end gap-2.5">
                  <button
                    type="button"
                    disabled={!canAnswer}
                    onClick={() => answerReconciliation(operation, false)}
                    className="rounded-[7px] border border-[#efc4c4] bg-white px-3.5 py-2 text-xs font-semibold text-[#d93a3a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ⊗ It did not apply
                  </button>
                  <button
                    type="button"
                    disabled={!canAnswer}
                    onClick={() => answerReconciliation(operation, true)}
                    className="rounded-[7px] border border-[#9bd3b8] bg-white px-3.5 py-2 text-xs font-semibold text-[#16a068] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? 'Saving…' : '⊙ It applied'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────────── MOVEMENTS (Card Layout) ─────────────── */}
      {activeTab === 'movements' && movementTab === 'pending' && (
        <div className="space-y-4">
          {movementOperations.map(operation => {
            const theme = cardTheme(operation.type);
            const isReconciliation = operation.needs_reconciliation;
            const username = getUsername(operation);
            const mobileId = getMobileId(operation); 

            return (
              <div
                key={operation.id}
                data-testid={`operation-${operation.id}`}
                className={`rounded-xl shadow-[0_0_4px_rgba(0,0,0,0.2)] ${theme.border} ${theme.bg}`}
              >
                {/* ── Top bar ── */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 py-3 lg:grid lg:grid-cols-3 lg:justify-items-start lg:gap-x-8">
                  {/* Status badge */}
                  {isReconciliation ? (
                    <div className="flex items-center gap-1 rounded-md border border-[#f0b94a] bg-[#fff3d6] px-3 py-1 text-xs">
                      <span className="font-medium text-black">Status:</span>
                      <span className="font-bold text-[#d8920a]">🕘 Pending reconciliation</span>
                    </div>
                  ) : (
                  <div className="flex items-center gap-2 rounded-md border border-amber-500 bg-amber-500/25 px-3 py-1 text-xs">
                    <span className="font-medium text-black">Status:</span>
                    <div className="flex items-center gap-1">
                      <img src="/svg/icons/icon-process.svg" className="w-3.5 h-3.5" alt="" />
                      <span className="font-bold text-amber-600 text-xs">Pending</span>
                    </div>
                  </div>
                  )}

                  {/* Operation type + timestamp */}
                  <div className={`rounded-full px-8 py-2 text-center text-white text-sm ${theme.badgeBg}`}>
                    <p className="uppercase font-semibold text-lg sm:text-sm">{operation.type}</p>
                    <p className="text-[11px] opacity-90">
                      {operation.created_at
                        ? new Date(operation.created_at).toLocaleDateString() +
                          ' • ' +
                          new Date(operation.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })
                        : '—'}
                    </p>
                  </div>

                  {/* Company logo placeholder */}
                  <div className="flex items-center gap-2 ms-auto lg:ms-0">
                    <div className="flex items-center gap-2 bg-[#F9F9F9] rounded-xl py-1.5 px-4">
                      <img
                        alt="Company"
                        className="h-6 w-6 object-contain"
                        src="/company-logo.png"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <span className="font-semibold text-[#525252] text-sm">Casino</span>
                    </div>
                  </div>
                </div>

                {/* ── Details grid ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-[1fr_1fr_1fr_1fr_1.25fr] px-6 pb-4 gap-y-2">
                  {/* Row 1 */}
                  <div className="flex flex-col px-3 pt-1 text-[13px] text-[#292929] border-r border-[#E0E0E0]">
                    <strong>Operation code</strong>
                    <span className="text-[#292929] break-all">{getOperationCode(operation)}</span>
                  </div>
                  <div className="flex flex-col px-3 pt-1 text-[13px] text-[#292929] border-r border-[#E0E0E0]">
                    <strong>Name</strong>
                    <span className="text-[#292929] break-all">{getCustomerName(operation)}</span>
                  </div>

                  {/* Mobile Id (Copy button erased) */}
                  <div className="flex flex-col px-3 pt-1 text-[13px] text-[#292929] border-r border-[#E0E0E0]">
                    <strong>Mobile Id</strong>
                    <div className="flex items-center gap-1">
                      <span className="text-[#292929] break-all select-all">{mobileId}</span>
                    </div>
                  </div>

                  <div className="flex flex-col px-3 pt-1 text-[13px] text-[#292929] border-r border-[#E0E0E0]">
                    <strong>Kiosk</strong>
                    <span className="text-[#292929] break-all">{getKiosk(operation)}</span>
                  </div>

                  {/* Actions column – spans 2 rows */}
                  <div className="flex flex-col px-3 py-1 items-center border-0 md:row-span-2">
                    <strong className="text-[13px] text-[#292929]">Actions</strong>
                    {isReconciliation ? (
                      <button
                        type="button"
                        onClick={() => setMovementTab('reconciliation')}
                        className="mt-1 max-w-[160px] rounded-[10px] border border-[#f0b94a] bg-white px-3 py-2 text-center text-[11px] font-semibold text-[#4a5578] hover:bg-[#fff3d6] md:mt-2"
                      >
                        Do not operate. Check it in Needs reconciliation →
                      </button>
                    ) : (
                    <div className="flex flex-wrap justify-center gap-2 mt-1 md:mt-2">
                      <button
                        type="button"
                        onClick={event => openMovementConfirmation(
                          operation,
                          'APPROVED',
                          event.currentTarget
                        )}
                        className="flex flex-col items-center gap-1 rounded-[10px] p-2 w-fit lg:min-w-[72px] hover:shadow-md hover:opacity-90"
                        style={{ background: '#60CA49', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                      >
                        <img src="/svg/check-fill.svg" className="h-4 w-4" alt="" />
                        <span className="text-xs text-white font-semibold">Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={event => openMovementConfirmation(
                          operation,
                          'CANCELLED',
                          event.currentTarget
                        )}
                        className="flex flex-col items-center gap-1 rounded-[10px] p-2 w-fit lg:min-w-[72px] hover:shadow-md hover:opacity-90"
                        style={{ background: '#E74F4F', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                      >
                        <img src="/svg/cancel-fill.svg" className="h-4 w-4" alt="" />
                        <span className="text-xs text-white font-semibold">Cancel</span>
                      </button>
                    </div>
                    )}
                  </div>

                  {/* Row 2 */}
                  <div className="flex flex-col px-3 pt-1 text-[13px] text-[#292929] border-r border-[#E0E0E0]">
                    <strong>Username</strong>
                    <span className="text-[#292929] break-all select-all">{username}</span>
                  </div>
                  <div className="flex flex-col px-3 pt-1 text-[13px] text-[#292929] border-r border-[#E0E0E0]">
                    <strong>Email</strong>
                    <span className="text-[#292929] break-all">{getEmail(operation)}</span>
                  </div>
                  <div className="flex flex-col px-3 pt-1 text-[13px] text-[#292929] border-r border-[#E0E0E0]">
                    <strong>Game</strong>
                    <span className="text-[#292929] break-all">{getGame(operation)}</span>
                  </div>
                  <div className="flex flex-col px-3 pt-1 text-[13px] text-[#292929] border-r border-[#E0E0E0]">
                    <strong>Amount</strong>
                    <span className="text-[#292929] break-all">{operation.amount ?? '—'}</span>
                  </div>
                </div>

                {isReconciliation && (
                  <p className="px-9 pb-4 text-[11.5px] text-[#444]">
                    <b className="text-[#222]">Reason:</b> {operation.reconciliation_note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────────── REQUESTS (Row Layout) ─────────────── */}
      {activeTab === 'requests' && (
        <div className="mx-auto w-full overflow-hidden rounded-[14px] border border-[#e8eaf2] bg-[#f8f9fc]">
          {/* Header row */}
          <div
            className="h-[48px] text-center text-[11px] font-semibold tracking-[.5px] uppercase justify-center items-center bg-[#fafbfe] text-[#8a93a8] border-b border-[#e8eaf2]"
            style={{
              display: 'grid',
              gridTemplateColumns: '0.8fr 0.6fr 0.8fr 0.8fr 0.7fr 0.6fr 0.7fr 0.5fr',
            }}
          >
            <div>Username</div>
            <div>Game</div>
            <div>Game Id</div>
            <div>Type</div>
            <div>Request Date</div>
            <div>Status</div>
            <div>Company</div>
            <div>Actions</div>
          </div>

          {/* Data rows */}
          {requestOperations.length === 0 ? (
            <div className="py-4 text-center text-slate-500">No pending requests</div>
          ) : (
            requestOperations.map(operation => {
              const username = getUsername(operation);
              const game = getGame(operation);
              const gameId =
                operation.type === 'CREATE ACCOUNT'
                  ? ''
                  : operation.game_account?.game_username || '—';
              const operationType = operation.type;
              const createdDate = operation.created_at
                ? new Date(operation.created_at).toLocaleDateString()
                : '—';
              const createdTime = operation.created_at
                ? new Date(operation.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })
                : '—';

              return (
                <div
                  key={operation.id}
                  data-testid={`operation-${operation.id}`}
                  className="items-center justify-center mx-auto h-[48px] sm:h-[56px] transition-all cursor-pointer"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '0.8fr 0.6fr 0.8fr 0.8fr 0.7fr 0.6fr 0.7fr 0.5fr',
                    alignItems: 'center'
                  }}
                >
                  {/* Username – Copy button erased */}
                  <div className="font-[Inter] text-center text-[#292929] text-[12px] sm:text-[13px] font-[500] flex items-center justify-center gap-1 select-all">
                    <span>{username}</span>
                  </div>

                  {/* Game */}
                  <div className="font-[Inter] text-center text-[#292929] text-[12px] sm:text-[13px] font-[500]">
                    {game}
                  </div>

                  {/* Game Id – Copy button erased */}
                  <div className="font-[Inter] text-center text-[#292929] text-[12px] sm:text-[13px] font-[500] flex items-center justify-center gap-1 select-all">
                    <span>{gameId || '—'}</span>
                  </div>

                  {/* Type */}
                  <div className="font-[Inter] text-center text-[#292929] text-[12px] sm:text-[13px] font-[500]">
                    {operationType}
                  </div>

                  {/* Date & Time */}
                  <div className="grid text-secondary justify-items-center font-[500]">
                    <span className="font-[Inter] font-semibold text-[11px]">{createdDate}</span>
                    <span className="font-[Inter] font-semibold text-[11px]">{createdTime}</span>
                  </div>

                  {/* Status */}
                  <div className="flex justify-center items-center text-black">
                    <div className="rounded-[8px] flex items-center justify-center gap-[4px] py-[4px] w-[92px]">
                      <img className="w-[20px]" src="/svg/icons/icon-process.svg" alt="" />
                      <p className="text-orange-500/80 font-[Inter] font-bold text-[12px] leading-[24px]">
                        Pending
                      </p>
                    </div>
                  </div>

                  {/* Company */}
                  <div className="flex items-center gap-2 bg-[#F9F9F9] rounded-xl py-1.5 px-2 mx-auto">
                    <img
                      alt="Company"
                      className="h-5 w-5 object-contain"
                      src="/company-logo.png"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span className="hidden font-Inter font-semibold text-[#525252] text-xs leading-[150%] lg:block">
                      Casino
                    </span>
                  </div>

                  {/* Action (pen icon) */}
                  <div className="positionsActionsIcons flex justify-center">
                    <button
                      type="button"
                      onClick={() => openRequestModal(operation)}
                      className="shadow-md rounded-[8px] w-[40px] h-[40px] p-[8px] transition-all ease-out cursor-pointer hover:bg-[#1AB800]"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <g
                          stroke="#1AB800"
                          strokeWidth="1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          clipPath="url(#clip0_822_77144)"
                        >
                          <path d="M8 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-1" />
                          <path d="M20.385 6.585a2.1 2.1 0 10-2.97-2.97L9 12v3h3l8.385-8.415zM16 5l3 3" />
                        </g>
                        <defs>
                          <clipPath id="clip0_822_77144">
                            <path fill="#fff" d="M0 0H24V24H0z" />
                          </clipPath>
                        </defs>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* REQUEST MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-130 rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div />
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-2xl leading-none text-slate-900"
                aria-label="Close request form"
              >
                ×
              </button>
            </div>

            <div className="px-8 py-6">
              <h2 className="mb-6 text-center text-xl font-bold text-slate-800">
                {requestTitles[selectedRequest.type]}
              </h2>

              <div className="grid grid-cols-2 gap-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">New Game ID</span>
                  <input
                    value={requestForm.gameId || ''}
                    onChange={event => updateRequestForm('gameId', event.target.value)}
                    placeholder="New Game ID"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 caret-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-500"
                  />
                </label>

                {selectedRequest.type !== 'REFRESH BALANCE' && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">New Password</span>
                    <input
                      value={requestForm.newPassword || ''}
                      onChange={event => updateRequestForm('newPassword', event.target.value)}
                      placeholder="New Password"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 caret-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-500"
                    />
                  </label>
                )}

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Kiosk</span>
                  <input
                    value={requestForm.kiosk || ''}
                    onChange={event => updateRequestForm('kiosk', event.target.value)}
                    placeholder="Kiosk"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 caret-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-500"
                  />
                </label>

                {selectedRequest.type === 'REFRESH BALANCE' && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">Amount</span>
                    <input
                      type="number"
                      value={requestForm.amount || ''}
                      onChange={event => updateRequestForm('amount', event.target.value)}
                      placeholder="Amount"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 caret-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-500"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 border-t">
              <button
                onClick={() => setSelectedRequest(null)}
                className="py-4 font-semibold text-red-500 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={confirmRequest}
                disabled={!isRequestFormComplete}
                className="border-l py-4 font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {movementDecision && (
        <MovementConfirmationModal
          action={movementDecision.action}
          error={movementError}
          isSubmitting={movementSubmitting}
          onClose={closeMovementConfirmation}
          onConfirm={confirmMovementDecision}
        />
      )}
    </div>
  );
}
