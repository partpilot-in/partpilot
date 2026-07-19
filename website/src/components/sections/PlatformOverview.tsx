import React from 'react';
import './sections.css';

const tags = [
  "Component Risk", "Lifecycle Data", "Obsolescence Signals", "PCN Notices",
  "EOL Outlooks", "Lead-Time Signals", "BOM Review", "Parts Reference Data",
  "Cross-Reference Data", "Multi-Source Options", "Dual-Source Coverage",
  "RoHS Status", "REACH Status", "PFAS Status", "Product Compliance",
  "Pricing Benchmarks"
];

export const PlatformOverview: React.FC = () => {
  return (
    <section className="section text-center">
      <div className="container">
        <div className="section-header-center" style={{ maxWidth: '800px' }}>
          <h2 className="section-title">Everything your teams have to answer for, in one place.</h2>
          <p className="overview-subtitle">
            Many supply chain teams rely on separate tools and then reconcile conflicting records by hand. PartPilot unifies component intelligence, supply chain risk, and compliance evidence on a shared data layer built from credible source data.
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
