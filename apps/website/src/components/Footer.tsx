import React from "react";
import "./Footer.css";

export const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="container footer-compact">
        <p>&copy; {new Date().getFullYear()} PartPilot. All rights reserved.</p>
        <div className="footer-social-links">
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
          <a
            href="https://x.com/partpilotinc"
            className="footer-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="PartPilot on X"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.48 3.24H4.29l13.32 17.41Z" />
            </svg>
          </a>
          <a
            href="https://www.crunchbase.com/organization/partpilot"
            className="footer-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="PartPilot on Crunchbase"
          >
            <span aria-hidden="true">cb</span>
          </a>
        </div>
      </div>
    </footer>
  );
};
