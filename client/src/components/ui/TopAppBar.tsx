import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Moon, Settings, Sun, UserCircle } from "lucide-react";

interface TopAppBarProps {
  organizationSlug: string;
  user: { name: string; avatarUrl?: string } | null;
}

export function TopAppBar({ organizationSlug, user }: TopAppBarProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const initials = user?.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <header className="top-app-bar">
      <div className="top-app-bar__inner">
        <div className="top-app-bar__identity">
          <Link className="brand-link" to="/dashboard" aria-label="PartPilot dashboard">
            <span className="brand-mark">P</span>
            <span>PartPilot</span>
          </Link>
          <span className="org-slug" title="Organization">
            <Building2 size={14} aria-hidden="true" />
            {organizationSlug}
          </span>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button type="button" className="icon-button" aria-label="Settings">
            <Settings size={18} />
          </button>
          <span className="user-chip" aria-label={user ? `${user.name} account` : "Guest account"}>
            <span className="user-chip__name">{user?.name ?? "Guest"}</span>
            <span className="avatar">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials || <UserCircle size={18} />}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
