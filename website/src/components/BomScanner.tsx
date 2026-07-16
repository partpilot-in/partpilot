import React, { useState, useEffect } from 'react';
import './BomScanner.css';

const bomData = [
  { mpn: 'RC0805FR-07100KL', qty: 1, price: '$0.02', score: 'Low Risk', color: 'green' },
  { mpn: '0805B103K160CT', qty: 3, price: '$0.06', score: 'Low Risk', color: 'green' },
  { mpn: 'ABS06-32.768KHZ', qty: 1, price: '$0.98', score: 'High Risk', color: 'red' },
  { mpn: 'BC547C', qty: 2, price: '$0.09', score: 'Medium', color: 'orange' },
  { mpn: 'LM358ADR', qty: 1, price: '$0.15', score: 'Low Risk', color: 'green' },
  { mpn: 'TLV1117-33IDCYR', qty: 1, price: '$0.37', score: 'High Risk', color: 'red' }
];

export const BomScanner: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex(prev => {
        // Stop for a moment at the end, then restart
        if (prev >= bomData.length) return -1;
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bom-scanner-wrapper">
      <div className="bom-scanner-window">
        <div className="bom-header">
          <span>Live BOM Analysis</span>
        </div>
        <div className="bom-table-container">
          <table className="bom-table">
            <thead>
              <tr>
                <th>MPN</th>
                <th>Qty</th>
                <th>
                  <span className="bom-label-full">Unit Price</span>
                  <span className="bom-label-short">Price</span>
                </th>
                <th>
                  <span className="bom-label-full">PartPilot Score</span>
                  <span className="bom-label-short">Score</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {bomData.map((row, i) => {
                const isScanned = i <= activeIndex;
                const isActive = i === activeIndex;
                return (
                  <tr key={i} className={`bom-row ${isActive ? 'active-row' : ''}`}>
                    <td>{row.mpn}</td>
                    <td>{row.qty}</td>
                    <td>{row.price}</td>
                    <td className="score-cell">
                      {isScanned ? (
                        <span className={`score-badge score-${row.color} animate-fade-in`}>
                          {row.score}
                        </span>
                      ) : (
                        <span className="score-pending">Pending...</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
