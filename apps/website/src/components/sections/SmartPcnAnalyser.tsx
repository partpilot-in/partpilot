import React from "react";
import "./sections.css";

export const SmartPcnAnalyser: React.FC = () => (
  <section className="section section-alt">
    <div className="container agentic-container">
      <div className="agentic-content">
        <div className="section-label">Supplier change notices</div>
        <h2 className="section-title">Understand supplier changes</h2>
        <p className="agentic-text source-intelligence-text">
          Review what a supplier says is changing and what your engineering team
          may need to investigate.
        </p>
      </div>

      <div className="agentic-visual">
        <div className="mockup-card insight-card">
          <div className="mockup-header">Example supplier change</div>
          <p className="example-note">App data · For illustration</p>
          <div className="insight-part">
            Cypress <span>Additional assembly site</span>
          </div>
          <div className="insight-list">
            <div className="insight-row illustration-row">
              <div className="insight-source">Supplier notice</div>
              <strong>OSE-T, Taiwan qualified as an assembly site</strong>
              <span>Select automotive products</span>
            </div>
            <div
              className="insight-row illustration-row"
              style={{ "--row-index": 1 } as React.CSSProperties}
            >
              <strong>Materials vary by package and assembly site</strong>
              <span>Source: Cypress notice excerpt supplied from the app</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);
