import client from "../../api/client";

export default function OperationCard({
  operation,
  session,
  refreshOperations,
}) {

  const handleAction = async action => {
    try {
      await client.post(
        `/operations/process/${operation.id}`,
        {
          action,
          traineeName:
            session.trainee_name,
        }
      );

      refreshOperations();

    } catch (err) {
      console.error(err);
      alert("Failed operation");
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold">
            {operation.type}
          </h3>

          <p className="text-slate-400">
            Customer:
            {" "}
            {
              operation.customer
                ?.username
            }
          </p>

          <p className="text-slate-400">
            Platform:
            {" "}
            {
              operation.game_account
                ?.game
            }
          </p>

          {operation.amount && (
            <p className="text-green-400 font-bold mt-2">
              ${operation.amount}
            </p>
          )}
        </div>

        <div className="text-right">
          <span
            className={`px-3 py-1 rounded text-sm ${
              operation.status ===
              "PENDING"
                ? "bg-yellow-600"
                : "bg-green-600"
            }`}
          >
            {operation.status}
          </span>
        </div>
      </div>

      {operation.status ===
        "PENDING" && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() =>
              handleAction(
                "APPROVED"
              )
            }
            className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded"
          >
            Approve
          </button>

          <button
            onClick={() =>
              handleAction(
                "REJECTED"
              )
            }
            className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}