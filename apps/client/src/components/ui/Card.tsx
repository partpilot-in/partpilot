import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, action, children, className }: CardProps) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")}>
      {(title || action) && (
        <div className="card__header">
          {title ? <h2 className="card__title">{title}</h2> : <span />}
          {action}
        </div>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}
