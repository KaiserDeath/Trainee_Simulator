import { useEffect, useState } from 'react';

import api from '../../api/client';

export default function LiveSessionView({ sessionId }) {
  const [operations, setOperations] = useState([]);

  // âœ… MOVED OUTSIDE: Define getTypeStyles here, before the useEffect
  const getTypeStyles = (type) => {
    switch (type) {
      case 'ADD':
      case 'CREDIT':
      case 'DEPOSIT':
        return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'; // Transparent light green

      case 'WITHDRAW':
      case 'DEBIT':
      case 'WITHDRAWAL':
        return 'bg-red-500/10 text-red-300 border border-red-500/20'; // Transparent red

      default:
        return 'bg-slate-700/40 text-slate-300 border border-slate-600';
    }
  };

  useEffect(() => {
    let mounted = true;
    const fetchOps = async () => {
      try {
        const response = await api.get(`/operations/${sessionId}`);
        if (mounted) setOperations(response.data);
      } catch (err) {
        console.error('Failed to fetch operations', err);
      }
    };

    fetchOps();
    const interval = setInterval(fetchOps, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
        <h3 className="text-lg font-semibold text-slate-200">Live Operations Queue</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {operations.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/30 border border-slate-800/50 rounded-2xl border-dashed">
            No pending operations. The GameMaster is generating traffic...
          </div>
        ) : (
          operations.map((op) => {
            // âŒ REMOVED: getTypeStyles is no longer defined here
            return (
              <div
                key={op.id}
                className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl backdrop-blur-sm shadow-xl flex flex-col justify-between"
              >
                <div>
                  {/* HEADER */}
                  <div className="flex justify-between items-start mb-4">
                    <span
                      className={`px-2.5 py-1 text-xs font-bold rounded-md ${getTypeStyles(
                        op.type
                      )}`}
                    >
                      {op.type}
                    </span>

                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(op.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* CUSTOMER */}
                  <div className="mb-2">
                    <div className="text-sm text-slate-400 mb-1">
                      Customer
                    </div>
                    <div className="font-semibold text-slate-200">
                      {op.customer_name}
                    </div>
                  </div>

                  {/* AMOUNT */}
                  {op.amount && (
                    <div>
                      <div className="text-sm text-slate-400 mb-1">
                        Amount
                      </div>
                      <div className="font-semibold text-white text-lg">
                        ${op.amount}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
