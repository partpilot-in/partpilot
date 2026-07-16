import React from 'react';
import { Button } from '../Button';
import './sections.css';

export const AgenticAI: React.FC = () => {
  return (
    <section className="section section-alt">
      <div className="container agentic-container">
        <div className="agentic-content">
          <div className="section-label">PartPilot Agentic AI</div>
          <h2 className="section-title">AI agents for your supply chain</h2>
          <p className="agentic-text">
            PartPilot puts AI Agents to track your supply chain risk, monitor compliance campaigns and boost productivity for engineering teams. Ask anything in plain language, connect PartPilot to your own AI stack, gain unique insights, and have AI agents take care of the tedious parts of the process.
          </p>
          <Button variant="outline">See AI in Action</Button>
        </div>
        
        <div className="agentic-visual">
          <div className="mockup-card hover-lift">
            <div className="mockup-header">Disruption Response Agent</div>
            <p className="text-muted" style={{marginBottom: '1rem'}}>Strait of Hormuz Blocked</p>
            <div className="mockup-row">
              <span>12 Products affected</span>
              <span className="text-primary">21 BOMs impacted</span>
            </div>
            <div className="flex gap-sm" style={{marginTop: '1rem'}}>
              <Button variant="primary" size="sm">Calculate Revenue Impact</Button>
              <Button variant="outline" size="sm">Start Supplier Outreach</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
