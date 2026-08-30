import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import StylesCarousel from "@/components/landing/StylesCarousel";
import VideoStyles from "@/components/landing/VideoStyles";
import Benefits from "@/components/landing/Benefits";
import EarningsExamples from "@/components/landing/EarningsExamples";
import RpmExplainer from "@/components/landing/RpmExplainer";
import GrowthExample from "@/components/landing/GrowthExample";
import HowItWorks from "@/components/landing/HowItWorks";
import Faq from "@/components/landing/Faq";
import FinalCta from "@/components/landing/FinalCta";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="flex-1">
        <Hero />
        <StylesCarousel />
        <VideoStyles />
        <Benefits />
        <EarningsExamples />
        <RpmExplainer />
        <GrowthExample />
        <HowItWorks />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
