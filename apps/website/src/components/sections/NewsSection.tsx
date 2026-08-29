import React from 'react';
import './sections.css';

const newsItems = [
  "How REACH Annex XVII Is Reshaping Material Compliance Risk",
  "What Manufacturers Should Track in the Latest China RoHS Changes",
  "How EU Rules Are Reframing 3TG Conflict Minerals Programs",
  "Seven Supply Chain Visibility Platforms Worth Comparing",
  "A Practical Path to ISO 13485 Readiness",
  "The Data Signals Strong Supplier Scorecards Have in Common"
];

export const NewsSection: React.FC = () => {
  return (
    <section id="resources" className="section">
      <div className="container">
        <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>Latest from PartPilot</h2>
          <a href="#blog" className="text-primary font-semibold">Read more research &rarr;</a>
        </div>

        <div className="news-grid">
          {newsItems.map((news, i) => (
            <a href="#" key={i} className="news-item hover-lift">
              {news}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};
