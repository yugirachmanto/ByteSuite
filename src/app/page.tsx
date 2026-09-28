'use client'

import { useEffect } from 'react'
import { motion, useReducedMotion, useMotionValue, animate } from 'framer-motion'
import Link from 'next/link'
import { displayFont } from '@/components/home/font'
import HeroBanner from '@/components/home/HeroBanner'
import ProductsSection from '@/components/home/ProductsSection'
import SolutionsSection from '@/components/home/SolutionsSection'
import { ScrollProgressLine } from '@/components/home/ScrollProgressLine'
import { SiteHeader } from '@/components/home/SiteHeader'

// Apple's damping-ratio (0-1, 1.0 = critically damped) maps to Framer
// Motion's duration-based spring as `bounce: 0` — NOT `damping: 1`, which
// in Framer's own API is a raw physics coefficient on a different scale
// entirely and produces a heavily under-damped, oscillating spring.
const CRITICAL = { type: 'spring' as const, bounce: 0, duration: 0.4 }

function PressCTA({ reduce }: { reduce: boolean }) {
  const scale = useMotionValue(1)
  return (
    <motion.div style={{ scale }} className="inline-block">
      <Link
        href="/register"
        onPointerDown={() => !reduce && animate(scale, 0.97, CRITICAL)}
        onPointerUp={() => !reduce && animate(scale, 1, CRITICAL)}
        onPointerLeave={() => !reduce && animate(scale, 1, CRITICAL)}
        className="inline-flex h-12 items-center justify-center rounded-full bg-indigo-600 px-7 text-sm font-semibold text-white shadow-[0_16px_40px_-12px_rgba(79,70,229,0.6)]"
      >
        Start Free Trial
      </Link>
    </motion.div>
  )
}

export default function HomePage() {
  const reduce = !!useReducedMotion()
  const rise = { hidden: { opacity: 0, y: reduce ? 0 : 10 }, show: { opacity: 1, y: 0 } }
  const t = (delay: number) => (reduce ? { duration: 0.25 } : { ...CRITICAL, duration: 0.5, delay })

  // A Supabase auth callback (invite/recovery/signup) can land on `/` — the
  // page's own client-side JS is what exchanges the token for a session, so
  // it must be redirected to /setup-account to complete that exchange.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    const search = window.location.search
    if (
      hash.includes('access_token=') ||
      hash.includes('type=invite') ||
      hash.includes('type=recovery') ||
      hash.includes('type=signup') ||
      search.includes('code=') ||
      search.includes('token_hash=')
    ) {
      window.location.href = '/setup-account' + search + hash
    }
  }, [])

  return (
    <div className={`${displayFont.className} min-h-[100dvh] bg-zinc-950 text-zinc-100`}>
      <ScrollProgressLine />
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-6 pb-28 pt-10 sm:px-10 lg:pt-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-16">
          <div className="text-center lg:text-left">
            <motion.h1
              initial="hidden" animate="show" variants={rise} transition={t(0)}
              className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl"
            >
              Run the numbers. Run the kitchen.
            </motion.h1>
            <motion.p
              initial="hidden" animate="show" variants={rise} transition={t(0.06)}
              className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-zinc-400 lg:mx-0"
            >
              POS, inventory, and accounting in one system built for
              multi-outlet F&amp;B businesses.
            </motion.p>
            <motion.div initial="hidden" animate="show" variants={rise} transition={t(0.12)} className="mt-8 flex justify-center lg:justify-start">
              <PressCTA reduce={reduce} />
            </motion.div>
          </div>

          <HeroBanner />
        </div>
      </main>

      <ProductsSection />
      <SolutionsSection />
    </div>
  )
}
