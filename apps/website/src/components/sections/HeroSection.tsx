import React from "react";
import "../Button.css";
import { BomScanner } from "../BomScanner";
import "./sections.css";

export const HeroSection: React.FC = () => {
  return (
    <section className="hero">
      <div className="container hero-grid animate-fade-in">
        <div className="hero-content">
          <h1 className="hero-title">
            Check your components{" "}
            <span className="hero-title-highlight">before you build.</span>
          </h1>
          <p className="hero-subtitle">
            PartPilot helps hardware engineers review availability, lifecycle
            status, and replacement options for the parts in their BOM.
          </p>
          <a
            href="https://app.bestpartpilot.com"
            className="btn btn-primary btn-lg"
            target="_blank"
            rel="noopener noreferrer"
          >
            Check your BOM
          </a>
        </div>

        <div className="hero-visual">
          <BomScanner />
        </div>
      </div>
    </section>
  );
};
