interface ScoreRingProps {
  value: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const sizeMap = {
  sm: 34,
  md: 44,
  lg: 64,
};

function scoreColor(value: number) {
  if (value >= 80) return "var(--signal-good)";
  if (value >= 60) return "var(--signal-caution)";
  if (value >= 40) return "var(--signal-warn)";
  return "var(--signal-critical)";
}

export function ScoreRing({ value, size = "md", showLabel = false }: ScoreRingProps) {
  const dimension = sizeMap[size];
  const stroke = size === "lg" ? 5 : 4;
  const radius = (dimension - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, Math.round(value)));
  const dashOffset = circumference - (normalized / 100) * circumference;

  return (
    <span
      className={`score-ring score-ring--${size}`}
      style={{ "--score-color": scoreColor(normalized) } as React.CSSProperties}
      aria-label={`PartPilot score ${normalized} out of 100`}
    >
      <span className="score-ring__figure" style={{ width: dimension, height: dimension }}>
        <svg width={dimension} height={dimension} viewBox={`0 0 ${dimension} ${dimension}`} aria-hidden="true">
          <circle
            className="score-ring__track"
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
          />
          <circle
            className="score-ring__value"
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="score-ring__number">{normalized}</span>
      </span>
      {showLabel && <span className="score-ring__label">PartPilot Score</span>}
    </span>
  );
}
