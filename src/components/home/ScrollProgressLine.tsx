'use client'

import { motion, useScroll, useSpring, useReducedMotion } from 'framer-motion'

/**
 * A persistent scroll-progress thread running down the page — the
 * connective visual between Hero -> Products -> Solutions, echoing the
 * "one continuous story" the banner itself tells. Scroll-driven, not
 * gesture-driven, so it's exempt from the "no scroll listeners" caution
 * (Motion's useScroll uses a passive, off-main-thread-friendly observer,
 * not a raw scroll event handler) and stays subtle — a 2px thread, not a
 * parallax spectacle.
 */
export function ScrollProgressLine() {
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const smoothed = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.3 })

  if (reduce) return null

  return (
    <div className="pointer-events-none fixed inset-y-0 left-3 z-30 hidden w-px sm:block lg:left-6">
      <div className="absolute inset-0 bg-white/[0.06]" />
      <motion.div
        style={{ scaleY: smoothed }}
        className="absolute inset-0 origin-top bg-gradient-to-b from-indigo-400 via-indigo-500 to-transparent"
      />
    </div>
  )
}
