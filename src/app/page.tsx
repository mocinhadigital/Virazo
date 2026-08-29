import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import VideoStyles from "@/components/landing/VideoStyles";
import Benefits from "@/components/landing/Benefits";
import HowItWorks from "@/components/landing/HowItWorks";
import FinalCta from "@/components/landing/FinalCta";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="flex-1">
        <Hero />
        <VideoStyles />
        <Benefits />
        <HowItWorks />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
