export default function GamesLauncher({
  session
}) {
  const openGame = path => {
    window.open(
      path,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const orionUrl =
    `/sim/games/orion-stars/${session.id}`;
  const goldenDragonUrl =
    `/sim/games/golden-dragon/${session.id}`;
  const vblinkUrl =
    `/sim/games/vblink/${session.id}`;

  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-800">
          Game Backoffice Windows
        </h3>

        <p className="text-sm text-slate-500">
          Open each simulated platform in a separate browser window so the operations dashboard stays visible.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <button
          onClick={() =>
            openGame(orionUrl)
          }
          className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-left hover:border-blue-500 hover:bg-blue-50"
        >
          <p className="text-lg font-bold text-slate-800">
            Orion Stars
          </p>

          <p className="mt-2 text-sm text-slate-500">
            User Management, Recharge, Redeem, Reset Password, Transaction Records.
          </p>
        </button>

        <button
          onClick={() =>
            openGame(vblinkUrl)
          }
          className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-left hover:border-blue-500 hover:bg-blue-50"
          data-testid="vblink-launcher-btn"
        >
          <p className="text-lg font-bold text-slate-800">
            Vblink
          </p>

          <p className="mt-2 text-sm text-slate-500">
              User Management, Add Player, Set Score, Score Log, Edit Password.
          </p>
        </button>

        <button
          onClick={() =>
            openGame(goldenDragonUrl)
          }
          className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-left hover:border-blue-500 hover:bg-blue-50"
        >
          <p className="text-lg font-bold text-slate-800">
            Golden Dragon
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Customer Account, Mobile ID, Purchase, Redeem, Game History.
          </p>
        </button>
      </div>
    </div>
  );
}
