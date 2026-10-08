import React from "react";
import { AnimatedCard } from "../AnimatedCard";
import "./sections.css";

export const SourceIntelligence: React.FC = () => (
  <section className="section section-alt">
    <div className="container agentic-container">
      <div className="agentic-content">
        <div className="section-label">PartPilot Source Intelligence</div>
        <h2 className="section-title">See the evidence behind each finding</h2>
        <p className="agentic-text source-intelligence-text">
          Review available manufacturer and distributor information, follow the
          sources, and see what still needs verification.
        </p>
      </div>

      <div className="agentic-visual">
        <AnimatedCard className="mockup-card insight-card">
          <div className="mockup-header">Example source evidence</div>
          <p className="example-note">App data · For illustration</p>
          <div className="insight-part">
            RC0805FR-07100KL <span>Component record</span>
          </div>
          <div className="insight-list">
            <div className="insight-row illustration-row">
              <div className="insight-source">Electrical</div>
              <strong data-stream-value>100 kΩ · ±1% · 0.125 W</strong>
              <span>Source: PartPilot app component record</span>
            </div>
            <div
              className="insight-row illustration-row"
              style={{ "--row-index": 1 } as React.CSSProperties}
            >
              <div className="insight-source">Reliability</div>
              <strong data-stream-value>Not assessed</strong>
              <span>No data in the supplied record</span>
            </div>
          </div>
        </AnimatedCard>
      </div>
    </div>
  </section>
);
