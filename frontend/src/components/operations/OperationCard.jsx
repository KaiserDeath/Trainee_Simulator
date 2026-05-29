import client, { logTraineeAction } from "../../api/client";

export default function OperationCard({
  operation,
  session,
  refreshOperations,
}) {

  const handleAction = async action => {
    try {
      await client.post(
        `/operations/${operation.id}/process`,
        {
          action,
          traineeName: session.trainee_name,
        }
      );

      refreshOperations();

    } catch (err) {
      console.error(err);
      alert("Failed operation");
    }
  };

  // ── UPDATED: CAPTURE DOM SELECTIONS INSTEAD OF BUTTON CLICKS ───────────
  const handleTextSelection = async () => {
    const username =
      operation.customer?.username ||
      operation.game_account?.game_username;

    if (!username) return;

    // Read the snippet currently highlighted by the user's cursor
    const activeSelection = window.getSelection()?.toString().trim();

    // Only fire API performance logs if the trainee highlighted the actual matching text string
    if (activeSelection === username) {
      try {
        await logTraineeAction(
          session.id,
          'USERNAME_COPIED', // Kept identical payload key so backend stats don't break
          {
            operationId: operation.id,
            operationType: operation.type,
            username,
            timestamp: new Date().toISOString()
          }
        );
      } catch (err) {
        console.error('Failed to log selection action:', err);
      }
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold">
            {operation.type}
          </h3>

          {/* ── UPDATED AREA: REPLACED BUTTON WITH MOUSE-UP TRACKING AND SELECT-ALL ── */}
          <div className="text-slate-400 mt-1">
            <span>Customer: </span>
            <span 
              onMouseUp={handleTextSelection}
              className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded font-mono select-all tracking-wide cursor-text text-sm border border-slate-700/50 inline-block"
              title="Double-click to select"
            >
              {operation.customer?.username || 'N/A'}
            </span>
          </div>

          <p className="text-slate-400 mt-1">
            Platform:
            {" "}
            <span className="font-medium text-slate-300">
              {operation.game_account?.game}
            </span>
          </p>

          {operation.amount && (
            <p className="text-green-400 font-bold mt-2">
              ${operation.amount}
            </p>
          )}
        </div>

        <div className="text-right">
          <span
            className={`px-3 py-1 rounded text-sm font-semibold ${
              operation.status === "PENDING"
                ? "bg-yellow-600/30 text-yellow-400 border border-yellow-600/50"
                : "bg-green-600/30 text-green-400 border border-green-600/50"
            }`}
          >
            {operation.status}
          </span>
        </div>
      </div>

      {operation.status === "PENDING" && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => handleAction("APPROVED")}
            className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-medium text-white transition-colors"
          >
            Approve
          </button>

          <button
            onClick={() => handleAction("CANCELLED")}
            className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded font-medium text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}