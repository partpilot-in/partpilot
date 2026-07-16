import React from 'react';
import { McuIllustration } from '../Illustrations';
import './sections.css';

export const PartRiskManager: React.FC = () => {
  return (
    <section className="section">
      <div className="container risk-manager-container">
        
        <div className="agentic-visual">
          <div className="mockup-card hover-lift">
            <div className="mockup-header" style={{color: 'var(--primary)'}}>Lifecycle Risk Flagged</div>
            <div className="flex items-center gap-md" style={{marginBottom: '1rem'}}>
              <McuIllustration width={40} height={40} />
              <div>
                <strong>ATXMEGA128A4U</strong>
                <div className="text-muted" style={{fontSize: '0.75rem'}}>Microchip &middot; Mature &middot; 8-week lead time</div>
              </div>
            </div>
            <div className="mockup-row">
              <span>Risk score</span>
              <span className="text-primary font-bold">6.4 / 10</span>
            </div>
            <a href="#alternates" className="text-primary font-medium" style={{display: 'inline-block', marginTop: '0.5rem'}}>View 12 qualified alternates &rarr;</a>
          </div>
        </div>

        <div className="agentic-content">
          <div className="section-label">Part Risk Manager</div>
          <h2 className="section-title">Choose the right part, every time</h2>
          <p className="agentic-text">
            PartPilot surfaces lifecycle risk, compliance flags, COO dependencies, and cross-reference options at the moment of part selection, so you catch the problem before it delays a product launch or forces a redesign.
          </p>
          <a href="#learn-more" className="text-primary font-semibold">Learn more &rarr;</a>
          
          <div className="testimonial">
            <p className="font-medium">"PartPilot touches all aspects of the component, from design to manufacturing. Each department saves so much time using the platform."</p>
            <p className="text-muted" style={{marginTop: '0.5rem', fontSize: '0.875rem'}}>Adam Doolittle, Component Engineer</p>
          </div>
        </div>

      </div>
    </section>
  );
};
