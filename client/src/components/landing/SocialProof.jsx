import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Users, Globe, Zap } from "lucide-react";

const stats = [
  { icon: Users, value: 10000, label: "Rooms Created", color: "text-primary", suffix: "+" },
  { icon: Globe, value: 50, label: "Countries", color: "text-secondary", suffix: "+" },
  { icon: Zap, value: 50, label: "Sync Latency", unit: "ms", color: "text-accent", suffix: "ms" },
];

function Counter({ from = 0, to, duration = 2, suffix = "" }) {
  const [count, setCount] = useState(from);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView) return;

    let startTime;
    let animationFrame;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(from + (to - from) * easeOutQuart);
      
      setCount(current);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [inView, from, to, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

export default function SocialProof() {
  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="glass-panel p-8 lg:p-12"
        >
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                whileHover={{ scale: 1.05 }}
                className="cursor-pointer"
              >
                <stat.icon className={`w-6 h-6 mx-auto mb-3 ${stat.color}`} />
                <div className={`font-display text-3xl lg:text-4xl font-bold mb-1 ${stat.color}`}>
                  <Counter from={0} to={stat.value} suffix={stat.suffix || ""} />
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="text-center text-muted-foreground mt-8 text-sm"
          >
            Built for friends, not algorithms.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}