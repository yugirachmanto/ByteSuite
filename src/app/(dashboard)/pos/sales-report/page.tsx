'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useDateWindow } from '@/lib/contexts/date-window-context'
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { Loader2, ShoppingCart, Percent, TrendingUp, DollarSign, Activity, AlertTriangle } from 'lucide-react'
import { formatRp } from '@/lib/format'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { fetchPosSalesSummary, fetchHourlySales, type PosSalesSummary, type HourlySales } from '@/lib/pos/salesSummary'

export default function PosSalesReportPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const { startDate, endDate } = useDateWindow()

  const [posSalesSummary, setPosSalesSummary] = useState<PosSalesSummary | null>(null)
  const [posSalesLoading, setPosSalesLoading] = useState(true)
  const [hourlySales, setHourlySales] = useState<HourlySales[]>([])

  const selectedOutlet = outlets.find(o => o.id === selectedOutletId)
  const periodLabel = `${format(startDate, 'd MMM yyyy', { locale: localeId })} — ${format(endDate, 'd MMM yyyy', { locale: localeId })}`

  useEffect(() => {
    if (!selectedOutletId) return
    async function fetchPosSales() {
      setPosSalesLoading(true)
      const summary = await fetchPosSalesSummary(supabase, {
        outletId: selectedOutletId!,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString()
      })
      setPosSalesSummary(summary)
      setPosSalesLoading(false)
    }
    fetchPosSales()

    async function fetchHourly() {
      const hourly = await fetchHourlySales(supabase, {
        outletId: selectedOutletId!,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString()
      })
      setHourlySales(hourly)
    }
    fetchHourly()
  }, [selectedOutletId, supabase, startDate, endDate])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Penjualan POS</h2>
        <p className="text-zinc-400 text-sm mt-0.5">
          {selectedOutlet?.name || '—'} · <span className="text-zinc-300">{periodLabel}</span>
        </p>
      </div>

      {posSalesLoading ? (
        <div className="flex h-64 items-center justify-center text-zinc-600">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              { label: 'Penjualan Kotor', value: formatRp(posSalesSummary?.grossSales || 0), icon: ShoppingCart, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
              { label: 'Diskon', value: formatRp(posSalesSummary?.discountTotal || 0), icon: Percent, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
              { label: 'Pajak', value: formatRp(posSalesSummary?.taxTotal || 0), icon: TrendingUp, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
              { label: 'Total Penjualan', value: formatRp(posSalesSummary?.netSales || 0), icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
              { label: 'Transaksi', value: String(posSalesSummary?.orderCount || 0), icon: Activity, color: 'text-zinc-100', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' },
              { label: 'Rata-rata Transaksi', value: formatRp(posSalesSummary?.averageTransaction || 0), icon: DollarSign, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
              { label: 'Dibatalkan', value: `${posSalesSummary?.voidedCount || 0} (${formatRp(posSalesSummary?.voidedAmount || 0)})`, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
            ].map(kpi => (
              <div key={kpi.label} className={`rounded-xl border ${kpi.border} bg-zinc-900/50 p-4 backdrop-blur-sm`}>
                <div className={`mb-3 w-fit rounded-lg p-1.5 ${kpi.bg}`}>
                  <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                </div>
                <div className={`text-lg font-bold font-mono tracking-tight ${kpi.color}`}>{kpi.value}</div>
                <div className="text-[10px] text-zinc-500 font-medium mt-1 uppercase tracking-wider">{kpi.label}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800/60">
                <p className="text-sm font-bold text-zinc-100">Metode Pembayaran</p>
                <p className="text-[11px] text-zinc-500">{periodLabel}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {(posSalesSummary?.tenders.length || 0) === 0 ? (
                      <tr><td className="py-8 text-center text-zinc-600 text-sm">Tidak ada transaksi pada periode ini.</td></tr>
                    ) : posSalesSummary!.tenders.map((t) => (
                      <tr key={t.method} className="border-b border-zinc-800/30 last:border-0">
                        <td className="px-4 py-3 font-medium text-zinc-100">{t.method}</td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatRp(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800/60">
                <p className="text-sm font-bold text-zinc-100">Item Terlaris</p>
                <p className="text-[11px] text-zinc-500">Berdasarkan pendapatan · {periodLabel}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {(posSalesSummary?.topItems.length || 0) === 0 ? (
                      <tr><td className="py-8 text-center text-zinc-600 text-sm">Tidak ada transaksi pada periode ini.</td></tr>
                    ) : posSalesSummary!.topItems.map((item, i) => (
                      <tr key={i} className="border-b border-zinc-800/30 last:border-0">
                        <td className="px-4 py-3 font-medium text-zinc-100">{item.name}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs text-right">x{item.qty}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatRp(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800/60">
              <p className="text-sm font-bold text-zinc-100">Penjualan per Jam</p>
              <p className="text-[11px] text-zinc-500">{periodLabel}</p>
            </div>
            <div className="p-4" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlySales} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => formatRp(v)} width={80} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelFormatter={(h) => `Jam ${h}:00`}
                    formatter={(value: any, name: any) => [name === 'sales' ? formatRp(value) : value, name === 'sales' ? 'Penjualan' : 'Transaksi']}
                  />
                  <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {(posSalesSummary?.compTotal || 0) > 0 && (
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
                <div>
                  <p className="text-sm font-bold text-zinc-100">Komplimen</p>
                  <p className="text-[11px] text-zinc-500">{periodLabel}</p>
                </div>
                <p className="text-sm font-bold text-amber-400 font-mono">{formatRp(posSalesSummary?.compTotal || 0)}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {posSalesSummary!.compRecipients.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-800/30 last:border-0">
                        <td className="px-4 py-3 font-medium text-zinc-100">{r.notes}</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-400">{formatRp(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
