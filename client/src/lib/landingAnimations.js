// 🎯 Premium Easing — Silky smooth
export const easing = [0.16, 1, 0.3, 1] // Custom cubic-bezier
export const softEasing = [0.4, 0, 0.2, 1]

// 🎭 Section Entrance
export const sectionFade = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.8, ease: easing }
  }
}

// 👈 Left Reveal with Parallax
export const leftReveal = {
  hidden: { 
    opacity: 0, 
    x: -100,
    rotateY: 5,
    scale: 0.98
  },
  show: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    scale: 1,
    transition: { 
      duration: 0.9, 
      ease: easing,
      staggerChildren: 0.1
    }
  }
}

// 👉 Right Reveal with Parallax
export const rightReveal = {
  hidden: { 
    opacity: 0, 
    x: 100,
    rotateY: -5,
    scale: 0.98
  },
  show: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    scale: 1,
    transition: { 
      duration: 0.9, 
      ease: easing 
    }
  }
}

// 📦 Stagger Container for Cards
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
      ease: easing
    }
  }
}

// 🃏 Card Item Animation
export const cardItem = {
  hidden: { 
    opacity: 0, 
    y: 60,
    scale: 0.9
  },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { 
      duration: 0.7, 
      ease: easing 
    }
  }
}

// 🔥 Scale Reveal for CTAs
export const scaleReveal = {
  hidden: { 
    opacity: 0, 
    scale: 0.92,
    filter: "blur(10px)"
  },
  show: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { 
      duration: 0.8, 
      ease: easing 
    }
  }
}

// ⚡ Magnetic Button Effect (for hover)
export const magneticHover = {
  scale: 1.05,
  transition: { duration: 0.2, ease: "easeOut" }
}

// 📝 Word Reveal for Hero
export const wordReveal = {
  hidden: { 
    opacity: 0, 
    y: 100,
    rotateX: -30
  },
  show: (i) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.6,
      ease: easing
    }
  })
}

// 🎯 Counter Animation
export const counterAnimation = {
  hidden: { opacity: 0, scale: 0.5 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: easing }
  }
}

// 🌀 Floating Emoji
export const floatEmoji = {
  initial: { y: 0 },
  animate: {
    y: [-10, 10, -10],
    rotate: [-2, 2, -2],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
}