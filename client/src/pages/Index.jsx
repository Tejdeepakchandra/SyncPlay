import { useEffect } from "react";

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
    <>
      <HeroSection />
      <FeaturesSection />
      <MoviePreview />
      <MusicPreview />
      <SocialProof />
      <FinalCTA />
      <Footer />
    </>
  );
};

export default Index;