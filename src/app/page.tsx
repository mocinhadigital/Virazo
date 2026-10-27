import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import VslSection from "@/components/landing/VslSection";
import ViralGallery from "@/components/landing/ViralGallery";
import RealAccounts from "@/components/landing/RealAccounts";
import EarningsExamples from "@/components/landing/EarningsExamples";
import RpmExplainer from "@/components/landing/RpmExplainer";
import Comparison from "@/components/landing/Comparison";
import Testimonials from "@/components/landing/Testimonials";
import Faq from "@/components/landing/Faq";
import Footer from "@/components/landing/Footer";
import VisitTracker from "@/components/analytics/VisitTracker";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      {/* Não renderiza nada: conta 1 visita por pessoa por dia (page_visits). */}
      <VisitTracker />
      <Header />
      <main className="flex-1">
        <Hero />
        <VslSection />
        <ViralGallery />
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
