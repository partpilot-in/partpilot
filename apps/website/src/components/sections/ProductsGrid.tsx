import React, { useEffect, useState } from "react";
import "./sections.css";

const capabilities = [
  {
    title: "Smart PCN Analyser",
    desc: "Parse PCNs, flag hidden material changes, and highlight affected properties.",
  },
  {
    title: "Supply Chain Visibility",
    desc: "Trace BOM exposure and filter disruption signals to approved parts.",
  },
  {
    title: "Compliance Management",
    desc: "Assess BOMs against RoHS, REACH, PFAS, TSCA, and audit evidence.",
  },
  {
    title: "Multidimensional Part Compare",
    desc: "Compare thermal, electrical, mechanical, and environmental compatibility.",
  },
  {
    title: "Community Part Insights",
    desc: "Bring sourced field experience, independent testing, and engineering discussions into part decisions.",
  },
  {
    title: "Live Part Scoring",
    desc: "Refresh confidence scores daily as manufacturer notices and evidence change.",
  },
  {
    title: "Supplier Insights",
    desc: "Review supplier risk across financial, geopolitical, sanctions, and ESG signals.",
  },
];

export const ProductsGrid: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleCards, setVisibleCards] = useState(4);

  const lastIndex = Math.max(0, capabilities.length - visibleCards);

  useEffect(() => {
    const updateVisibleCards = () => {
      const nextVisibleCards = window.matchMedia("(min-width: 1024px)").matches
        ? 4
        : window.matchMedia("(min-width: 640px)").matches
          ? 2
          : 1;

      setVisibleCards(nextVisibleCards);
      setActiveIndex((current) =>
        Math.min(current, capabilities.length - nextVisibleCards),
      );
    };

    updateVisibleCards();
    window.addEventListener("resize", updateVisibleCards);
    return () => window.removeEventListener("resize", updateVisibleCards);
  }, []);

  useEffect(() => {
    if (
      lastIndex === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current >= lastIndex ? 0 : current + 1));
    }, 3500);

    return () => window.clearInterval(timer);
  }, [lastIndex]);

  const carouselOffset =
    activeIndex === 0
      ? "0px"
      : `calc(-${activeIndex * (100 / visibleCards)}% - ${activeIndex / visibleCards}rem)`;

  return (
    <section id="capabilities" className="section">
      <div className="container">
        <div className="section-header-center">
          <h2 className="section-title">
            One connected platform for the work that matters.
          </h2>
        </div>

        <div
          className="products-carousel"
          role="region"
          aria-label="Platform capabilities"
        >
          <div
            className="products-track"
            style={
              { "--carousel-offset": carouselOffset } as React.CSSProperties
            }
          >
            {capabilities.map((p, i) => (
              <div
                key={p.title}
                className="product-card hover-lift"
                aria-hidden={i < activeIndex || i >= activeIndex + visibleCards}
              >
                <h3 className="product-title">{p.title}</h3>
                <p className="product-desc">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="products-pagination"
          aria-label="Capability carousel pages"
        >
          {capabilities.map((capability, index) => {
            const isVisible =
              index >= activeIndex && index < activeIndex + visibleCards;

            return (
              <button
                key={capability.title}
                type="button"
                className={isVisible ? "is-visible" : ""}
                onClick={() => setActiveIndex(Math.min(index, lastIndex))}
                aria-label={`Show ${capability.title}`}
                aria-current={isVisible ? "true" : undefined}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
};
