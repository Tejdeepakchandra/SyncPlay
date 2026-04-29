import { motion } from 'framer-motion'
import { waveformVariants } from '@/lib/animations'

export function AnimatedWaveform({ color = 'music', barCount = 7 }) {
  
  const bars = Array.from({ length: barCount }, (_, i) => i)
  
  const barColor = color === 'music' 
    ? 'bg-music/50' 
    : 'bg-movie/50'
  
  return (
    <div className="flex items-end h-8 gap-[3px]">
      {bars.map((i) => (
        <motion.div
          key={i}
          className={`w-1 ${barColor} rounded-full`}
          style={{ 
            height: `${16 + (i % 4) * 8}px`,
            originY: 1,
          }}
          variants={waveformVariants}
          animate="animate"
          custom={i}
        />
      ))}
    </div>
  )
}