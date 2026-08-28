import {
  useEffect,
  useRef,
  useState
} from 'react';
import { X } from 'lucide-react';

const MAX_REASON_LENGTH = 1000;

export default function MovementConfirmationModal({
  action,
  error,
  isSubmitting,
  onClose,
  onConfirm
}) {
  const dialogRef = useRef(null);
  const reasonRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const [reason, setReason] = useState('');
  const isCancellation = action === 'CANCELLED';
  const canSubmit =
    !isSubmitting &&
    (
      !isCancellation ||
      reason.trim().length > 0
    );

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog?.open) {
      dialog?.showModal();
    }

    if (isCancellation) {
      reasonRef.current?.focus();
    } else {
      cancelButtonRef.current?.focus();
    }

    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, [isCancellation]);

  const handleCancel = event => {
    event.preventDefault();

    if (!isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = event => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onConfirm(
      isCancellation
        ? reason.trim()
        : null
    );
  };

  const handleKeyDown = event => {
    if (
      event.key === 'Escape' &&
      !isSubmitting
    ) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-busy={isSubmitting}
      aria-describedby={
        isCancellation
          ? 'movement-cancel-instructions'
          : 'movement-accept-instructions'
      }
      aria-labelledby="movement-confirmation-title"
      className={`m-auto max-h-none w-[calc(100%-2rem)] max-w-[616px] overflow-hidden rounded-[9px] border-0 bg-white p-0 text-slate-950 shadow-2xl outline-none backdrop:bg-[#292C2A] ${isCancellation ? '' : '-translate-y-[7px]'}`}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
    >
      <form onSubmit={handleSubmit}>
        <div className="flex h-[52px] items-center justify-end border-b border-[#E5E5E5] px-[25px]">
          <button
            type="button"
            aria-label="Close transaction dialog"
            className="rounded p-1 text-black transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X aria-hidden="true" size={25} strokeWidth={2.5} />
          </button>
        </div>

        {isCancellation ? (
          <div className="px-10 pb-[45px] pt-[25px] sm:px-10">
            <h2
              id="movement-confirmation-title"
              className="text-center text-[23px] font-bold leading-7 text-black"
            >
              Cancel Transaction
            </h2>
            <label
              id="movement-cancel-instructions"
              htmlFor="movement-cancellation-reason"
              className="mt-[11px] block text-[17px] leading-6 text-black"
            >
              Enter the reason it was canceled
            </label>
            <textarea
              ref={reasonRef}
              id="movement-cancellation-reason"
              value={reason}
              required
              maxLength={MAX_REASON_LENGTH}
              rows={5}
              placeholder="Enter the reason"
              disabled={isSubmitting}
              className="mt-[11px] h-[132px] w-full resize-none rounded-[7px] border-2 border-[#D8D8D8] px-[17px] py-[12px] text-[14px] outline-none transition placeholder:text-[#8C8C8C] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
              onChange={event => setReason(event.target.value)}
            />
          </div>
        ) : (
          <div className="px-8 pb-[50px] pt-[25px] text-center">
            <h2
              id="movement-confirmation-title"
              className="text-[23px] font-bold leading-7 text-[#2F8738]"
            >
              Accept Transaction
            </h2>
            <p
              id="movement-accept-instructions"
              className="mt-[14px] text-[17px] leading-6 text-black"
            >
              Are you sure about carrying out this transaction?
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="border-t border-red-100 bg-red-50 px-6 py-3 text-center text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="grid h-[57px] grid-cols-2 border-t border-[#E5E5E5]">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={isSubmitting}
            className="text-[18px] font-semibold text-[#FF3838] transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="border-l border-[#E5E5E5] text-[18px] font-semibold text-black transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:text-[#98A3A8]"
          >
            {isSubmitting
              ? (
                  isCancellation
                    ? 'Notifying...'
                    : 'Accepting...'
                )
              : (
                  isCancellation
                    ? 'Notify'
                    : 'Accept'
                )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
