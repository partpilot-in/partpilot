import React from 'react';
import { McuIllustration } from '../Illustrations';
import './sections.css';

export const PartRiskManager: React.FC = () => {
  return (
    <section className="section section-alt">
      <div className="container risk-manager-container">

        <div className="agentic-visual">
          <div className="mockup-card hover-lift">
            <div className="mockup-header" style={{ color: 'var(--primary)' }}>Lifecycle Risk Detected</div>
            <div className="flex items-center gap-md" style={{ marginBottom: '1rem' }}>
              <McuIllustration width={40} height={40} />
              <div>
                <strong>STM32F050K4</strong>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>STMicroelectronics &middot; Active &middot; 12-week lead time</div>
              </div>
            </div>
            <div className="mockup-row">
              <span>Risk score</span>
              <span className="text-primary font-bold">9 / 10</span>
            </div>
            <a href="#alternates" className="text-primary font-medium" style={{ display: 'inline-block', marginTop: '0.5rem' }}>See 9 validated substitutes &rarr;</a>
          </div>
        </div>

        <div className="agentic-content">
          <div className="section-label">Part Risk Manager</div>
          <h2 className="section-title">Select the best-fit component with confidence</h2>
          <p className="agentic-text risk-manager-text">
            PartPilot brings lifecycle risk, compliance status, country-of-origin dependencies, and cross-reference paths into the component selection workflow, helping teams spot issues before they delay launch plans or trigger redesign work.
          </p>
        </div>

      </div>
    </section>
  );
};
