import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { Container } from '@/components/shared/Container'
import { sectionFade } from '@/lib/landingAnimations'

export function SectionWrapper({ 
  children, 
  theme = 'movie',
  className,
  id,
  withGlow = true,
  ...props 
}) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })

  const glowOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.2, 0.6, 0.2])
  const glowScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1.2, 0.8])

  const glowColors = {
    movie: 'rgba(59,130,246,0.15)',
    music: 'rgba(16,185,129,0.15)',
    friends: 'rgba(245,158,11,0.15)',
    default: 'rgba(255,255,255,0.05)'
  }

  return (
    <section
      ref={ref}
      id={id}
      className={cn(
        'relative py-24 md:py-32 overflow-hidden',
        className
      )}
      {...props}
    >
      {/* Parallax Glow Background */}
      {withGlow && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${glowColors[theme]} 0%, transparent 70%)`,
            opacity: glowOpacity,
            scale: glowScale,
          }}
        />
      )}

      {/* Subtle Noise Texture */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E")`,
          mixBlendMode: 'overlay'
        }}
      />

      <Container>
        <motion.div
          variants={sectionFade}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          {children}
        </motion.div>
      </Container>
    </section>
  )
}