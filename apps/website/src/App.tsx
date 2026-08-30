import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { HeroSection } from "./components/sections/HeroSection";
import { SmartPcnAnalyser } from "./components/sections/SmartPcnAnalyser";
import { SourceIntelligence } from "./components/sections/SourceIntelligence";
import { CommunityInsights } from "./components/sections/CommunityInsights";
import { ManufacturerLiveScoring } from "./components/sections/ManufacturerLiveScoring";
import { PartCompare } from "./components/sections/PartCompare";
import { ProductsGrid } from "./components/sections/ProductsGrid";

function App() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <SourceIntelligence />
        <CommunityInsights />
        <ManufacturerLiveScoring />
        <PartCompare />
        <SmartPcnAnalyser />
        <ProductsGrid />
      </main>
      <Footer />
    </>
  );
}

export default App;
