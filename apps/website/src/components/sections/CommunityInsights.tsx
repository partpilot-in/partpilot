import React from "react";
import "./sections.css";

const communitySignals = [
  {
    source: "Engineer forum",
    insight: "Thermal derating reported above 85°C",
    evidence: "18 corroborations",
  },
  {
    source: "Design community",
    insight: "Drop-in footprint confirmed in production",
    evidence: "7 verified designs",
  },
  {
    source: "Independent lab",
    insight: "EMI performance validated against reference",
    evidence: "Test report linked",
  },
];

export const CommunityInsights: React.FC = () => {
  return (
    <section className="section">
      <div className="container reverse-split-container">
        <div className="agentic-visual">
          <div className="mockup-card insight-card hover-lift">
            <div className="mockup-header insight-card-header">
              <span>Integrated part insights</span>
              <span className="signal-status">3 new</span>
            </div>
            <div className="insight-part">
              TPS62130RGTR <span>Power management IC</span>
            </div>
            <div className="insight-list">
              {communitySignals.map((signal) => (
                <div className="insight-row" key={signal.source}>
                  <div className="insight-source">{signal.source}</div>
                  <strong>{signal.insight}</strong>
                  <span>{signal.evidence}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="agentic-content">
          <div className="section-label">
            Third-party + community intelligence
          </div>
          <h2 className="section-title">
            See what part data sheets do not tell you
          </h2>
          <p className="agentic-text compact-section-text">
            PartPilot brings trusted third-party research, engineering
            communities, independent test results, and field experience into
            each part record. Every insight stays linked to its source, so teams
            can validate real-world behavior before committing to a component.
          </p>
        </div>
      </div>
    </section>
  );
};
