import React from "react";

import "./Navbar.css";

export const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="container navbar-container">
        <a href="/" className="navbar-logo">
          <img
            src="/pp-logo-light.png"
            alt="PartPilot Logo"
            style={{ height: "24px", width: "auto" }}
          />
          <span>PartPilot</span>
        </a>

        <div className="navbar-actions">
          <a
            href="https://github.com/partpilot-in/partpilot"
            className="navbar-repo"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="PartPilot on GitHub"
            title="GitHub Repository"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              className="navbar-repo-icon"
            >
              <path d="M12 0C5.37 0 0 5.5 0 12.29c0 5.43 3.44 10.03 8.21 11.65.6.11.82-.27.82-.59 0-.29-.01-1.06-.02-2.09-3.34.74-4.04-1.65-4.04-1.65-.55-1.42-1.34-1.8-1.34-1.8-1.09-.77.08-.75.08-.75 1.2.09 1.84 1.27 1.84 1.27 1.07 1.88 2.81 1.34 3.5 1.02.11-.79.42-1.34.76-1.64-2.67-.31-5.47-1.37-5.47-6.08 0-1.34.47-2.44 1.24-3.3-.12-.31-.54-1.56.12-3.26 0 0 1.01-.33 3.3 1.26a11.18 11.18 0 0 1 6 0c2.29-1.59 3.3-1.26 3.3-1.26.66 1.7.24 2.95.12 3.26.77.86 1.24 1.96 1.24 3.3 0 4.73-2.81 5.76-5.49 6.07.43.38.81 1.13.81 2.27 0 1.64-.02 2.96-.02 3.36 0 .33.22.71.83.59A12.26 12.26 0 0 0 24 12.29C24 5.5 18.63 0 12 0Z" />
            </svg>
          </a>
          <a
            href="https://app.bestpartpilot.com"
            className="navbar-launch"
            target="_blank"
            rel="noopener noreferrer"
          >
            Launch App
          </a>
        </div>
      </div>
    </nav>
  );
};
