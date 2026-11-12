'use client';
import { type ReactNode, useEffect, useId, useRef } from 'react';

/**
 * Every create and edit form: a native <dialog> opened with showModal(), title, fields, then
 * "Cancel" and one primary button at the bottom right. Full screen under 640 px.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-0 h-full max-h-none w-full max-w-none bg-surface p-0 text-text sm:m-auto sm:h-auto sm:max-h-[90vh] sm:w-[560px] sm:rounded-[8px] sm:border sm:border-border"
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 id={titleId} className="text-[20px] font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="h-11 w-11 rounded-[6px] text-text-secondary sm:h-9 sm:w-9" aria-label="Close">
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
