import React from 'react';
import './sections.css';

const capabilities = [
  {
    title: "Supply Chain Visibility",
    desc: "Map your BOM to manufacturing sites across 4 tiers. Get 2-week earlier disruption alerts than competitors, filtered to events that actually affect your parts."
  },
  {
    title: "Compliance Management",
    desc: "Achieve 80%+ compliance coverage from day one. Assess every BOM against 270+ global regulations (RoHS, REACH, PFAS, TSCA, and more), with audit-ready reports on demand."
  },
  {
    title: "Part Risk Management",
    desc: "Score every component on 6 risk factors. Forecast EOL up to 36 months out. Find compliant alternates in hours, not days."
  },
  {
    title: "Supplier Insights",
    desc: "1M+ suppliers pre-scored across 12 risk categories: financial health, geopolitical exposure, sanctions screening, ESG, and more. Know your exposure before a supplier fails."
  }
];

export const ProductsGrid: React.FC = () => {
  return (
    <section id="capabilities" className="section">
      <div className="container">
        <div className="section-header-center">
          <h2 className="section-title">One powerful platform for everything.</h2>
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
