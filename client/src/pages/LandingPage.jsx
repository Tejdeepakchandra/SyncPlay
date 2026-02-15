import { HeroSection } from '@/components/landing/HeroSection'
import { WhySection } from '@/components/landing/WhySection'
import { MovieShowcase } from '@/components/landing/MovieShowcase'
import { MusicShowcase } from '@/components/landing/MusicShowcase'
import { StatsSection } from '@/components/landing/StatsSection'
import { CTASection } from '@/components/landing/CTASection'

export function LandingPage() {
  return (
    <div className="w-full">
      <HeroSection />
      <WhySection />
      <MovieShowcase />
      <MusicShowcase />
      <StatsSection />
      <CTASection />
    </div>
  )
}