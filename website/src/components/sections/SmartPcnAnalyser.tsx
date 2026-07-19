import React from 'react';
import './sections.css';

const pcnReviewRows = [
  {
    label: 'Change',
    value: 'Die attach + mold compound',
    flagged: true
  },
  {
    label: 'Why',
    value: 'Thermal path changes; specs stay same',
    flagged: true
  },
  {
    label: 'Risk',
    value: 'R\u03b8JA drift; cycling delam',
    flagged: true
  },
  {
    label: 'Action',
    value: 'Requal R\u03b8JA + thermal cycling',
    flagged: true
  },
  {
    label: 'Timing',
    value: 'First ship Sep 15, 2026; no LTB',
    flagged: false
  }
];

export const SmartPcnAnalyser: React.FC = () => {
  return (
    <section className="section section-alt">
      <div className="container risk-manager-container">
        <div className="agentic-visual">
          <div className="mockup-card pcn-card hover-lift">
            <div className="mockup-header pcn-card-header">
              <span>MOSFET PCN Review</span>
              <span className="pcn-status">Flagged</span>
            </div>

            <div className="pcn-claim">
              Supplier claim: <strong>"No change to electrical specs"</strong>
              <span>PSMN4R8-100BSE / -Q</span>
            </div>

            <div className="pcn-table pcn-review-table" aria-label="Why this PCN matters">
              <div className="pcn-table-row pcn-table-head" aria-hidden="true">
                <span>Review</span>
                <span>Why it matters</span>
                <span>Risk</span>
              </div>
              {pcnReviewRows.map((row) => (
                <div key={row.label} className="pcn-table-row">
                  <span className="pcn-property-group">{row.label}</span>
                  <span className="pcn-property-name">{row.value}</span>
                  <span
                    className={row.flagged ? 'pcn-change-badge pcn-flagged' : 'pcn-change-badge pcn-unchanged'}
                    aria-label={row.flagged ? 'review required' : 'captured'}
                    title={row.flagged ? 'Review required' : 'Captured'}
                  >
                    {row.flagged ? '!' : 'OK'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="agentic-content">
          <div className="section-label">Smart PCN Analyser</div>
          <h2 className="section-title">Verify supplier change notices beyond the headline</h2>
          <p className="agentic-text source-intelligence-text">
            PCNs claim "no change" but PartPilot verifies it. It parses supplier change notices, classifies them against J-STD-046 and IPC-1752, and cross-checks the change against your component's real parametric envelope, not just the datasheet headline.
          </p>
        </div>
      </div>
    </section>
  );
};
