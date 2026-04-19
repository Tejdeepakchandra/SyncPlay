import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const buildParticles = (theme) => {
  const base = theme === "music"
    ? [
        { color: "hsl(var(--secondary) / 0.32)", size: 86, left: "8%", top: "18%", dx: 16, dy: -24, duration: 7.6 },
        { color: "hsl(var(--accent) / 0.24)", size: 74, left: "24%", top: "66%", dx: -12, dy: -20, duration: 8.8 },
        { color: "hsl(var(--primary) / 0.18)", size: 64, left: "76%", top: "12%", dx: -14, dy: 16, duration: 9.4 },
        { color: "hsl(var(--secondary) / 0.22)", size: 96, left: "84%", top: "54%", dx: 10, dy: -16, duration: 10.1 },
      ]
    : [
        { color: "hsl(var(--primary) / 0.32)", size: 86, left: "8%", top: "18%", dx: 16, dy: -24, duration: 7.6 },
        { color: "hsl(var(--accent) / 0.24)", size: 74, left: "24%", top: "66%", dx: -12, dy: -20, duration: 8.8 },
        { color: "hsl(var(--secondary) / 0.18)", size: 64, left: "76%", top: "12%", dx: -14, dy: 16, duration: 9.4 },
        { color: "hsl(var(--primary) / 0.22)", size: 96, left: "84%", top: "54%", dx: 10, dy: -16, duration: 10.1 },
      ];

  return [...base, ...base.map((item, idx) => ({ ...item, left: `${(Number.parseFloat(item.left) + 12 + idx * 3) % 100}%`, top: `${(Number.parseFloat(item.top) + 28 + idx * 6) % 100}%`, size: Math.max(44, item.size - 16), duration: item.duration + 1.3 }))];
};

export default function ThemeParticleBackground({ theme = "movie" }) {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const particles = useMemo(() => buildParticles(theme), [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e) => setReducedMotion(e.matches);

    setReducedMotion(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {particles.map((particle, idx) => {
        const style = {
          left: particle.left,
          top: particle.top,
          width: particle.size,
          height: particle.size,
          background: particle.color,
        };

        if (reducedMotion) {
          return (
            <span
              key={`particle-static-${idx}`}
              className="absolute rounded-full blur-2xl opacity-70"
              style={style}
            />
          );
        }

        return (
          <motion.span
            key={`particle-${idx}`}
            className="absolute rounded-full blur-2xl opacity-75"
            style={style}
            animate={{
              x: [0, particle.dx, 0],
              y: [0, particle.dy, 0],
              scale: [1, 1.12, 1],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}
