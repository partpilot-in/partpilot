import React from "react";
import { AnimatedCard } from "../AnimatedCard";
import "./sections.css";

export const ManufacturerLiveScoring: React.FC = () => (
  <section className="section section-alt">
    <div className="container agentic-container">
      <div className="agentic-content">
        <div className="section-label">Component updates</div>
        <h2 className="section-title">Understand what changed</h2>
        <p className="agentic-text compact-section-text">
          Review available lifecycle, availability, and supplier updates to see
          which components may need attention.
        </p>
      </div>

      <div className="agentic-visual">
        <AnimatedCard className="mockup-card insight-card">
          <div className="mockup-header">Example lifecycle update</div>
          <p className="example-note">App data · For illustration</p>
          <div className="insight-part">
            A3PE3000 family <span>896-pin PBGA · Microchip EOL notice</span>
          </div>
          <div className="insight-list">
            <div className="insight-row illustration-row">
              <div className="insight-source" data-stream-value>
                End of life
              </div>
              <strong>
                Last bookings: <span data-stream-value>1 December 2026</span>
              </strong>
              <span>
                Last shipments: <span data-stream-value>1 December 2028</span>
              </span>
            </div>
            <div
              className="insight-row illustration-row"
              style={{ "--row-index": 1 } as React.CSSProperties}
            >
              <strong>Replacement depends on ordering code</strong>
              <span>
                Source: Microchip notice excerpt supplied from the app
              </span>
            </div>
          </div>
        </AnimatedCard>
      </div>
    </div>
  </section>
);
