import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronDown, LogOut, Moon, Settings, Sun, UserCircle } from "lucide-react";

interface TopAppBarProps {
  organizationSlug: string;
  user: { name: string; avatarUrl?: string } | null;
  onSignOut?: () => void | Promise<void>;
}

export function TopAppBar({ organizationSlug, user, onSignOut }: TopAppBarProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const logoSrc = theme === "dark" ? "/PP Logo - Dark.png" : "/PP Logo - Light.png";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    function closeAccountMenu(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function closeAccountMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("mousedown", closeAccountMenu);
    document.addEventListener("keydown", closeAccountMenuOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeAccountMenu);
      document.removeEventListener("keydown", closeAccountMenuOnEscape);
    };
  }, []);

  const initials = user?.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const toggleTheme = () => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  };

  const selectThemeMenuItem = () => {
    toggleTheme();
    setAccountMenuOpen(false);
  };

  return (
    <header className="top-app-bar">
      <div className="top-app-bar__inner">
        <div className="top-app-bar__identity">
          <Link className="brand-link" to="/dashboard" aria-label="PartPilot dashboard">
            <img className="brand-mark" src={logoSrc} alt="" />
            <span>PartPilot</span>
          </Link>
        </div>
        <div className="top-actions">
          <span className="org-slug" title="Organization">
            <Building2 size={14} aria-hidden="true" />
            {organizationSlug}
          </span>
          <div className="account-menu" ref={accountMenuRef}>
            <button
              type="button"
              className="user-chip"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label={user ? `${user.name} account menu` : "Guest account menu"}
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <span className="user-chip__name">{user?.name ?? "Guest"}</span>
              <span className="avatar">
                {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials || <UserCircle size={18} />}
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {accountMenuOpen && (
              <div className="account-menu__panel" role="menu">
                <button
                  type="button"
                  className="account-menu__item"
                  role="menuitem"
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse") return;
                    event.preventDefault();
                    event.stopPropagation();
                    selectThemeMenuItem();
                  }}
                  onClick={selectThemeMenuItem}
                >
                  {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                  <span>{theme === "light" ? "Dark theme" : "Light theme"}</span>
                </button>
                <button
                  type="button"
                  className="account-menu__item"
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  <Settings size={18} />
                  <span>Settings</span>
                </button>
                {onSignOut && (
                  <button
                    type="button"
                    className="account-menu__item"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      void onSignOut();
                    }}
                  >
                    <LogOut size={18} />
                    <span>Sign out</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
