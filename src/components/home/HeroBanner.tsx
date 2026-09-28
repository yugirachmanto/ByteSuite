'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, animate } from 'framer-motion'
import { Lock, LayoutDashboard, CreditCard, Package, FileText, BookOpen, BarChart3 } from 'lucide-react'

/**
 * A scripted user-journey demo: a cursor visits each real ByteSuite
 * module (same names/icons as the actual sidebar) in order, "clicking"
 * it, and that module's own content plays out — one continuous story
 * (Dashboard -> sell via POS -> stock valuation updates -> an invoice
 * comes in and gets scanned -> it posts to Accounting -> Reports rolls
 * it all up) instead of a grab-bag of unrelated demos.
 *
 * Cursor motion is scripted, not gesture-driven, so it stays critically
 * damped (bounce: 0) per apple-design — nothing here carries user
 * momentum to justify overshoot.
 */

const CRITICAL = { type: 'spring' as const, bounce: 0, duration: 0.4 }
const CURSOR_TRAVEL = 550
const CLICK_PULSE = 300

function useCountUp(target: number, delay = 0) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const controls = animate(0, target, { type: 'spring', bounce: 0, duration: 0.9, delay, onUpdate: v => setDisplay(Math.round(v)) })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, delay])
  return display
}

// ---------- Module 1: Dashboard ----------
function DashboardContent() {
  const sales = useCountUp(4128500, 0.2)
  const orders = useCountUp(127, 0.6)
  const avgTicket = useCountUp(32508, 0.7)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">Penjualan Hari Ini</span>
      </div>
      <p className="mt-2 text-base font-semibold tracking-[-0.01em] text-white tabular-nums">Rp {sales.toLocaleString('id-ID')}</p>
      <svg viewBox="0 0 400 100" className="mt-4 h-16 w-full text-indigo-400" fill="none">
        <motion.path
          d="M0 78 L50 65 L100 72 L150 40 L200 50 L250 18 L300 30 L350 8 L400 20"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
        />
      </svg>
      <div className="mt-auto flex items-center gap-6 border-t border-white/[0.08] pt-4">
        <div><p className="text-[11px] uppercase tracking-wide text-zinc-500">Transaksi</p><p className="mt-1 text-[11px] font-medium text-zinc-100 tabular-nums">{orders}</p></div>
        <div><p className="text-[11px] uppercase tracking-wide text-zinc-500">Rata-rata</p><p className="mt-1 text-[11px] font-medium text-zinc-100 tabular-nums">Rp {avgTicket.toLocaleString('id-ID')}</p></div>
        <div><p className="text-[11px] uppercase tracking-wide text-zinc-500">Stok</p><p className="mt-1 text-[11px] font-medium text-amber-400">2 peringatan</p></div>
      </div>
    </div>
  )
}

// ---------- Module 2: Point of Sale ----------
const MENU_ITEMS = [{ name: 'Nasi Goreng Spesial', price: 28000 }, { name: 'Es Teh Manis', price: 8000 }]

function PosContent() {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const timers = [400, 1000, 1900, 2800].map((d, i) => setTimeout(() => setStage(i + 1), d))
    return () => timers.forEach(clearTimeout)
  }, [])
  const cartTotal = (stage >= 1 ? MENU_ITEMS[0].price : 0) + (stage >= 2 ? MENU_ITEMS[1].price : 0)
  const paying = stage >= 3

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <AnimatePresence mode="wait">
        {!paying ? (
          <motion.div key="cart" exit={{ opacity: 0, transition: { duration: 0.2 } }} className="flex flex-col gap-2.5">
            {MENU_ITEMS.map((item, i) => (
              <motion.div
                key={item.name}
                animate={{ opacity: stage > i ? 1 : 0.35 }}
                transition={CRITICAL}
                className="flex items-center justify-between rounded-xl bg-zinc-950/50 px-4 py-2.5"
              >
                <span className="text-[11px] text-zinc-200">{item.name}</span>
                <span className="text-[11px] tabular-nums text-zinc-400">Rp {item.price.toLocaleString('id-ID')}</span>
              </motion.div>
            ))}
            <div className="mt-1 flex items-center justify-between rounded-xl bg-indigo-500/10 px-4 py-2.5">
              <span className="text-[11px] text-indigo-300">Total</span>
              <span className="text-[11px] font-semibold tabular-nums text-white">Rp {cartTotal.toLocaleString('id-ID')}</span>
            </div>
          </motion.div>
        ) : (
          <motion.div key="pay" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={CRITICAL} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between rounded-xl bg-zinc-950/50 px-4 py-2.5">
              <span className="text-[11px] text-zinc-400">Total Tagihan</span>
              <span className="text-[11px] font-medium tabular-nums text-zinc-200">Rp {cartTotal.toLocaleString('id-ID')}</span>
            </div>
            <motion.div animate={{ opacity: stage >= 4 ? 1 : 0.3 }} transition={CRITICAL} className="flex items-center justify-between rounded-xl bg-zinc-950/50 px-4 py-2.5">
              <span className="text-[11px] text-zinc-300">QRIS</span>
              <span className="text-[11px] font-medium tabular-nums text-emerald-400">Rp {stage >= 4 ? cartTotal.toLocaleString('id-ID') : 0}</span>
            </motion.div>
            <AnimatePresence>
              {stage >= 4 && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={CRITICAL} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-emerald-300">
                  <span className="text-[11px] font-medium">Transaksi Selesai</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- Module 3: Inventory (FIFO-AVG) ----------
const BATCHES = [{ label: 'Batch A', qty: 2, price: 10000 }, { label: 'Batch B', qty: 2, price: 10000 }, { label: 'Batch C', qty: 3, price: 12000 }]

function InventoryContent() {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const timers = [500, 1000, 1500, 2200].map((d, i) => setTimeout(() => setStage(i + 1), d))
    return () => timers.forEach(clearTimeout)
  }, [])
  const avgCost = useCountUp(11000, 0)
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <div>
        <p className="mb-3 text-[11px] uppercase tracking-wide text-zinc-500">Konsumsi 5kg — jalan dari batch terlama</p>
        <div className="flex gap-2">
          {BATCHES.map((b, i) => (
            <motion.div key={b.label} animate={{ opacity: stage > i ? 0.35 : 1, borderColor: stage > i ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)' }} transition={CRITICAL} className="flex-1 rounded-xl border bg-zinc-950/50 p-3">
              <p className="text-[11px] text-zinc-400">{b.label}</p>
              <p className="mt-1 text-[11px] font-medium text-zinc-100">{b.qty}kg</p>
              <p className="text-[11px] tabular-nums text-zinc-500">Rp {b.price.toLocaleString('id-ID')}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {stage >= 4 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={CRITICAL} className="rounded-xl bg-indigo-500/10 px-4 py-3">
            <p className="text-[11px] text-indigo-300">Rata-rata harga UNIK yang tersentuh: Rp 10.000 &amp; Rp 12.000</p>
            <p className="mt-1 text-[11px] font-semibold tabular-nums text-white">Rp {avgCost.toLocaleString('id-ID')} / kg</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- Module 4: Invoices (with scan effect) ----------
function InvoiceContent() {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const timers = [1200, 2000, 2700].map((d, i) => setTimeout(() => setStage(i + 1), d))
    return () => timers.forEach(clearTimeout)
  }, [])
  const rows = [
    { item: 'Tepung Terigu · 5kg', coa: '1-1-004 Persediaan Bahan Baku' },
    { item: 'Gula Pasir · 3kg', coa: '1-1-004 Persediaan Bahan Baku' },
  ]
  return (
    <div className="flex h-full items-center gap-6">
      <div className="relative h-32 w-20 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-zinc-950/60 p-2.5">
        <div className="h-1.5 w-3/4 rounded-full bg-white/15" />
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10" />
        <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-white/10" />
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10" />
        <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-indigo-400/40" />
        {stage < 1 && (
          <motion.div
            initial={{ top: '-20%' }}
            animate={{ top: '110%' }}
            transition={{ duration: 1.0, ease: 'linear' }}
            className="absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-emerald-400/50 to-transparent"
            style={{ boxShadow: '0 0 12px 2px rgba(52,211,153,0.35)' }}
          />
        )}
      </div>
      <div className="flex-1 space-y-2">
        {stage < 1 && <p className="text-[11px] text-zinc-500">Memindai invoice…</p>}
        {rows.map((row, i) => (
          <motion.div
            key={row.item}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: stage >= 1 ? 1 : 0, x: stage >= 1 ? 0 : -8 }}
            transition={{ ...CRITICAL, delay: i * 0.2 }}
            className="rounded-xl bg-zinc-950/50 px-3.5 py-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-200">{row.item}</span>
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: stage >= 2 ? 1 : 0, opacity: stage >= 2 ? 1 : 0 }}
                transition={{ ...CRITICAL, delay: 0.15 + i * 0.15 }}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-400"
              >
                ✓
              </motion.span>
            </div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: stage >= 3 ? 1 : 0 }}
              transition={{ duration: 0.3, delay: i * 0.15 }}
              className="mt-0.5 text-[11px] text-indigo-300"
            >
              {row.coa}
            </motion.p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ---------- Module 5: Accounting ----------
function AccountingContent() {
  const rows = [{ akun: 'Persediaan Bahan Baku', debit: '1.240.000', kredit: '' }, { akun: 'Hutang Usaha', debit: '', kredit: '1.240.000' }]
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="overflow-hidden rounded-xl bg-zinc-950/50">
        <div className="grid grid-cols-3 gap-2 border-b border-white/[0.06] px-4 py-2 text-[11px] uppercase tracking-wide text-zinc-500">
          <span>Akun</span><span className="text-right">Debit</span><span className="text-right">Kredit</span>
        </div>
        {rows.map((row, i) => (
          <motion.div key={row.akun} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.25, duration: 0.3, ease: [0.23, 1, 0.32, 1] }} className="grid grid-cols-3 gap-2 px-4 py-2.5 text-[11px]">
            <span className="text-zinc-200">{row.akun}</span>
            <span className="text-right tabular-nums text-zinc-300">{row.debit}</span>
            <span className="text-right tabular-nums text-zinc-300">{row.kredit}</span>
          </motion.div>
        ))}
      </div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.3 }} className="mt-3 text-center text-[11px] uppercase tracking-wide text-emerald-400">
        Balanced
      </motion.p>
    </div>
  )
}

// ---------- Module 6: Reports (Profit & Loss) ----------
const PNL_ROWS = [
  { label: 'Pendapatan', value: 58259500, kind: 'normal' as const },
  { label: 'HPP (COGS)', value: -23300000, kind: 'normal' as const },
  { label: 'Laba Kotor', value: 34959500, kind: 'subtotal' as const },
  { label: 'Beban Operasional', value: -12000000, kind: 'normal' as const },
  { label: 'Laba Bersih', value: 22959500, kind: 'total' as const },
]

function ReportsContent() {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">Laba Rugi · Bulan Ini</p>
      <div className="flex flex-col gap-1.5">
        {PNL_ROWS.map((row, i) => {
          const negative = row.value < 0
          const rowClass =
            row.kind === 'total' ? 'bg-emerald-500/10' :
            row.kind === 'subtotal' ? 'bg-white/[0.04]' : 'bg-zinc-950/50'
          const labelClass =
            row.kind === 'total' ? 'text-[11px] font-semibold text-emerald-300' :
            row.kind === 'subtotal' ? 'text-[11px] font-medium text-zinc-300' : 'text-[11px] text-zinc-400'
          const valueClass =
            row.kind === 'total' ? 'text-[11px] font-semibold tabular-nums text-emerald-300' :
            row.kind === 'subtotal' ? 'text-[11px] font-medium tabular-nums text-zinc-200' :
            'text-[11px] tabular-nums ' + (negative ? 'text-red-400' : 'text-zinc-200')
          return (
            <motion.div
              key={row.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...CRITICAL, delay: i * 0.22 }}
              className={'flex items-center justify-between rounded-xl px-4 py-2 ' + rowClass}
            >
              <span className={labelClass}>{row.label}</span>
              <span className={valueClass}>{negative ? '-' : ''}Rp {Math.abs(row.value).toLocaleString('id-ID')}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

const MODULES = [
  { label: 'Dashboard', icon: LayoutDashboard, Content: DashboardContent, duration: 2800 },
  { label: 'Point of Sale', icon: CreditCard, Content: PosContent, duration: 3600 },
  { label: 'Inventory', icon: Package, Content: InventoryContent, duration: 3400 },
  { label: 'Invoices', icon: FileText, Content: InvoiceContent, duration: 3600 },
  { label: 'Accounting', icon: BookOpen, Content: AccountingContent, duration: 2400 },
  { label: 'Reports', icon: BarChart3, Content: ReportsContent, duration: 3000 },
] as const

function Cursor({ containerRef, targetIndex, clicking }: { containerRef: React.RefObject<HTMLDivElement | null>; targetIndex: number; clicking: boolean }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    const row = document.querySelector<HTMLButtonElement>(`[data-module-row="${targetIndex}"]`)
    const container = containerRef.current
    if (!row || !container) return
    const rowRect = row.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setPos({ x: rowRect.left - containerRect.left + rowRect.width - 14, y: rowRect.top - containerRect.top + rowRect.height / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIndex])

  return (
    <motion.div
      className="pointer-events-none absolute z-20"
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', bounce: 0, duration: CURSOR_TRAVEL / 1000 }}
      style={{ left: 0, top: 0 }}
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        <AnimatePresence>
          {clicking && (
            <motion.span
              initial={{ opacity: 0.6, scale: 0.4 }}
              animate={{ opacity: 0, scale: 1.8 }}
              exit={{ opacity: 0 }}
              transition={{ duration: CLICK_PULSE / 1000, ease: 'easeOut' }}
              className="absolute inset-0 -m-2 rounded-full bg-white/50"
            />
          )}
        </AnimatePresence>
        <svg width="16" height="16" viewBox="0 0 16 16" className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <path d="M1 1 L1 13.5 L4.2 10.6 L6.4 15 L8.6 14 L6.4 9.5 L11 9.3 Z" fill="white" stroke="black" strokeWidth="0.6" strokeLinejoin="round" />
        </svg>
      </div>
    </motion.div>
  )
}

export default function HeroBanner() {
  const reduce = !!useReducedMotion()
  const [activeModule, setActiveModule] = useState(0)
  const [phase, setPhase] = useState<'content' | 'moving'>('content')
  const [paused, setPaused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reduce) return
    if (phase === 'content') {
      // Only the autoplay advance respects hover-pause — a click that's
      // already in flight must still resolve, or hovering to pause right
      // after clicking a module would leave the panel blank forever.
      if (paused) return
      const t = setTimeout(() => {
        setActiveModule(m => (m + 1) % MODULES.length)
        setPhase('moving')
      }, MODULES[activeModule].duration)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setPhase('content'), CURSOR_TRAVEL + CLICK_PULSE)
    return () => clearTimeout(t)
  }, [phase, activeModule, paused, reduce])

  const selectModule = (i: number) => {
    if (i === activeModule && phase === 'content') return
    setActiveModule(i)
    setPhase(reduce ? 'content' : 'moving')
  }

  const Active = MODULES[activeModule].Content

  return (
    <div className="mx-auto w-full max-w-2xl lg:mx-0" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: 'blur(16px)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={reduce ? { duration: 0.3 } : { type: 'spring', bounce: 0, duration: 0.6, delay: 0.15 }}
        className="overflow-hidden rounded-[20px] border-t border-white/[0.14] bg-white/[0.06] shadow-[0_40px_100px_-30px_rgba(79,70,229,0.45)] backdrop-blur-2xl backdrop-saturate-150"
      >
        {/* Safari-style window chrome */}
        <div className="flex items-center gap-3 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="flex max-w-[85%] items-center gap-1.5 rounded-full bg-zinc-950/50 px-3 py-1 text-xs text-zinc-400">
              <Lock className="h-3 w-3 shrink-0 text-zinc-500" />
              <span className="shrink-0">bytesuite.app</span>
              <span className="shrink-0 text-zinc-700">—</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={activeModule}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.15 } }}
                  transition={CRITICAL}
                  className="truncate text-zinc-200"
                >
                  {MODULES[activeModule].label}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
          <div className="w-[42px]" aria-hidden="true" />
        </div>

        {/* App body: sidebar + content */}
        <div ref={containerRef} className="relative flex h-80 sm:h-72">
          <div className="flex w-[92px] shrink-0 flex-col gap-1 border-r border-white/[0.08] bg-zinc-950/40 p-2 sm:w-[124px] sm:p-3">
            {MODULES.map((m, i) => {
              const Icon = m.icon
              const isActive = i === activeModule
              return (
                <button
                  key={m.label}
                  data-module-row={i}
                  onClick={() => selectModule(i)}
                  className={
                    'flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-medium transition-colors duration-200 ' +
                    (isActive ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-500')
                  }
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{m.label}</span>
                </button>
              )
            })}
          </div>

          <div className="relative flex-1 overflow-hidden p-3 sm:p-6">
            {phase === 'content' && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeModule}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, transition: { duration: 0.2 } }}
                  transition={CRITICAL}
                  className="h-full"
                >
                  <Active />
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {!reduce && <Cursor containerRef={containerRef} targetIndex={activeModule} clicking={phase === 'moving'} />}
        </div>
      </motion.div>

      {/* Dot rail */}
      <div className="mt-6 flex items-center justify-center gap-1.5">
        {MODULES.map((m, i) => (
          <button key={m.label} onClick={() => selectModule(i)} aria-label={m.label} className="p-1">
            <motion.span
              animate={{ width: i === activeModule ? 20 : 6, opacity: i === activeModule ? 1 : 0.35 }}
              transition={CRITICAL}
              className="block h-1.5 rounded-full bg-indigo-400"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
