import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "info" | "success";

interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
}

interface ToastRecord extends ToastInput {
  id: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function createId() {
  if ("crypto" in window && "randomUUID" in window.crypto)
    return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = createId();
      const record: ToastRecord = { ...toast, id, tone: toast.tone ?? "info" };
      setToasts((current) => [...current, record]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.tone === "success" ? (
              <CheckCircle2
                size={18}
                color="var(--signal-good)"
                aria-hidden="true"
              />
            ) : (
              <Info size={18} color="var(--accent)" aria-hidden="true" />
            )}
            <div style={{ flex: 1 }}>
              <p className="toast__title">{toast.title}</p>
              {toast.body && <p className="toast__body">{toast.body}</p>}
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
