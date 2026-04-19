import { motion } from "framer-motion";
import { Film, Music } from "lucide-react";

export default function FinalCTA() {
  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      {/* Lightweight static glow backdrop */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_24%_20%,hsl(var(--primary)/0.12),transparent_42%),radial-gradient(circle_at_74%_72%,hsl(var(--secondary)/0.12),transparent_45%)]" />

      <div className="container mx-auto px-4 lg:px-8 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 leading-tight">
            Ready to Watch & Listen{" "}
            <span className="text-gradient-movie">Together</span>?
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-lg mx-auto">
            Create a room in seconds. No sign-up. No downloads. Just friends and great content.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-primary-foreground gradient-movie hover-glow-movie transition-all text-lg group"
            >
              <Film className="w-5 h-5 group-hover:animate-pulse" />
              Start Movie Room
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-secondary border-2 border-secondary/40 hover:bg-secondary/10 hover-glow-music transition-all text-lg group"
            >
              <Music className="w-5 h-5 group-hover:animate-pulse" />
              Start Music Room
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}