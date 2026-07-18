import React from 'react';
import './Footer.css';

export const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top-row">
          <h2 className="footer-headline">Find the supply chain risk before it finds you.</h2>
          <a href="https://calendly.com" className="footer-cta" target="_blank" rel="noopener noreferrer">Schedule Intro Call &rarr;</a>
        </div>

        <div className="footer-links-grid">
          <div className="footer-column">
            <h4>FEATURES</h4>
            <a href="#">Supply Chain Watch</a>
            <a href="#">Compliance Manager</a>
            <a href="#">Part Risk Manager</a>
            <a href="#">Supplier Insights</a>
            <a href="#">Source Data Intelligence</a>
          </div>
          <div className="footer-column">
            <h4>FOR INDUSTRY</h4>
            <a href="#">Consumer Electronics</a>
            <a href="#">Aerospace & Defense</a>
            <a href="#">Medical Devices</a>
            <a href="#">Automotive</a>
            <a href="#">Telecommunications</a>
            <a href="#">Industrial</a>
            <a href="#">Robotics</a>
          </div>
          <div className="footer-column">
            <h4>RESOURCES</h4>
            <a href="#">Blog</a>
            <a href="#">Newsletter</a>
            <a href="#">Case Studies</a>
          </div>
          <div className="footer-column">
            <h4>COMPANY</h4>
            <a href="#">Contact Us</a>
            <a
              href="https://www.linkedin.com/company/bestpartpilot/"
              className="footer-social-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="PartPilot on LinkedIn"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.61 0 4.27 2.37 4.27 5.46v6.28ZM5.32 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.54V9H7.1v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.21 0 22.23 0Z" />
              </svg>
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-logo">
            <img src="/logo.png" alt="PartPilot Logo" style={{ height: '20px', width: 'auto', filter: 'grayscale(100%) opacity(70%)' }} />
            <span>PartPilot</span>
          </div>
          <p>&copy; {new Date().getFullYear()} PartPilot. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
