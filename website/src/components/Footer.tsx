import React from 'react';
import './Footer.css';
import { Cpu } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top-row">
          <h2 className="footer-headline">Find the supply chain risk before it finds you.</h2>
          <a href="https://calendly.com" className="footer-cta" target="_blank" rel="noopener noreferrer">Book My Demo &rarr;</a>
        </div>

        <div className="footer-links-grid">
          <div className="footer-column">
            <h4>FEATURES</h4>
            <a href="#">Supply Chain Watch</a>
            <a href="#">Compliance Manager</a>
            <a href="#">Part Risk Manager</a>
            <a href="#">Supplier Insights</a>
            <a href="#">AI for Supply Chain</a>
          </div>
          <div className="footer-column">
            <h4>SOLUTIONS</h4>
            <a href="#">Supply Chain Risk Management</a>
            <a href="#">Compliance & Sustainability</a>
            <a href="#">Electronics Supply Chain</a>
          </div>
          <div className="footer-column">
            <h4>FOR INDUSTRY</h4>
            <a href="#">Consumer Electronics</a>
            <a href="#">Aerospace & Defense</a>
            <a href="#">Medical Devices</a>
            <a href="#">Automotive</a>
            <a href="#">Telecommunications</a>
            <a href="#">Industrial</a>
            <a href="#">Robotics</a>
          </div>
          <div className="footer-column">
            <h4>RESOURCES</h4>
            <a href="#">Blog</a>
            <a href="#">Newsletter</a>
            <a href="#">Case Studies</a>
            <a href="#">Guides</a>
          </div>
          <div className="footer-column">
            <h4>COMPANY</h4>
            <a href="#">About Us</a>
            <a href="#">Contact Us</a>
            <a href="#">Our Data</a>
            <a href="#">Brand Assets</a>
            <a href="https://www.linkedin.com/company/bestpartpilot/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-logo">
            <img src="/logo.png" alt="PartPilot Logo" style={{height: '20px', width: 'auto', filter: 'grayscale(100%) opacity(70%)'}} />
            <span>PartPilot</span>
          </div>
          <p>&copy; {new Date().getFullYear()} PartPilot. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
