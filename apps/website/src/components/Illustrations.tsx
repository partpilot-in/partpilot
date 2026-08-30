import React from "react";

interface IllustrationProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

// Minimal line-art styles for Apple-like aesthetic
export const PcbIllustration: React.FC<IllustrationProps> = ({
  className = "",
  width = 200,
  height = 200,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 200"
    width={width}
    height={height}
    className={className}
  >
    <rect
      x="20"
      y="20"
      width="160"
      height="160"
      rx="8"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2"
    />
    <path
      d="M40 100 L80 100 L100 80 L140 80"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M40 140 L100 140 L120 120 L160 120"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="40" cy="100" r="3" fill="var(--primary)" />
    <circle cx="140" cy="80" r="3" fill="var(--primary)" />
    <rect
      x="75"
      y="75"
      width="50"
      height="50"
      rx="4"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2"
    />
  </svg>
);

export const McuIllustration: React.FC<IllustrationProps> = ({
  className = "",
  width = 200,
  height = 200,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 200"
    width={width}
    height={height}
    className={className}
  >
    <rect
      x="50"
      y="50"
      width="100"
      height="100"
      rx="4"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2"
    />
    {[60, 80, 100, 120].map((pos, i) => (
      <React.Fragment key={`v-${i}`}>
        <line
          x1={pos}
          y1="35"
          x2={pos}
          y2="50"
          stroke="var(--primary)"
          strokeWidth="2"
        />
        <line
          x1={pos}
          y1="150"
          x2={pos}
          y2="165"
          stroke="var(--primary)"
          strokeWidth="2"
        />
      </React.Fragment>
    ))}
    {[60, 80, 100, 120].map((pos, i) => (
      <React.Fragment key={`h-${i}`}>
        <line
          x1="35"
          y1={pos}
          x2="50"
          y2={pos}
          stroke="var(--primary)"
          strokeWidth="2"
        />
        <line
          x1="150"
          y1={pos}
          x2="165"
          y2={pos}
          stroke="var(--primary)"
          strokeWidth="2"
        />
      </React.Fragment>
    ))}
    <rect
      x="75"
      y="75"
      width="50"
      height="50"
      rx="2"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="1"
      strokeDasharray="4 4"
    />
    <circle cx="100" cy="100" r="10" fill="var(--primary)" />
  </svg>
);

export const OscilloscopeIllustration: React.FC<IllustrationProps> = ({
  className = "",
  width = 200,
  height = 200,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 200"
    width={width}
    height={height}
    className={className}
  >
    <rect
      x="20"
      y="40"
      width="160"
      height="120"
      rx="4"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2"
    />
    <rect
      x="30"
      y="50"
      width="100"
      height="80"
      rx="2"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="1"
    />
    <path
      d="M30 90 C 45 60, 55 120, 80 90 C 95 60, 105 120, 130 90"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="155"
      cy="65"
      r="8"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2"
    />
    <circle
      cx="155"
      cy="100"
      r="8"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2"
    />
  </svg>
);

export const DatasheetIllustration: React.FC<IllustrationProps> = ({
  className = "",
  width = 200,
  height = 200,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 200"
    width={width}
    height={height}
    className={className}
  >
    <rect
      x="50"
      y="30"
      width="100"
      height="140"
      rx="2"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2"
    />
    <line
      x1="65"
      y1="50"
      x2="135"
      y2="50"
      stroke="var(--primary)"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <rect
      x="65"
      y="70"
      width="30"
      height="30"
      rx="2"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="1.5"
    />
    <line
      x1="105"
      y1="75"
      x2="135"
      y2="75"
      stroke="var(--primary)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="105"
      y1="85"
      x2="125"
      y2="85"
      stroke="var(--primary)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="65"
      y1="120"
      x2="135"
      y2="120"
      stroke="var(--primary)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="65"
      y1="130"
      x2="135"
      y2="130"
      stroke="var(--primary)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="65"
      y1="140"
      x2="115"
      y2="140"
      stroke="var(--primary)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
