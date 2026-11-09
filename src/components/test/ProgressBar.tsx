import { motion } from "framer-motion";

type Props = {
  current: number;
  total: number;
};

// "Living progress" — a felt sense of movement, not just a percentage
// (RFC-004 locked requirement). The specific animation/visual mechanic is
// Product/Design's call; this is the simplest neutral version — a spring
// fill instead of a static bar, a small pop on the number as it advances —
// marked provisional per the established presentation boundary.
export default function ProgressBar({
  current,
  total,
}: Props) {
  const progress = (current / total) * 100;

  return (
    <div className="w-full">

      <div className="flex justify-between text-sm text-white/60 mb-3">
        <span>
          Питання {current} з {total}
        </span>

        <motion.span
          key={current}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {Math.round(progress)}%
        </motion.span>
      </div>

      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="
            h-full
            bg-gradient-to-r from-blue-400 to-purple-400
          "
          animate={{
            width: `${progress}%`,
          }}
          transition={{
            type: "spring",
            stiffness: 120,
            damping: 20,
          }}
        />
      </div>

    </div>
  );
}