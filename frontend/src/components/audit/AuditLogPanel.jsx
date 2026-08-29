import { useState, useEffect } from 'react';
import { getSessionAuditLog } from '../../api/client';

export default function AuditLogPanel({ sessionId }) {
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) return;

    let mounted = true;

    const fetchAuditLog = async () => {
      try {
        const response = await getSessionAuditLog(sessionId);
        if (mounted) {
          setAuditLog(response.data);
          setError('');
        }
      } catch (err) {
        console.error('Failed to fetch audit log:', err);
        if (mounted) {
          setError('Audit log is currently unavailable.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchAuditLog();
    const interval = setInterval(fetchAuditLog, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  // ── UPDATED LOG DISPLAY LABELS ──────────────────────────────────────────
  const formatActionType = (actionType) => {
    const map = {
      USERNAME_COPIED: 'Username Selected',
      GAME_ID_COPIED: 'Game ID Selected',
      OPERATION_STARTED: 'Operation Started',
      APPROVED: 'Operation Approved',
      CANCELLED: 'Operation Cancelled',
      APPROVE: 'Operation Approved',
      REJECT: 'Operation Rejected',
      CANCEL: 'Operation Cancelled'
    };
    return map[actionType] || actionType;
  };

  const parseDetails = (details) => {
    if (!details) {
      return {};
    }

    if (typeof details === 'object') {
      return details;
    }

    try {
      return JSON.parse(details);
    } catch {
      return {};
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (seconds) => {
    const value = Number(seconds);

    if (!Number.isFinite(value)) {
      return null;
    }

    const totalSeconds = Math.max(0, Math.round(value));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    return `${remainingSeconds}s`;
  };

  if (loading && auditLog.length === 0) {
    return <div className="text-slate-400">Loading audit log...</div>;
  }

  if (error && auditLog.length === 0) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
        {error}
      </div>
    );
  }

  if (auditLog.length === 0) {
    return <div className="text-slate-400">No trainee actions recorded yet</div>;
  }

  return (
    <div className="overflow-x-auto">
      {error && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {error} Showing the last successfully loaded entries.
        </div>
      )}
      <table className="w-full text-sm text-slate-300">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left py-2 px-3">Trainee</th>
            <th className="text-left py-2 px-3">Action</th>
            <th className="text-left py-2 px-3">Time</th>
            <th className="text-left py-2 px-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {auditLog.map((log, idx) => {
            const details = parseDetails(log.details);
            const handlingDuration = formatDuration(
              details.handlingSeconds
            );

            return (
              <tr
                key={idx}
                className="border-b border-slate-800 hover:bg-slate-800"
              >
                <td className="py-2 px-3">
                  {log.trainee_name}
                </td>
                <td className="py-2 px-3 font-mono">
                  {formatActionType(log.action_type)}
                </td>
                <td className="py-2 px-3 text-slate-500">
                  {formatTimestamp(log.timestamp)}
                </td>
                <td className="py-2 px-3 text-slate-400 text-xs">
                  {log.details ? (
                    <span>
                      {details.username && `Username: ${details.username}`}
                      {details.gameId && `Game ID: ${details.gameId}`}
                      {details.operationType && ` | Op: ${details.operationType}`}
                      {handlingDuration && ` | Handling: ${handlingDuration}`}
                      {details.handlingStartedAt && ` | Started: ${formatTimestamp(details.handlingStartedAt)}`}
                    </span>
                  ) : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
