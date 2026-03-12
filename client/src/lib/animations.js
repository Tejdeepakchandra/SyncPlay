/**
 * Re-exports from landingAnimations + additional variants
 * used by components that import from "@/lib/animations".
 */

export {
  pageVariants,
  buttonHover,
  musicButtonHover,
  cardHover,
  musicCardHover,
  waveformVariants,
} from "./landingAnimations";

// 🎭 Theatre Mode variants (used by TheatreMode.jsx)
export const theatreVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
};
