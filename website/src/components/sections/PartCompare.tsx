import React from 'react';
import './sections.css';

const comparisonDimensions = [
  { dimension: 'Thermal', candidate: 'Match', detail: 'RθJA + operating range' },
  { dimension: 'Electrical', candidate: 'Match', detail: 'Voltage, current + timing' },
  { dimension: 'Mechanical', candidate: 'Review', detail: 'Pin 7 requires remap' },
  { dimension: 'Environmental', candidate: 'Match', detail: 'RoHS, REACH + AEC-Q100' }
];

export const PartCompare: React.FC = () => {
  return (
    <section className="section" id="part-compare">
      <div className="container reverse-split-container">
        <div className="agentic-visual">
          <div className="mockup-card compare-card hover-lift">
            <div className="mockup-header compare-heading">
              <span>Compatibility comparison</span>
              <span className="compare-score">92% fit</span>
            </div>
            <div className="compare-parts">
              <div><span>Current</span><strong>STM32F050K4</strong></div>
              <span className="compare-arrow" aria-hidden="true">→</span>
              <div><span>Candidate</span><strong>STM32G030K6</strong></div>
            </div>
            <div className="compare-list" aria-label="Compatibility by dimension">
              {comparisonDimensions.map((item) => (
                <div className="compare-row" key={item.dimension}>
                  <div>
                    <strong>{item.dimension}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <b className={item.candidate === 'Review' ? 'compare-review' : 'compare-match'}>
                    {item.candidate}
                  </b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="agentic-content">
          <div className="section-label">Multidimensional part compare</div>
          <h2 className="section-title">Find compatible parts across every engineering constraint</h2>
          <p className="agentic-text compact-section-text">
            Compare candidates across thermal, electrical, mechanical, and environmental dimensions—not just a generic cross-reference. PartPilot surfaces exact matches, acceptable trade-offs, and design changes so engineering and sourcing can choose a truly compatible alternative.
          </p>
        </div>
      </div>
    </section>
  );
};
