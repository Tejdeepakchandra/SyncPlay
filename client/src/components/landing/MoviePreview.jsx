import { motion } from "framer-motion";
import { Play, Users, MessageCircle, Maximize, Volume2 } from "lucide-react";
import { leftReveal, rightReveal, staggerContainer, bulletItem, cardHover } from "@/lib/landingAnimations";

export default function MoviePreview() {
  const bulletPoints = [
    "Create a room in seconds",
    "Invite via link — no login needed",
    "Host controls playback for everyone",
    "Screen sharing for any streaming service",
  ];

  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          {/* LEFT SIDE — Movie box slides from left */}
          <motion.div
            variants={leftReveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="order-2 lg:order-1"
          >
            <div className="glass-panel p-4 glow-movie">
              {/* Fake player */}
              <div className="aspect-video rounded-xl bg-muted/30 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                
                {/* Play button center */}
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div className="w-14 h-14 rounded-full bg-primary/80 flex items-center justify-center backdrop-blur-sm cursor-pointer group-hover:bg-primary transition-colors">
                    <Play className="w-6 h-6 text-primary-foreground ml-0.5" />
                  </div>
                </motion.div>

                {/* Bottom controls */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="w-full h-1 rounded-full bg-muted/50 mb-3 overflow-hidden">
                    <motion.div
                      animate={{ width: ["30%", "35%", "30%"] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="h-full rounded-full gradient-movie"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Play className="w-4 h-4 text-foreground" />
                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">12:34 / 1:42:00</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-primary" />
                      <Maximize className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat peek */}
              <motion.div
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="mt-3 flex items-center gap-2 px-2"
              >
                <MessageCircle className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 h-8 rounded-lg bg-muted/30 px-3 flex items-center">
                  <span className="text-xs text-muted-foreground">Type a message...</span>
                </div>
                <motion.span 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="text-lg"
                >
                  😂
                </motion.span>
              </motion.div>
            </div>
          </motion.div>

          {/* RIGHT SIDE — Content slides from right */}
          <motion.div
            variants={rightReveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="order-1 lg:order-2"
          >
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-block text-xs font-semibold uppercase tracking-widest text-primary mb-4"
            >
              🎬 Movies
            </motion.div>
            
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-6 leading-tight">
              Theatre-Grade <span className="text-gradient-movie">Movie Nights</span>
            </h2>
            
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Create a room, invite friends, and experience movies together with a true cinema
              feel. Lights-off mode, synchronized playback, and real-time reactions.
            </p>

            {/* Bullet points with stagger */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="space-y-4"
            >
              {bulletPoints.map((item, i) => (
                <motion.div
                  key={i}
                  variants={bulletItem}
                  className="flex items-center gap-3"
                >
                  <motion.div
                    whileHover={{ scale: 1.2, rotate: 360 }}
                    transition={{ duration: 0.3 }}
                    className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"
                  >
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </motion.div>
                  <span className="text-foreground">{item}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}