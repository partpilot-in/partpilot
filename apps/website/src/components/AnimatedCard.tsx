import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";
import "./AnimatedCard.css";

type ContentElement = ReactElement<{
  children?: ReactNode;
  "data-stream-value"?: boolean;
}>;

function textLength(nodes: ReactNode, enabled = false): number {
  let length = 0;
  Children.forEach(nodes, (node) => {
    if (typeof node === "string" || typeof node === "number") {
      if (enabled) length += String(node).trim() ? String(node).length : 0;
    } else if (isValidElement(node)) {
      const element = node as ContentElement;
      length += textLength(
        element.props.children,
        enabled || element.props["data-stream-value"] === true,
      );
    }
  });
  return length;
}

function streamContent(
  nodes: ReactNode,
  budget: { remaining: number },
  enabled = false,
): ReactNode {
  return Children.map(nodes, (node) => {
    if (typeof node === "string" || typeof node === "number") {
      const text = String(node);
      if (!enabled || !text.trim()) return node;
      const revealed = Math.max(0, Math.min(text.length, budget.remaining));
      budget.remaining -= text.length;
      const typing = revealed > 0 && revealed < text.length;
      return (
        <span className="stream-text">
          <span className="stream-accessible">{text}</span>
          <span className="stream-reserve" aria-hidden="true">
            {text}
          </span>
          <span className="stream-output" aria-hidden="true">
            {text.slice(0, revealed)}
            {typing && <span className="stream-cursor" />}
          </span>
        </span>
      );
    }
    if (isValidElement(node)) {
      const element = node as ContentElement;
      if (element.props.children === undefined) return node;
      return cloneElement(element, {
        children: streamContent(
          element.props.children,
          budget,
          enabled || element.props["data-stream-value"] === true,
        ),
      });
    }
    return node;
  });
}

export const AnimatedCard = ({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<"div">) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const total = useMemo(() => textLength(children), [children]);
  const [revealed, setRevealed] = useState(() =>
    typeof window === "undefined" ||
    !("IntersectionObserver" in window) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? Infinity
      : 0,
  );

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !("IntersectionObserver" in window)) return;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let frame = 0;
    let started = false;
    let finished = motionPreference.matches;

    const finish = () => {
      if (!motionPreference.matches) return;
      finished = true;
      cancelAnimationFrame(frame);
      setRevealed(Infinity);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started || finished) return;
        started = true;
        observer.disconnect();
        let start: number | undefined;
        const duration = Math.min(4000, Math.max(1200, total * 12));
        const tick = (time: number) => {
          if (finished) return;
          start ??= time;
          const progress = Math.min(1, (time - start) / duration);
          setRevealed(Math.ceil(progress * total));
          if (progress < 1) frame = requestAnimationFrame(tick);
          else finished = true;
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.15 },
    );
    observer.observe(card);
    motionPreference.addEventListener("change", finish);
    return () => {
      finished = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionPreference.removeEventListener("change", finish);
    };
  }, [total]);

  return (
    <div {...props} ref={cardRef} className={`animated-card ${className}`}>
      {streamContent(children, { remaining: revealed })}
    </div>
  );
};
