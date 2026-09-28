'use client'

import type { LucideIcon } from 'lucide-react'
import { ShieldCheck, WifiOff, ReceiptText, Download } from 'lucide-react'
import { ScrollReveal } from './ScrollReveal'
import { displayFont } from './font'

/**
 * Deliberately NOT a recap of the six modules — the hero banner already
 * demonstrates those live, and restating them here would just be the
 * same pitch twice. This is what the tour doesn't show: operational
 * depth (roles, offline resilience, shift reconciliation, exports).
 * Same glass-material language as the banner (backdrop-blur, bright top
 * edge, indigo accent) so it reads as one continuous product, not a
 * bolted-on marketing section.
 */
const CAPABILITIES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: ShieldCheck, title: 'Role-based access, built in', desc: 'Owner, admin, cashier, kitchen, finance, viewer — everyone sees exactly what their job needs, nothing more.' },
  { icon: WifiOff, title: 'Works offline, syncs when back', desc: 'A dead connection at the till does not stop a sale. Orders queue locally and sync the moment you are back online.' },
  { icon: ReceiptText, title: 'Shift reports, reconciled automatically', desc: 'Open and close every shift with an X/Z report that reconciles counted cash against the system in seconds.' },
  { icon: Download, title: 'Export anything, instantly', desc: 'Polished PDF and Excel reports — sales, inventory, P&L — one click, no assembly required.' },
]

function CapabilityTile({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="h-full overflow-hidden rounded-[28px] border-t border-white/[0.14] bg-white/[0.06] p-7 shadow-[0_30px_80px_-30px_rgba(79,70,229,0.35)] backdrop-blur-2xl backdrop-saturate-150">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{desc}</p>
    </div>
  )
}

export default function ProductsSection() {
  return (
    <section id="products" className={`${displayFont.className} mx-auto max-w-6xl px-6 py-24 sm:px-10`}>
      <ScrollReveal>
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-400">Products</p>
        <h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
          What the tour above didn&apos;t show you.
        </h2>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-zinc-400">
          Beyond the modules you just watched, this is the operational depth that keeps a real, multi-shift, multi-outlet business running.
        </p>
      </ScrollReveal>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {CAPABILITIES.map((c, i) => (
          <ScrollReveal key={c.title} delay={i * 0.08}>
            <CapabilityTile {...c} />
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}
