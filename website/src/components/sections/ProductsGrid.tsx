import React from 'react';
import './sections.css';

const capabilities = [
  {
    title: "Smart PCN Analyser",
    desc: "Parse PCNs, flag hidden material changes, and highlight affected properties."
  },
  {
    title: "Supply Chain Visibility",
    desc: "Trace BOM exposure and filter disruption signals to approved parts."
  },
  {
    title: "Compliance Management",
    desc: "Assess BOMs against RoHS, REACH, PFAS, TSCA, and audit evidence."
  },
  {
    title: "Part Risk Management",
    desc: "Score lifecycle risk, forecast EOL exposure, and find compliant alternates."
  },
  {
    title: "Supplier Insights",
    desc: "Review supplier risk across financial, geopolitical, sanctions, and ESG signals."
  }
];

export const ProductsGrid: React.FC = () => {
  return (
    <section id="capabilities" className="section section-alt">
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
