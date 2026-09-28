'use client'

import { X, Check } from 'lucide-react'
import { ScrollReveal } from './ScrollReveal'
import { displayFont } from './font'

/**
 * A before/after comparison instead of a text-heavy list — different
 * visual form from ProductsSection's tile grid on purpose, and it ties
 * directly back to the hero headline's own claim ("doesn't lie to you")
 * instead of restating feature copy a third time.
 */
const PAIRS = [
  { before: 'Spreadsheets that break the moment two people touch them', after: 'One ledger, always balanced, always live' },
  { before: 'Margins guessed, not calculated', after: 'FIFO-AVG costing, down to the recipe' },
  { before: 'Cash reconciled by hand at every shift change', after: 'X/Z reports reconcile cash automatically' },
  { before: 'Invoices typed in, one line at a time', after: 'Photograph an invoice — AI extracts it' },
  { before: 'Books closed weeks after month-end', after: 'Every transaction already posted' },
]

export default function SolutionsSection() {
  return (
    <section id="solutions" className={`${displayFont.className} mx-auto max-w-5xl px-6 py-24 sm:px-10`}>
      <ScrollReveal className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-400">Solutions</p>
        <h2 className="mx-auto mt-3 max-w-lg text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
          The numbers didn&apos;t lie. Here&apos;s what changed.
        </h2>
      </ScrollReveal>

      <div className="mt-14 overflow-hidden rounded-[28px] border-t border-white/[0.14] bg-white/[0.06] shadow-[0_40px_100px_-30px_rgba(79,70,229,0.35)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="grid grid-cols-2 border-b border-white/[0.08] text-center text-xs font-medium uppercase tracking-wide">
          <div className="border-r border-white/[0.08] py-4 text-zinc-500">Without ByteSuite</div>
          <div className="py-4 text-indigo-300">With ByteSuite</div>
        </div>
        {PAIRS.map((p, i) => (
          <ScrollReveal key={p.before} delay={i * 0.06}>
            <div className={'grid grid-cols-2' + (i < PAIRS.length - 1 ? ' border-b border-white/[0.06]' : '')}>
              <div className="flex items-start gap-3 border-r border-white/[0.08] px-5 py-4 sm:px-6">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                <span className="text-sm text-zinc-500">{p.before}</span>
              </div>
              <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-sm text-zinc-200">{p.after}</span>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}
