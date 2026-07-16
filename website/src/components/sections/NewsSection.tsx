import React from 'react';
import './sections.css';

const newsItems = [
  "Why REACH Annex XVII Is Creating New Material Compliance Risks",
  "Everything Businesses Need to Know About the China RoHS Update",
  "How EU Regulations Are Changing 3TG Conflict Minerals Compliance",
  "The Top 7 Supply Chain Visibility Software Tools",
  "The Fastest Way to Get ISO 13485 Certification",
  "What All the Best Supplier Scorecards Have in Common"
];

export const NewsSection: React.FC = () => {
  return (
    <section id="resources" className="section">
      <div className="container">
        <div className="flex justify-between items-center" style={{marginBottom: '2rem'}}>
          <h2 className="section-title" style={{marginBottom: 0}}>What's new at PartPilot</h2>
          <a href="#blog" className="text-primary font-semibold">Get more insights &rarr;</a>
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
