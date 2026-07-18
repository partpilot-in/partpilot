import React from 'react';
import { BomScanner } from '../BomScanner';
import './sections.css';

export const HeroSection: React.FC = () => {
  return (
    <section className="hero">
      <div className="container hero-grid animate-fade-in">
        <div className="hero-content">
          <h1 className="hero-title">
            See supply chain risks before they become <span className="hero-title-highlight">production issues</span>.
          </h1>
          <p className="hero-subtitle">
            Give engineering, sourcing, compliance, and supply chain teams a single platform for component intelligence and risk management.
          </p>
          <div className="hero-actions">
            <a href="https://calendly.com" className="btn btn-primary btn-md" target="_blank" rel="noopener noreferrer">
              Schedule Intro Call
            </a>
            <a href="https://docs.google.com/forms/u/0/" className="btn btn-outline btn-md" target="_blank" rel="noopener noreferrer">
              Sign Letter of Intent
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
