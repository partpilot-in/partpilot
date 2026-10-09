import React from "react";
import "./sections.css";

const capabilities = [
  {
    title: "BOM review",
    desc: "Find components that need attention.",
  },
  {
    title: "Component lookup",
    desc: "Check lifecycle and sourcing information.",
  },
  {
    title: "Part comparison",
    desc: "Compare specifications and differences.",
  },
  {
    title: "Source evidence",
    desc: "See sources and missing information.",
  },
];

export const ProductsGrid: React.FC = () => (
  <section id="capabilities" className="section capabilities-section">
    <div className="container">
      <div className="section-header-center">
        <h2 className="section-title">Make better component decisions</h2>
      </div>
      <div className="products-grid">
        {capabilities.map((capability) => (
          <div key={capability.title} className="product-card">
            <h3 className="product-title">{capability.title}</h3>
            <p className="product-desc">{capability.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
