import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  DollarSign,
  LogOut,
  Moon,
  Settings,
  Share2,
  Sun,
  UserCircle,
} from "lucide-react";
import { supportedCurrencies, type CurrencyCode } from "../../lib/format";
import { useCurrencyPreference } from "../../lib/useCurrencyPreference";

interface TopAppBarProps {
  user: { name: string; organizationName?: string; avatarUrl?: string } | null;
  onSignOut?: () => void | Promise<void>;
}

const socialLinks = [
  {
    label: "Crunchbase",
    href: "https://www.crunchbase.com/organization/partpilot",
  },
  {
    label: "GitHub",
    href: "https://github.com/partpilot-in",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/bestpartpilot/",
  },
  {
    label: "X",
    href: "https://x.com/partpilotinc",
  },
];

function userChipName(user: TopAppBarProps["user"]) {
  if (!user) return "Guest";

  const organizationName = user.organizationName?.trim();
  if (!organizationName) return user.name;

  const firstName = user.name.trim().split(/\s+/)[0];
  return firstName ? `${firstName} from ${organizationName}` : organizationName;
}

function userFirstName(user: TopAppBarProps["user"]) {
  if (!user) return "Guest";

  return user.name.trim().split(/\s+/)[0] || user.name;
}

export function TopAppBar({ user, onSignOut }: TopAppBarProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { currency, updateCurrency } = useCurrencyPreference();
  const logoSrc = theme === "dark" ? "/pp-logo-dark.png" : "/pp-logo-light.png";
  const displayName = userChipName(user);
  const mobileDisplayName = userFirstName(user);

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
        setConnectMenuOpen(false);
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
    setConnectMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const selectCurrencyMenuItem = (nextCurrency: CurrencyCode) => {
    updateCurrency(nextCurrency);
    setCurrencyMenuOpen(false);
    setConnectMenuOpen(false);
    setAccountMenuOpen(false);
  };

  return (
    <header className="top-app-bar">
      <div className="top-app-bar__inner">
        <div className="top-app-bar__identity">
          <Link
            className="brand-link"
            to="/dashboard"
            aria-label="PartPilot dashboard"
          >
            <img className="brand-mark" src={logoSrc} alt="" />
            <span>PartPilot</span>
          </Link>
        </div>
        <div className="top-actions">
          <div className="account-menu" ref={accountMenuRef}>
            <button
              type="button"
              className="user-chip"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label={`${displayName} account menu`}
              onClick={() => {
                setAccountMenuOpen((open) => !open);
                setCurrencyMenuOpen(false);
                setConnectMenuOpen(false);
              }}
            >
              <span className="user-chip__name user-chip__name--desktop">
                {displayName}
              </span>
              <span className="user-chip__name user-chip__name--mobile">
                {mobileDisplayName}
              </span>
              <span className="avatar">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" />
                ) : (
                  initials || <UserCircle size={18} />
                )}
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
                  onMouseEnter={() => {
                    setCurrencyMenuOpen(false);
                    setConnectMenuOpen(false);
                  }}
                  onClick={selectThemeMenuItem}
                >
                  {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                  <span>
                    {theme === "light" ? "Dark theme" : "Light theme"}
                  </span>
                </button>
                <div className="account-menu__submenu-wrap">
                  <button
                    type="button"
                    className="account-menu__item account-menu__item--submenu"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={currencyMenuOpen}
                    onMouseEnter={() => {
                      setCurrencyMenuOpen(true);
                      setConnectMenuOpen(false);
                    }}
                    onClick={() => {
                      setCurrencyMenuOpen((open) => !open);
                      setConnectMenuOpen(false);
                    }}
                  >
                    <DollarSign size={18} />
                    <span className="account-menu__item-main">
                      <span>Default Currency:</span>
                      <span className="account-menu__item-meta">
                        {currency}
                      </span>
                    </span>
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  {currencyMenuOpen && (
                    <div
                      className="account-menu__panel account-menu__submenu account-menu__submenu--left"
                      role="menu"
                    >
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
                <div className="account-menu__submenu-wrap">
                  <button
                    type="button"
                    className="account-menu__item account-menu__item--submenu"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={connectMenuOpen}
                    onMouseEnter={() => {
                      setConnectMenuOpen(true);
                      setCurrencyMenuOpen(false);
                    }}
                    onClick={() => {
                      setConnectMenuOpen((open) => !open);
                      setCurrencyMenuOpen(false);
                    }}
                  >
                    <Share2 size={18} />
                    <span>Connect with us</span>
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  {connectMenuOpen && (
                    <div
                      className="account-menu__panel account-menu__submenu account-menu__submenu--left"
                      role="menu"
                    >
                      {socialLinks.map((link) => (
                        <a
                          key={link.href}
                          className="account-menu__item"
                          role="menuitem"
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            setConnectMenuOpen(false);
                            setAccountMenuOpen(false);
                          }}
                        >
                          <span>{link.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  className="account-menu__item"
                  role="menuitem"
                  to="/settings"
                  onMouseEnter={() => {
                    setCurrencyMenuOpen(false);
                    setConnectMenuOpen(false);
                  }}
                  onClick={() => {
                    setCurrencyMenuOpen(false);
                    setConnectMenuOpen(false);
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
                    onMouseEnter={() => {
                      setCurrencyMenuOpen(false);
                      setConnectMenuOpen(false);
                    }}
                    onClick={() => {
                      setCurrencyMenuOpen(false);
                      setConnectMenuOpen(false);
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
