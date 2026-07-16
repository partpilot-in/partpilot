import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HeroSection } from './components/sections/HeroSection';
import { AgenticAI } from './components/sections/AgenticAI';
import { PartRiskManager } from './components/sections/PartRiskManager';
import { PlatformOverview } from './components/sections/PlatformOverview';
import { ProductsGrid } from './components/sections/ProductsGrid';

function App() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <AgenticAI />
        <PartRiskManager />
        <PlatformOverview />
        <ProductsGrid />
      </main>
      <Footer />
    </>
  );
}

export default App;
