import React from 'react';

import './Navbar.css';

export const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="container navbar-container">
        <a href="/" className="navbar-logo">
          <img src="/pp-logo-light.png" alt="PartPilot Logo" style={{ height: '24px', width: 'auto' }} />
          <span>PartPilot</span>
        </a>

        <div className="navbar-actions">
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
