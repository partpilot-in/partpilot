import React from 'react';
import { BomScanner } from '../BomScanner';
import './sections.css';

export const HeroSection: React.FC = () => {
  return (
    <section className="hero">
      <div className="container hero-grid animate-fade-in">
        <div className="hero-content">
          <h1 className="hero-title">
            See supply chain risks before they become <span className="hero-title-highlight">production issues.</span>
          </h1>
          <p className="hero-subtitle">
            Give engineering, sourcing, compliance, and supply chain teams a single platform for component intelligence and risk management.
          </p>
        </div>

        <div className="hero-visual">
          <BomScanner />
        </div>
      </div>
    </section>
  );
};
