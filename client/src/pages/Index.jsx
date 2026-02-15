import { useEffect } from "react";

// Navigation components
import Navbar from "@/components/navigation/Navbar";
import MobileNav from "@/components/navigation/MobileNav";

// Landing page sections
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import MoviePreview from "@/components/landing/MoviePreview";
import MusicPreview from "@/components/landing/MusicPreview";
import SocialProof from "@/components/landing/SocialProof";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";

const Index = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <MoviePreview />
      <MusicPreview />
      <SocialProof />
      <FinalCTA />
      <Footer />
      <MobileNav />
    </div>
  );
};

export default Index;