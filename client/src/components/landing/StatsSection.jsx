import { motion, useInView } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import { SectionWrapper } from './SectionWrapper'
import { counterAnimation } from '@/lib/landingAnimations'

function Counter({ from = 0, to, duration = 2 }) {
  const [count, setCount] = useState(from)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    if (!inView) return

    let startTime
    let animationFrame

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1)
      
      setCount(Math.floor(from + (to - from) * progress))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationFrame)
  }, [inView, from, to, duration])

  return <span ref={ref}>{count.toLocaleString()}</span>
}

const stats = [
  { value: 10000, label: 'Rooms Created', theme: 'movie' },
  { value: 1000000, label: 'Minutes Watched', theme: 'music' },
  { value: 4.9, label: 'User Rating', suffix: '★', theme: 'friends' }
]

export function StatsSection() {
  return (
    <SectionWrapper theme="default" className="bg-background-card">
      <div className="grid md:grid-cols-3 gap-8">
        {stats.map((stat, index) => (
          <motion.div
            key={index}
            variants={counterAnimation}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="text-center group"
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              className={`text-5xl md:text-6xl font-bold mb-2 text-${stat.theme} transition-all duration-300`}
            >
              <Counter from={0} to={stat.value} />
              {stat.suffix}
            </motion.div>
            <div className="text-text-secondary">{stat.label}</div>
            
            {/* Glow on hover */}
            <div className={`absolute inset-0 bg-${stat.theme}/5 blur-3xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  )
}