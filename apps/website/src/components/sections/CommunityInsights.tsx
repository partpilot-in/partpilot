import React from "react";
import { AnimatedCard } from "../AnimatedCard";
import "./sections.css";

export const CommunityInsights: React.FC = () => (
  <section className="section">
    <div className="container reverse-split-container">
      <div className="agentic-visual">
        <AnimatedCard className="mockup-card insight-card">
          <div className="mockup-header">Example engineering discussion</div>
          <p className="example-note">App data · For illustration</p>
          <div className="insight-part">
            bq76940 <span>REGOUT investigation</span>
          </div>
          <div className="insight-list">
            <div className="insight-row illustration-row">
              <div className="insight-source">Discussion excerpt</div>
              <blockquote data-stream-value>
                “REGOUT should never have 5V, this is a damaging voltage.”
              </blockquote>
              <span>Source: Engineering discussion supplied from the app</span>
            </div>
            <div
              className="insight-row illustration-row"
              style={{ "--row-index": 1 } as React.CSSProperties}
            >
              <strong>
                Suggested check:{" "}
                <span data-stream-value>confirm board voltages</span>
              </strong>
              <span>Discussion advice; investigate in your design.</span>
            </div>
          </div>
        </AnimatedCard>
      </div>

      <div className="agentic-content">
        <div className="section-label">
          Third-party + community intelligence
        </div>
        <h2 className="section-title">
          Learn from other engineers’ experience
        </h2>
        <p className="agentic-text compact-section-text">
          Explore sourced engineering discussions about components. Use them
          alongside manufacturer documentation to guide further investigation.
        </p>
      </div>
    </div>
  </section>
);
