
export default function PlayerInGameModal({
  message,
  onClose
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="player-in-game-title"
      data-testid="player-in-game-modal"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-md bg-white p-5 text-center text-black shadow-xl">
        <h3
          id="player-in-game-title"
          className="mb-2 text-lg font-semibold text-red-700"
        >
          Warning
        </h3>
        <p className="mb-4">{message}</p>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="rounded bg-[#173954] px-5 py-1.5 text-white"
        >
          OK
        </button>
      </div>
    </div>
  );
}
