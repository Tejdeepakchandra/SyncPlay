import { motion } from "framer-motion";
import { UserX, RefreshCw, MessageCircle, Smartphone } from "lucide-react";
import { sectionFade, staggerContainer, cardItem, cardHover } from "@/lib/landingAnimations";

const features = [
  {
    icon: UserX,
    title: "No Login Required",
    description: "Jump into any room instantly. Just click a link and start watching or listening with friends.",
    color: "primary",
  },
  {
    icon: RefreshCw,
    title: "Perfect Sync",
    description: "Everyone sees the same frame at the same time. Play, pause, seek — all in perfect harmony.",
    color: "primary",
  },
  {
    icon: MessageCircle,
    title: "Chat, Voice & Reactions",
    description: "Text chat, voice calls, video, emoji reactions — make it feel like you're really together.",
    color: "secondary",
  },
  {
    icon: Smartphone,
    title: "Works on Mobile",
    description: "Full experience on any device. Swipe to chat, pinch to zoom, tap to react.",
    color: "secondary",
  },
];

const colorClasses = {
  primary: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-secondary/10 text-secondary border-secondary/20",
};

export default function FeaturesSection() {
  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-secondary/5" />

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        
        {/* Title fades up */}
        <motion.div
          variants={sectionFade}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
            Why <span className="text-gradient-movie">SyncPlay</span>?
          </h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Built for shared experiences, not algorithms.
          </p>
        </motion.div>

        {/* Cards with stagger */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              variants={cardItem}
              whileHover={cardHover.whileHover}
              className="glass-panel p-6 group cursor-pointer"
            >
              <motion.div
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
                className={`w-12 h-12 rounded-xl ${colorClasses[feature.color]} border flex items-center justify-center mb-4`}
              >
                <feature.icon className="w-6 h-6" />
              </motion.div>
              <h3 className="font-display font-semibold text-lg mb-2 text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}