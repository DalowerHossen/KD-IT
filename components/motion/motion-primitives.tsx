// path: components/motion/motion-primitives.tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Framer Motion wrappers that honor prefers-reduced-motion. When reduced
 * motion is requested, children render statically with no animation.
 */
export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
}): ReactElement {
  const reduceMotion = useReducedMotion();
  if (reduceMotion === true) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered entrance for list items. */
export function StaggerList({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  const reduceMotion = useReducedMotion();
  if (reduceMotion === true) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  const reduceMotion = useReducedMotion();
  if (reduceMotion === true) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Press feedback for interactive surfaces such as cards. */
export function Pressable({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  const reduceMotion = useReducedMotion();
  if (reduceMotion === true) {
    return <div className={cn("focus-within:outline-none", className)}>{children}</div>;
  }
  return (
    <motion.div className={className} whileTap={{ scale: 0.98 }} transition={{ duration: 0.075 }}>
      {children}
    </motion.div>
  );
}
