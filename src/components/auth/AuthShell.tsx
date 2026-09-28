'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/home/SiteHeader'
import { displayFont } from '@/components/home/font'

/**
 * Shared frame for /login, /register, and /forgot-password — same
 * sticky translucent header as the homepage, same glass-panel language
 * as the hero banner (rounded-[28px], backdrop-blur, bright top edge),
 * same materialize entrance (blur+scale together, critically damped, no
 * bounce — a passive page load carries no gesture momentum to justify
 * overshoot). `activePage` is omitted for pages that aren't specifically
 * the login or register page (e.g. forgot-password), showing both CTAs.
 */
export function AuthShell({ activePage, children }: { activePage?: 'login' | 'register'; children: ReactNode }) {
  const reduce = !!useReducedMotion()

  return (
    <div className={`${displayFont.className} min-h-[100dvh] bg-zinc-950 text-zinc-100`}>
      <SiteHeader hideCta={activePage} />
      <main className="flex items-center justify-center px-6 py-16 sm:px-10">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, filter: 'blur(12px)' }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={reduce ? { duration: 0.25 } : { type: 'spring', bounce: 0, duration: 0.5 }}
          className="w-full max-w-md overflow-hidden rounded-[28px] border-t border-white/[0.14] bg-white/[0.06] p-8 shadow-[0_40px_100px_-30px_rgba(79,70,229,0.4)] backdrop-blur-2xl backdrop-saturate-150 sm:p-10"
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
