'use client';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

interface ToastMessage {
  id: number;
  message: string;
  tone: 'neutral' | 'negative';
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<{ show: (message: string, opts?: Omit<ToastMessage, 'id' | 'message' | 'tone'> & { tone?: ToastMessage['tone'] }) => void }>({
  show: () => undefined,
});

/** The result of an action: bottom of the screen, role="status", gone after 5 s, at most one action. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);
  const show = useCallback((message: string, opts: { tone?: ToastMessage['tone']; action?: ToastMessage['action'] } = {}) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, message, tone: opts.tone ?? 'neutral', action: opts.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-[560px] items-center gap-4 rounded-[8px] px-4 py-3 text-sm text-white shadow-lg ${t.tone === 'negative' ? 'bg-negative' : 'bg-text'}`}
          >
            <span>{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="shrink-0 font-semibold underline"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
