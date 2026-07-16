import React from 'react';
import { BomScanner } from '../BomScanner';
import './sections.css';

export const HeroSection: React.FC = () => {
  return (
    <section className="hero">
      <div className="container hero-grid animate-fade-in">
        <div className="hero-content">
          <h1 className="hero-title">
            Know before your supply chain breaks.
          </h1>
          <p className="hero-subtitle">
            Build resilience for engineering, sourcing, compliance, and supply chain teams on one platform.
          </p>
          <div className="hero-actions">
            <a href="https://calendly.com" className="btn btn-primary btn-lg" target="_blank" rel="noopener noreferrer">
              Book My Demo
            </a>
          </div>
        </div>

        <div className="hero-visual">
          <BomScanner />
        </div>
      </div>
    </section>
  );
};
