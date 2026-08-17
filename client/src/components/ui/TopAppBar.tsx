import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Check, ChevronDown, ChevronLeft, DollarSign, LogOut, Moon, Settings, Sun, UserCircle } from "lucide-react";
import { supportedCurrencies, type CurrencyCode } from "../../lib/format";
import { useCurrencyPreference } from "../../lib/useCurrencyPreference";

interface TopAppBarProps {
  organizationSlug: string;
  user: { name: string; avatarUrl?: string } | null;
  onSignOut?: () => void | Promise<void>;
}

export function TopAppBar({ organizationSlug, user, onSignOut }: TopAppBarProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { currency, updateCurrency } = useCurrencyPreference();
  const logoSrc = theme === "dark" ? "/pp-logo-dark.png" : "/pp-logo-light.png";

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
      if (event.key === "Escape") {
        setCurrencyMenuOpen(false);
        setAccountMenuOpen(false);
      }
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
    setCurrencyMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const selectCurrencyMenuItem = (nextCurrency: CurrencyCode) => {
    updateCurrency(nextCurrency);
    setCurrencyMenuOpen(false);
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
              onClick={() => {
                setAccountMenuOpen((open) => !open);
                setCurrencyMenuOpen(false);
              }}
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
                  onMouseEnter={() => setCurrencyMenuOpen(false)}
                  onClick={selectThemeMenuItem}
                >
                  {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                  <span>{theme === "light" ? "Dark theme" : "Light theme"}</span>
                </button>
                <div className="account-menu__submenu-wrap">
                  <button
                    type="button"
                    className="account-menu__item account-menu__item--submenu"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={currencyMenuOpen}
                    onMouseEnter={() => setCurrencyMenuOpen(true)}
                    onClick={() => setCurrencyMenuOpen((open) => !open)}
                  >
                    <DollarSign size={18} />
                    <span className="account-menu__item-main">
                      <span>Default currency</span>
                      <span className="account-menu__item-meta">{currency}</span>
                    </span>
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  {currencyMenuOpen && (
                    <div className="account-menu__panel account-menu__submenu account-menu__submenu--left" role="menu">
                      {supportedCurrencies.map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          className="account-menu__item"
                          role="menuitem"
                          onClick={() => selectCurrencyMenuItem(option.code)}
                        >
                          <span className="account-menu__check-slot">
                            {currency === option.code && <Check size={16} />}
                          </span>
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  className="account-menu__item"
                  role="menuitem"
                  to="/settings"
                  onMouseEnter={() => setCurrencyMenuOpen(false)}
                  onClick={() => {
                    setCurrencyMenuOpen(false);
                    setAccountMenuOpen(false);
                  }}
                >
                  <Settings size={18} />
                  <span>Settings</span>
                </Link>
                {onSignOut && (
                  <button
                    type="button"
                    className="account-menu__item"
                    role="menuitem"
                    onMouseEnter={() => setCurrencyMenuOpen(false)}
                    onClick={() => {
                      setCurrencyMenuOpen(false);
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
