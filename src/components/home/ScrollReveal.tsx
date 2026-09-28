'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Scroll reveal — marketing-surface only per the `animate` skill (never
 * on functional daily-use UI). Fires once via `viewport: { once: true }`,
 * critically damped (bounce: 0), so re-scrolling past a section doesn't
 * replay it and nothing here overshoots.
 */
export function ScrollReveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ type: 'spring', bounce: 0, duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
