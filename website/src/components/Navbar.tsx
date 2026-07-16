import React from 'react';

import './Navbar.css';

export const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="container navbar-container">
        <a href="/" className="navbar-logo">
          <img src="/logo.png" alt="PartPilot Logo" style={{height: '24px', width: 'auto'}} />
          <span>PartPilot</span>
        </a>
        
        <div className="navbar-actions">
          <a href="https://partpilot-client-production.up.railway.app/dashboard" className="btn btn-primary btn-sm">Sign In</a>
        </div>
      </div>
    </nav>
  );
};
