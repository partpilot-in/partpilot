import React from 'react';
import './sections.css';

const tags = [
  "Supply Chain Risk", "Obsolescence", "Lifecycle", "Compliance", 
  "Supply Chain Impact", "Sub-Tier Intel", "PCN Alerts", "Supplier Insights", 
  "Component Risk", "RoHS Compliance", "REACH Compliance", "UFLPA Compliance", 
  "Parts Database", "Conflict Minerals", "PFAS Compliance", "Forced Labor", 
  "ESG", "Sustainability", "Prop 65", "Trade Compliance", "Product Compliance", 
  "BOM Risk", "Cross-Reference", "Multi-Sourcing", "Dual Sourcing", 
  "Lifecycle Status", "EOL Forecasting", "Lead Times", "Pricing Intel", 
  "BOM Analysis", "Event Monitoring", "Disruption Alerts"
];

export const PlatformOverview: React.FC = () => {
  return (
    <section className="section section-alt text-center">
      <div className="container">
        <div className="section-header-center" style={{maxWidth: '800px'}}>
          <h2 className="section-title">Everything your teams are on the hook for. One platform.</h2>
          <p className="hero-subtitle" style={{marginBottom: 0}}>
            Most supply chain teams pay for three separate tools, then manually reconcile data between them. PartPilot connects component intelligence, supply chain risk, and compliance on a single data layer, so your teams work from the same source of truth.
          </p>
        </div>
        
        <div className="tags-cloud">
          {tags.map((tag, i) => (
            <div key={i} className="tag">{tag}</div>
          ))}
        </div>
      </div>
    </section>
  );
};
