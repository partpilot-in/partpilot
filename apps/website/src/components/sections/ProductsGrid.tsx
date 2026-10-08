import React from "react";
import "./sections.css";

const capabilities = [
  {
    title: "BOM review",
    desc: "Review component information and identify parts that need attention.",
  },
  {
    title: "Component lookup",
    desc: "Find available lifecycle and sourcing information for a part.",
  },
  {
    title: "Part comparison",
    desc: "Compare candidate specifications and identify differences.",
  },
  {
    title: "Source evidence",
    desc: "Follow findings to their sources and see what remains unknown.",
  },
];

export const ProductsGrid: React.FC = () => (
  <section id="capabilities" className="section">
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
