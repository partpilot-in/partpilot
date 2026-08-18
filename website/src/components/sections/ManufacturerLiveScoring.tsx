import React from 'react';
import './sections.css';

const scoreSignals = [
  { label: 'Manufacturer notices', detail: '2 reviewed today', state: 'Current' },
  { label: 'Lifecycle status', detail: 'Active · updated 6h ago', state: 'Stable' },
  { label: 'Lead-time movement', detail: '12 to 14 weeks', state: '-4 pts' },
  { label: 'Compliance files', detail: 'No document gaps', state: 'Clear' }
];

export const ManufacturerLiveScoring: React.FC = () => {
  return (
    <section className="section section-alt">
      <div className="container agentic-container">
        <div className="agentic-content">
          <div className="section-label">Daily manufacturer monitoring</div>
          <h2 className="section-title">Live part scores that change when the evidence changes</h2>
          <p className="agentic-text compact-section-text">
            PartPilot tracks manufacturer notifications every day—including PCNs, lifecycle updates, compliance documents, and availability signals—then refreshes each part score automatically. Teams see what changed, why the score moved, and where action is needed.
          </p>
        </div>

        <div className="agentic-visual">
          <div className="mockup-card score-card hover-lift">
            <div className="score-summary">
              <div>
                <span className="score-eyebrow">Part confidence</span>
                <strong className="score-value">88</strong>
              </div>
              <div className="score-freshness">
                <span className="live-dot" aria-hidden="true" />
                Updated today
              </div>
            </div>
            <div className="score-meter" aria-label="Part confidence score: 88 out of 100">
              <span style={{ width: '88%' }} />
            </div>
            <div className="score-signal-list">
              {scoreSignals.map((signal) => (
                <div className="score-signal" key={signal.label}>
                  <div>
                    <strong>{signal.label}</strong>
                    <span>{signal.detail}</span>
                  </div>
                  <b>{signal.state}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
