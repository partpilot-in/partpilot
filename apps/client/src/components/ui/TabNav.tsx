import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface Tab {
  key: string;
  label: string;
  to?: string;
  icon: ReactNode;
  disabled?: boolean;
}

interface TabNavProps {
  tabs: Tab[];
  activeKey: string;
}

export function TabNav({ tabs, activeKey }: TabNavProps) {
  return (
    <nav className="tab-nav" aria-label="Primary">
      <div className="tab-nav__inner">
        {tabs.map((tab) => {
          const className = [
            "tab-nav__link",
            activeKey === tab.key && "tab-nav__link--active",
          ]
            .filter(Boolean)
            .join(" ");
          const content = (
            <>
              <span className="tab-nav__icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="tab-nav__label">{tab.label}</span>
            </>
          );

          if (tab.disabled || !tab.to) {
            return (
              <button
                key={tab.key}
                type="button"
                className={className}
                disabled
                aria-label={tab.label}
                title={tab.label}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={tab.key}
              className={className}
              to={tab.to}
              aria-current={activeKey === tab.key ? "page" : undefined}
              aria-label={tab.label}
              title={tab.label}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
