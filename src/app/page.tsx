import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import ViralGallery from "@/components/landing/ViralGallery";
import GuidedTour from "@/components/landing/GuidedTour";
import RealAccounts from "@/components/landing/RealAccounts";
import EarningsExamples from "@/components/landing/EarningsExamples";
import RpmExplainer from "@/components/landing/RpmExplainer";
import Comparison from "@/components/landing/Comparison";
import Testimonials from "@/components/landing/Testimonials";
import Faq from "@/components/landing/Faq";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="flex-1">
        <Hero />
        <ViralGallery />
        <GuidedTour />
        <RealAccounts />
        <EarningsExamples />
        <RpmExplainer />
        <Comparison />
        <Testimonials />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
