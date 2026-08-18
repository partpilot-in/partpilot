import React from 'react';
import { Button } from '../Button';
import './sections.css';

export const SourceIntelligence: React.FC = () => {
  return (
    <section className="section section-alt">
      <div className="container agentic-container">
        <div className="agentic-content">
          <div className="section-label">PartPilot Source Intelligence</div>
          <h2 className="section-title">Credible source data for supply chain decisions</h2>
          <p className="agentic-text source-intelligence-text">
            PartPilot monitors supply chain risk, compliance campaigns, and engineering workflows with insights grounded in trusted market, regulatory, supplier, and component data. Teams can investigate issues in plain language, connect their existing systems, and act on findings backed by credible sources.
          </p>
        </div>

        <div className="agentic-visual">
          <div className="mockup-card hover-lift">
            <div className="mockup-header">Disruption Response Brief</div>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>Suez Canal Blocked</p>
            <div className="mockup-row">
              <span>14 products affected</span>
              <span className="text-primary">27 BOMs impacted</span>
            </div>
            <div className="flex gap-sm" style={{ marginTop: '1rem' }}>
              <Button variant="primary" size="sm">Estimate Revenue Risk</Button>
              <Button variant="outline" size="sm">Review Source Evidence</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
