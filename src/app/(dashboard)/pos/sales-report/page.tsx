'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useDateWindow } from '@/lib/contexts/date-window-context'
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { Loader2, ShoppingCart, Percent, TrendingUp, DollarSign, Activity, AlertTriangle, Download } from 'lucide-react'
import { formatRp } from '@/lib/format'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { toast } from 'sonner'
import { fetchPosSalesSummary, fetchHourlySales, fetchPosSalesDetail, type PosSalesSummary, type HourlySales, type PosSaleDetailRow } from '@/lib/pos/salesSummary'
import { canAccess } from '@/lib/auth/canAccess'

const EXPORT_ROLES = ['owner', 'admin']

export default function PosSalesReportPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const { startDate, endDate } = useDateWindow()

  const [posSalesSummary, setPosSalesSummary] = useState<PosSalesSummary | null>(null)
  const [posSalesLoading, setPosSalesLoading] = useState(true)
  const [hourlySales, setHourlySales] = useState<HourlySales[]>([])
  const [saleDetails, setSaleDetails] = useState<PosSaleDetailRow[]>([])
  const [cashierScope, setCashierScope] = useState<string | undefined>(undefined)
  const [scopeResolved, setScopeResolved] = useState(false)
  const [canExport, setCanExport] = useState(false)

  const selectedOutlet = outlets.find(o => o.id === selectedOutletId)
  const periodLabel = `${format(startDate, 'd MMM yyyy', { locale: localeId })} — ${format(endDate, 'd MMM yyyy', { locale: localeId })}`

  useEffect(() => {
    async function resolveScope() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setScopeResolved(true); return }
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
      setCashierScope(profile?.role === 'cashier' ? user.id : undefined)
      setCanExport(canAccess(profile?.role ?? null, EXPORT_ROLES))
      setScopeResolved(true)
    }
    resolveScope()
  }, [supabase])

  useEffect(() => {
    if (!selectedOutletId || !scopeResolved) return
    async function fetchPosSales() {
      setPosSalesLoading(true)
      const summary = await fetchPosSalesSummary(supabase, {
        outletId: selectedOutletId!,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        cashierId: cashierScope
      })
      setPosSalesSummary(summary)
      setPosSalesLoading(false)
    }
    fetchPosSales()

    async function fetchHourly() {
      const hourly = await fetchHourlySales(supabase, {
        outletId: selectedOutletId!,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        cashierId: cashierScope
      })
      setHourlySales(hourly)
    }
    fetchHourly()

    async function fetchDetails() {
      const details = await fetchPosSalesDetail(supabase, {
        outletId: selectedOutletId!,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        cashierId: cashierScope
      })
      setSaleDetails(details)
    }
    fetchDetails()
  }, [selectedOutletId, supabase, startDate, endDate, scopeResolved, cashierScope])

  const handleExportCsv = () => {
    if (saleDetails.length === 0) {
      toast.error('Tidak ada data transaksi untuk diekspor pada periode ini.')
      return
    }
    const headers = ['Tanggal', 'Order ID', 'Kasir', 'Jumlah Item', 'Metode Bayar', 'Subtotal', 'Diskon', 'Pajak', 'Total', 'Status']
    const rows = saleDetails.map(d => [
      format(new Date(d.created_at), 'yyyy-MM-dd HH:mm'),
      d.id,
      d.cashier_name,
      d.item_count,
      d.payment_methods,
      d.subtotal,
      d.discount_amount,
      d.tax_amount,
      d.total_amount,
      d.status,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `penjualan-pos-${selectedOutlet?.name || 'outlet'}-${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Data penjualan berhasil diekspor')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Penjualan POS</h2>
          <p className="text-zinc-400 text-sm mt-0.5">
            {selectedOutlet?.name || '—'} · <span className="text-zinc-300">{periodLabel}</span>
            {cashierScope && <span className="text-indigo-400"> · Menampilkan penjualan Anda sendiri</span>}
          </p>
        </div>
        {canExport && (
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <Download className="h-4 w-4" /> Download CSV
          </button>
        )}
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
              <p className="text-sm font-bold text-zinc-100">Penjualan per Kategori</p>
              <p className="text-[11px] text-zinc-500">{periodLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-2 font-medium">Kategori</th>
                    <th className="px-4 py-2 font-medium text-right">Qty Terjual</th>
                    <th className="px-4 py-2 font-medium text-right">Pendapatan</th>
                    <th className="px-4 py-2 font-medium text-right w-32">% dari Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(posSalesSummary?.categoryBreakdown.length || 0) === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-zinc-600 text-sm">Tidak ada transaksi pada periode ini.</td></tr>
                  ) : posSalesSummary!.categoryBreakdown.map((c) => {
                    const pct = posSalesSummary!.netSales > 0 ? (c.revenue / posSalesSummary!.netSales) * 100 : 0
                    return (
                      <tr key={c.category} className="border-b border-zinc-800/30 last:border-0">
                        <td className="px-4 py-3 font-medium text-zinc-100">{c.category}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs text-right">x{c.qty}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatRp(c.revenue)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="h-1.5 w-16 rounded-full bg-zinc-800 overflow-hidden">
                              <div className="h-full bg-indigo-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-[11px] text-zinc-500 font-mono w-10 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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

          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
              <div>
                <p className="text-sm font-bold text-zinc-100">Data Transaksi</p>
                <p className="text-[11px] text-zinc-500">Rincian per order · {periodLabel} · {saleDetails.length} transaksi</p>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="border-b border-zinc-800/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-2 font-medium">Tanggal</th>
                    <th className="px-4 py-2 font-medium">Order #</th>
                    <th className="px-4 py-2 font-medium">Kasir</th>
                    <th className="px-4 py-2 font-medium text-right">Item</th>
                    <th className="px-4 py-2 font-medium">Bayar</th>
                    <th className="px-4 py-2 font-medium text-right">Subtotal</th>
                    <th className="px-4 py-2 font-medium text-right">Diskon</th>
                    <th className="px-4 py-2 font-medium text-right">Pajak</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {saleDetails.length === 0 ? (
                    <tr><td colSpan={10} className="py-8 text-center text-zinc-600 text-sm">Tidak ada transaksi pada periode ini.</td></tr>
                  ) : saleDetails.map((d) => (
                    <tr key={d.id} className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/20">
                      <td className="px-4 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{format(new Date(d.created_at), 'dd/MM/yy HH:mm')}</td>
                      <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{d.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-2.5 text-zinc-300">{d.cashier_name}</td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs text-right">{d.item_count}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs">{d.payment_methods}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{formatRp(d.subtotal)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-400/80">{d.discount_amount > 0 ? `-${formatRp(d.discount_amount)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-400">{formatRp(d.tax_amount)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-100">{formatRp(d.total_amount)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${d.status === 'voided' ? 'bg-red-950/30 text-red-400 border border-red-900/40' : 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40'}`}>
                          {d.status === 'voided' ? 'Voided' : 'Selesai'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
