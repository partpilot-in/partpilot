import React from 'react';

import './sections.css';

export const HeroSection: React.FC = () => {
  return (
    <section className="hero">
      <div className="container animate-fade-in">
        <h1 className="hero-title">
          Know before your supply chain breaks.
        </h1>
        <p className="hero-subtitle">
          Build resilience for engineering, sourcing, compliance, and supply chain teams on one platform.
        </p>
        <div className="hero-actions">
          <a href="https://calendly.com" className="btn btn-primary btn-lg">
            See a Demo
          </a>
        </div>
      </div>
    </section>
  );
};
