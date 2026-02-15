
// 🎬 Cinematic Easing — Silky smooth
export const easing = [0.4, 0, 0.2, 1];

// ⏱️ Duration System
export const duration = {
  hover: 0.3,
  modal: 0.4,
  page: 0.5,
  section: 0.8,
};

// 🎭 Page Transitions
export const pageVariants = {
  initial: { 
    opacity: 0,
    y: 30,
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
    y: -30,
    transition: {
      duration: duration.page * 0.7,
      ease: easing,
    },
  },
};

// 🎬 Section Fade (Simple)
export const sectionFade = {
  hidden: { 
    opacity: 0,
    y: 40,
  },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.section,
      ease: easing,
    },
  },
};

// 👈 Left Reveal — ENTIRE CONTAINER moves
export const leftReveal = {
  hidden: { 
    opacity: 0,
    x: -100,
  },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      duration: duration.section,
      ease: easing,
    },
  },
};

// 👉 Right Reveal — ENTIRE CONTAINER moves
export const rightReveal = {
  hidden: { 
    opacity: 0,
    x: 100,
  },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      duration: duration.section,
      ease: easing,
    },
  },
};

// 📦 Stagger Container for children
export const staggerContainer = {
  hidden: { opacity: 1 },
  show: {
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3,
    },
  },
};

// 🃏 Card Item — Individual items stagger
export const cardItem = {
  hidden: { 
    opacity: 0,
    y: 40,
  },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: easing,
    },
  },
};

// 🎬 Bullet Point Item — THIS WAS MISSING
export const bulletItem = {
  hidden: { 
    opacity: 0,
    x: 30,
  },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.5,
      ease: easing,
    },
  },
};

// 🃏 Card Hover Effect
export const cardHover = {
  whileHover: {
    y: -8,
    scale: 1.02,
    boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.3)',
    transition: {
      duration: duration.hover,
      ease: easing,
    },
  },
};

// 🎵 Music Card Hover
export const musicCardHover = {
  whileHover: {
    y: -8,
    scale: 1.02,
    boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(34,197,94,0.3)',
    transition: {
      duration: duration.hover,
      ease: easing,
    },
  },
};

// 🎬 Button Hover
export const buttonHover = {
  whileHover: {
    scale: 1.05,
    boxShadow: '0 0 30px rgba(59,130,246,0.4)',
    transition: { duration: 0.2 },
  },
  whileTap: {
    scale: 0.98,
  },
};

// 🎵 Music Button Hover
export const musicButtonHover = {
  whileHover: {
    scale: 1.05,
    boxShadow: '0 0 30px rgba(34,197,94,0.4)',
    transition: { duration: 0.2 },
  },
  whileTap: {
    scale: 0.98,
  },
};

// 🌀 Floating Emoji (Simple)
export const floatEmoji = {
  animate: {
    y: [-8, 8, -8],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// 🎵 Waveform Animation
export const waveformVariants = {
  animate: (i) => ({
    scaleY: [0.5, 1.2, 0.5],
    backgroundColor: [
      "rgba(16,185,129,0.4)",
      "rgba(16,185,129,0.8)",
      "rgba(16,185,129,0.4)",
    ],
    transition: {
      duration: 1.2,
      delay: i * 0.05,
      repeat: Infinity,
      ease: "easeInOut",
    },
  }),
};

// 👑 Gold Pulse (for friends)
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
};

// 🎤 Speaking Pulse (for active speakers)
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
};