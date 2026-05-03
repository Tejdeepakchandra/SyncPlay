import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Users, Globe, Zap, Film, Radio } from "lucide-react";
import api from "@/services/api";

function Counter({ from = 0, to, duration = 2, suffix = "" }) {
  const [count, setCount] = useState(from);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView || to <= 0) return;

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
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Use the base URL directly to avoid auth interceptors
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${baseUrl}/stats`);
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        }
      } catch {
        // Silently fail — show 0s
      }
    };
    fetchStats();
  }, []);

  const displayStats = [
    {
      icon: Film,
      value: stats?.totalRooms || 0,
      label: "Rooms Created",
      color: "text-primary",
      bg: "bg-primary/10",
      suffix: "+",
    },
    {
      icon: Users,
      value: stats?.totalUsers || 0,
      label: "Users Joined",
      color: "text-secondary",
      bg: "bg-secondary/10",
      suffix: "+",
    },
    {
      icon: Radio,
      value: stats?.activeRooms || 0,
      label: "Active Now",
      color: "text-accent",
      bg: "bg-accent/10",
      suffix: "",
    },
    {
      icon: Zap,
      value: 50,
      label: "Sync Latency",
      color: "text-primary",
      bg: "bg-primary/10",
      suffix: "ms",
    },
  ];

  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="landing-panel p-8 lg:p-12 relative overflow-hidden"
        >
          {/* Background glow */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_50%,hsl(var(--primary)/0.06),transparent_50%),radial-gradient(circle_at_80%_50%,hsl(var(--secondary)/0.06),transparent_50%)]" />
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 lg:gap-8 text-center relative z-10">
            {displayStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                whileHover={{ scale: 1.05, y: -4 }}
                className="cursor-pointer group"
              >
                <div className={`w-12 h-12 rounded-2xl ${stat.bg} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
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
            className="text-center text-muted-foreground mt-8 text-sm relative z-10"
          >
            Real-time stats from the SyncPlay community
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}