import React from "react";
import { AnimatedCard } from "../AnimatedCard";
import "./sections.css";

export const PartCompare: React.FC = () => (
  <section className="section" id="part-compare">
    <div className="container reverse-split-container">
      <div className="agentic-visual">
        <AnimatedCard className="mockup-card compare-card">
          <div className="mockup-header">Example candidate comparison</div>
          <p className="example-note">App data · For illustration</p>
          <div className="comparison-table-wrap">
            <table className="example-comparison">
              <thead>
                <tr>
                  <th scope="col">Spec</th>
                  <th scope="col">RC0805FR-07100KL</th>
                  <th scope="col">CRGSP0603F100K</th>
                </tr>
              </thead>
              <tbody>
                <tr className="illustration-row">
                  <th scope="row">Resistance</th>
                  <td data-stream-value>100 kΩ</td>
                  <td data-stream-value>100 kΩ</td>
                </tr>
                <tr
                  className="illustration-row"
                  style={{ "--row-index": 1 } as React.CSSProperties}
                >
                  <th scope="row">Package</th>
                  <td data-stream-value>0805</td>
                  <td className="spec-difference" data-stream-value>
                    0603
                  </td>
                </tr>
                <tr
                  className="illustration-row"
                  style={{ "--row-index": 2 } as React.CSSProperties}
                >
                  <th scope="row">Power</th>
                  <td data-stream-value>0.125 W</td>
                  <td className="spec-difference" data-stream-value>
                    0.2 W
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="comparison-review">
            Different package · Engineering review needed
          </p>
          <p className="example-source">
            Source: PartPilot app component records
          </p>
        </AnimatedCard>
      </div>

      <div className="agentic-content">
        <div className="section-label">Part comparison</div>
        <h2 className="section-title">Compare replacement candidates</h2>
        <p className="agentic-text compact-section-text">
          Compare available specifications side by side. See differences and
          missing information that need engineering review before choosing a
          replacement.
        </p>
      </div>
    </div>
  </section>
);
