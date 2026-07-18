import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HeroSection } from './components/sections/HeroSection';
import { SourceIntelligence } from './components/sections/SourceIntelligence';
import { PartRiskManager } from './components/sections/PartRiskManager';
import { PlatformOverview } from './components/sections/PlatformOverview';
import { ProductsGrid } from './components/sections/ProductsGrid';

function App() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <SourceIntelligence />
        <PartRiskManager />
        <PlatformOverview />
        <ProductsGrid />
      </main>
      <Footer />
    </>
  );
}

export default App;
