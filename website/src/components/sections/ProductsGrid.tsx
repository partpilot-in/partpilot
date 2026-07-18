import React from 'react';
import './sections.css';

const capabilities = [
  {
    title: "Supply Chain Visibility",
    desc: "Trace each BOM to production sites across four supplier tiers. Receive earlier disruption signals filtered to the events that materially affect your approved parts."
  },
  {
    title: "Compliance Management",
    desc: "Start with broad compliance coverage and assess every BOM against 270+ global regulations, including RoHS, REACH, PFAS, and TSCA, with audit-ready reports available on demand."
  },
  {
    title: "Part Risk Management",
    desc: "Evaluate every component across six risk dimensions, forecast end-of-life risk up to 36 months ahead, and identify compliant alternates in hours instead of days."
  },
  {
    title: "Supplier Insights",
    desc: "Review more than 1M suppliers scored across 12 risk categories, from financial health and geopolitical risk to sanctions screening and ESG, before supplier issues escalate."
  }
];

export const ProductsGrid: React.FC = () => {
  return (
    <section id="capabilities" className="section">
      <div className="container">
        <div className="section-header-center">
          <h2 className="section-title">One connected platform for the work that matters.</h2>
        </div>

        <div className="products-grid">
          {capabilities.map((p, i) => (
            <div key={i} className="product-card hover-lift">
              <h3 className="product-title">{p.title}</h3>
              <p className="product-desc">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
