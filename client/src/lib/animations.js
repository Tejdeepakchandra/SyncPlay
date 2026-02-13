// 🎬 CINEMATIC EASING — Use everywhere
export const easing = [0.4, 0, 0.2, 1]

// ⏱️ DURATION SYSTEM
export const duration = {
  hover: 0.25,
  modal: 0.3,
  page: 0.4,
  theatre: 0.45,
}

// 🎭 PAGE TRANSITIONS
export const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.page,
      ease: easing,
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: duration.page * 0.75,
      ease: easing,
    },
  },
}

// 🎬 THEATRE MODE
export const theatreVariants = {
  initial: {
    scale: 0.97,
    filter: 'brightness(1) blur(0px)',
    opacity: 0,
  },
  animate: {
    scale: 1,
    filter: 'brightness(0.9) blur(0.5px)',
    opacity: 1,
    transition: {
      duration: duration.theatre,
      ease: easing,
    },
  },
  exit: {
    scale: 0.97,
    filter: 'brightness(1) blur(0px)',
    opacity: 0,
    transition: {
      duration: duration.theatre * 0.8,
      ease: easing,
    },
  },
}

// 🃏 CARD HOVER — 3D Lift + Rotate
export const cardHover = {
  whileHover: {
    y: -4,
    rotate: 0.5,
    scale: 1.02,
    boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.3)',
    borderColor: 'rgba(59,130,246,0.3)',
    transition: {
      duration: duration.hover,
      ease: easing,
    },
  },
}

// 🎵 MUSIC CARD HOVER (Green)
export const musicCardHover = {
  whileHover: {
    y: -4,
    rotate: 0.5,
    scale: 1.02,
    boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,197,94,0.3)',
    borderColor: 'rgba(34,197,94,0.3)',
    transition: {
      duration: duration.hover,
      ease: easing,
    },
  },
}

// 🎬 BUTTON HOVER
export const buttonHover = {
  whileHover: {
    scale: 1.03,
    boxShadow: '0 0 30px rgba(59,130,246,0.35), 0 8px 30px rgba(0,0,0,0.5)',
    transition: {
      duration: duration.hover,
      ease: easing,
    },
  },
  whileTap: {
    scale: 0.98,
    transition: {
      duration: 0.1,
    },
  },
}

// 🎵 MUSIC BUTTON HOVER
export const musicButtonHover = {
  whileHover: {
    scale: 1.03,
    boxShadow: '0 0 30px rgba(34,197,94,0.35), 0 8px 30px rgba(0,0,0,0.5)',
    transition: {
      duration: duration.hover,
      ease: easing,
    },
  },
  whileTap: {
    scale: 0.98,
    transition: {
      duration: 0.1,
    },
  },
}

// 🎬 FADE IN
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: {
      duration: duration.modal,
      ease: easing,
    },
  },
  exit: { 
    opacity: 0,
    transition: {
      duration: duration.modal * 0.5,
      ease: easing,
    },
  },
}

// 🎬 SLIDE UP
export const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: duration.modal,
      ease: easing,
    },
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: {
      duration: duration.modal * 0.5,
      ease: easing,
    },
  },
}

// 🎬 SLIDE LEFT
export const slideLeft = {
  initial: { opacity: 0, x: 20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: duration.modal,
      ease: easing,
    },
  },
  exit: { 
    opacity: 0, 
    x: -20,
    transition: {
      duration: duration.modal * 0.5,
      ease: easing,
    },
  },
}

// 🎬 SLIDE RIGHT
export const slideRight = {
  initial: { opacity: 0, x: -20 },
  animate: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: duration.modal,
      ease: easing,
    },
  },
  exit: { 
    opacity: 0, 
    x: 20,
    transition: {
      duration: duration.modal * 0.5,
      ease: easing,
    },
  },
}

// 🎬 SCALE IN
export const scaleIn = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: duration.modal,
      ease: easing,
    },
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: {
      duration: duration.modal * 0.5,
      ease: easing,
    },
  },
}

// 🎵 WAVEFORM ANIMATION
export const waveformVariants = {
  animate: (i) => ({
    scaleY: [0.5, 1.2, 0.5],
    opacity: [0.7, 1, 0.7],
    transition: {
      duration: 1.2,
      delay: i * 0.1,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  }),
}

// 🎬 FLOATING ELEMENTS
export const floatVariants = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

// 🎬 ROTATE SLOW
export const rotateVariants = {
  animate: {
    rotate: 360,
    transition: {
      duration: 20,
      repeat: Infinity,
      ease: 'linear',
    },
  },
}

// 🎬 STAGGER CHILDREN
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
}

// 👑 GOLD HIGHLIGHT PULSE
export const goldPulse = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(234,179,8,0)',
      '0 0 15px 3px rgba(234,179,8,0.3)',
      '0 0 0 0 rgba(234,179,8,0)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

// 🎤 SPEAKING INDICATOR
export const speakingPulse = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(59,130,246,0.4)',
      '0 0 15px 3px rgba(59,130,246,0.3)',
      '0 0 0 0 rgba(59,130,246,0.4)',
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}