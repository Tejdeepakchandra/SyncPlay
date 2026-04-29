import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export default function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="border-t border-border py-10"
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <motion.div
              whileHover={{ rotate: 360, scale: 1.1 }}
              transition={{ duration: 0.5 }}
              className="w-6 h-6 rounded gradient-movie flex items-center justify-center"
            >
              <span className="text-primary-foreground font-bold text-[10px]">▶</span>
            </motion.div>
            <span className="font-display font-bold text-foreground">SyncPlay</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/movies" className="hover:text-foreground transition-colors hover:scale-105 inline-block">Movies</Link>
            <Link to="/music" className="hover:text-foreground transition-colors hover:scale-105 inline-block">Music</Link>
            <Link to="/friends" className="hover:text-foreground transition-colors hover:scale-105 inline-block">Friends</Link>
          </div>

          <p className="text-xs text-muted-foreground">
            Educational project. No copyrighted content hosted.
          </p>
        </div>
      </div>
    </motion.footer>
  );
}