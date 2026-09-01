import type { CSSProperties } from "react";

interface SpinnerProps {
  /** Optional message displayed below the spinner */
  message?: string;
  /** Size in px — defaults to 32 */
  size?: number;
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "3rem 1rem",
};

export function Spinner({ message, size = 32 }: SpinnerProps) {
  return (
    <div style={containerStyle} role="status" aria-label={message ?? "Loading"}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: "spin 0.8s linear infinite" }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="var(--clr-border, #333)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="50 20"
        />
      </svg>
      {message && (
        <p style={{ color: "var(--clr-text-muted, #888)", fontSize: 14 }}>
          {message}
        </p>
      )}
    </div>
  );
}

export function CellSpinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading part details"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="var(--clr-text-muted, #888)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="36 18"
      />
    </svg>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "1.5rem",
        color: "var(--signal-critical, #ef4444)",
        textAlign: "center",
        fontSize: 14,
      }}
      role="alert"
    >
      <p>⚠ {message}</p>
    </div>
  );
}
