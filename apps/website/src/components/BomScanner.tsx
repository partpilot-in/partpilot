import React from "react";
import { AnimatedCard } from "./AnimatedCard";
import "./BomScanner.css";

// Static examples supplied from the app, not live prices or assessments.
const bomData = [
  { mpn: "RC0805FR-07100KL", qty: 1, price: "₹1.40" },
  { mpn: "RC0805FR-0710RL", qty: 2, price: "₹3.3986" },
  { mpn: "RC0805FR-0714KL", qty: 1, price: "₹1.1007" },
  { mpn: "RC0805FR-0715KL", qty: 1, price: "₹1.1876" },
];

export const BomScanner: React.FC = () => (
  <AnimatedCard className="bom-scanner-wrapper">
    <div className="bom-scanner-window">
      <div className="bom-header">
        <span>Example BOM review</span>
        <span className="bom-example-label">App data · For illustration</span>
      </div>
      <div className="bom-table-container">
        <table className="bom-table">
          <thead>
            <tr>
              <th>MPN</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Lifecycle</th>
            </tr>
          </thead>
          <tbody>
            {bomData.map((row, index) => (
              <tr
                key={row.mpn}
                className="bom-row illustration-row"
                style={{ "--row-index": index } as React.CSSProperties}
              >
                <td>{row.mpn}</td>
                <td>{row.qty}</td>
                <td data-stream-value>{row.price}</td>
                <td>
                  <span className="lifecycle-badge" data-stream-value>
                    Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </AnimatedCard>
);
