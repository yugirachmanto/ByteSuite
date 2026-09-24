'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useDateWindow } from '@/lib/contexts/date-window-context'
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts'
import { Loader2, ShoppingCart, Percent, TrendingUp, DollarSign, Activity, AlertTriangle, Download, FileSpreadsheet, FileText, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import { formatRp } from '@/lib/format'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { toast } from 'sonner'
import { fetchPosSalesSummary, fetchSalesTrend, fetchPosSalesDetail, fetchPosSalesItemDetail, type PosSalesSummary, type SalesTrend, type PosSaleDetailRow, type PosSaleItemRow } from '@/lib/pos/salesSummary'
import { canAccess } from '@/lib/auth/canAccess'
import { fetchSalesAnalytics, type SalesAnalytics } from '@/lib/pos/salesAnalytics'
import { exportSalesReportExcel, exportSalesReportPdf, captureChartsImage } from '@/lib/pos/salesReportExport'

const PAY_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16']
const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

const EXPORT_ROLES = ['owner', 'admin']

export default function PosSalesReportPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const { startDate, endDate } = useDateWindow()

  const [posSalesSummary, setPosSalesSummary] = useState<PosSalesSummary | null>(null)
  const [posSalesLoading, setPosSalesLoading] = useState(true)
  const [trend, setTrend] = useState<SalesTrend>({ granularity: 'hour', points: [] })
  const [saleDetails, setSaleDetails] = useState<PosSaleDetailRow[]>([])
  const [itemRows, setItemRows] = useState<PosSaleItemRow[]>([])
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const chartsRef = useRef<HTMLDivElement>(null)
  const [cashierScope, setCashierScope] = useState<string | undefined>(undefined)
  const [scopeResolved, setScopeResolved] = useState(false)
  const [canExport, setCanExport] = useState(false)
  const [userName, setUserName] = useState<string | undefined>(undefined)

  const selectedOutlet = outlets.find(o => o.id === selectedOutletId)
  const periodLabel = `${format(startDate, 'd MMM yyyy', { locale: localeId })} — ${format(endDate, 'd MMM yyyy', { locale: localeId })}`

  useEffect(() => {
    async function resolveScope() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setScopeResolved(true); return }
      const { data: profile } = await supabase.from('user_profiles').select('role, full_name').eq('id', user.id).single()
      setCashierScope(profile?.role === 'cashier' ? user.id : undefined)
      setCanExport(canAccess(profile?.role ?? null, EXPORT_ROLES))
      setUserName(profile?.full_name || undefined)
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

    async function fetchTrend() {
      const result = await fetchSalesTrend(supabase, {
        outletId: selectedOutletId!,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        cashierId: cashierScope
      })
      setTrend(result)
    }
    fetchTrend()

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

    async function fetchItems() {
      const items = await fetchPosSalesItemDetail(supabase, {
        outletId: selectedOutletId!,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        cashierId: cashierScope
      })
      setItemRows(items)
    }
    fetchItems()

    async function fetchAnalytics() {
      const result = await fetchSalesAnalytics(supabase, {
        outletId: selectedOutletId!,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        cashierId: cashierScope
      })
      setAnalytics(result)
    }
    fetchAnalytics()
  }, [selectedOutletId, supabase, startDate, endDate, scopeResolved, cashierScope])

  const downloadCsv = (headers: string[], rows: (string | number)[][], filePrefix: string) => {
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const link = document.createElement('a')
    link.setAttribute('href', encodeURI(csvContent))
    link.setAttribute('download', `${filePrefix}-${selectedOutlet?.name || 'outlet'}-${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Data penjualan berhasil diekspor')
  }

  const handleExportReport = async (kind: 'xlsx' | 'pdf') => {
    if (!posSalesSummary) return
    setMenuOpen(false)
    setExporting(kind)
    try {
      const data = {
        outletName: selectedOutlet?.name || 'outlet',
        periodLabel,
        summary: posSalesSummary,
        trend,
        analytics,
        saleDetails,
        itemRows,
        generatedBy: userName,
        chartsImage: await captureChartsImage(chartsRef.current),
      }
      if (kind === 'xlsx') await exportSalesReportExcel(data)
      else await exportSalesReportPdf(data)
      toast.success('Laporan lengkap berhasil diunduh')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal membuat laporan')
    } finally {
      setExporting(null)
    }
  }

  const handleExportItemsCsv = () => {
    if (itemRows.length === 0) {
      toast.error('Tidak ada data item untuk diekspor pada periode ini.')
      return
    }
    downloadCsv(
      ['Tanggal', 'Order ID', 'Kasir', 'Metode Bayar', 'Status', 'Item', 'Kategori', 'Qty', 'Harga Satuan', 'Diskon', 'Subtotal'],
      itemRows.map(r => [format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'), r.order_id, r.cashier_name, r.payment_methods, r.status, r.item_name, r.category, r.qty, r.unit_price, r.discount_amount, r.subtotal]),
      'penjualan-pos-item'
    )
  }

  const handleExportCsv = () => {
    if (saleDetails.length === 0) {
      toast.error('Tidak ada data transaksi untuk diekspor pada periode ini.')
      return
    }
    downloadCsv(
      ['Tanggal', 'Order ID', 'Kasir', 'Jumlah Item', 'Metode Bayar', 'Subtotal', 'Diskon', 'Pajak', 'Pembulatan', 'Total', 'Status'],
      saleDetails.map(d => [format(new Date(d.created_at), 'yyyy-MM-dd HH:mm'), d.id, d.cashier_name, d.item_count, d.payment_methods, d.subtotal, d.discount_amount, d.tax_amount, d.rounding_amount, d.total_amount, d.status]),
      'penjualan-pos'
    )
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
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(o => !o)}
              disabled={exporting !== null || posSalesLoading}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Laporan
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-lg">
                  <button onClick={() => handleExportReport('xlsx')} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Excel (.xlsx)
                  </button>
                  <button onClick={() => handleExportReport('pdf')} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800">
                    <FileText className="h-4 w-4 text-red-400" /> PDF
                  </button>
                  <p className="px-3 py-1.5 text-[10px] text-zinc-500">Laporan lengkap; tabel data transaksi di halaman/sheet terakhir.</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {posSalesLoading ? (
        <div className="flex h-64 items-center justify-center text-zinc-600">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {[
              { label: 'Penjualan Kotor', value: formatRp(posSalesSummary?.grossSales || 0), icon: ShoppingCart, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
              { label: 'Diskon', value: formatRp(posSalesSummary?.discountTotal || 0), icon: Percent, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
              { label: 'Pajak', value: formatRp(posSalesSummary?.taxTotal || 0), icon: TrendingUp, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
              { label: 'Pembulatan', value: formatRp(posSalesSummary?.roundingTotal || 0), icon: TrendingUp, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
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

          {analytics && (
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
              <p className="text-sm font-bold text-zinc-100">Dibanding Periode Sebelumnya</p>
              <p className="text-[11px] text-zinc-500 mb-3">{analytics.previousLabel}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Total Penjualan', cur: analytics.current.netSales, prev: analytics.previous.netSales, money: true },
                  { label: 'Transaksi', cur: analytics.current.orderCount, prev: analytics.previous.orderCount, money: false },
                  { label: 'Rata-rata Transaksi', cur: analytics.current.averageTransaction, prev: analytics.previous.averageTransaction, money: true },
                ].map(t => {
                  const delta = t.prev > 0 ? ((t.cur - t.prev) / t.prev) * 100 : null
                  const up = (delta ?? 0) >= 0
                  return (
                    <div key={t.label} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{t.label}</div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="font-mono text-lg font-bold text-zinc-100">{t.money ? formatRp(t.cur) : t.cur}</span>
                        {delta === null ? (
                          <span className="text-xs text-zinc-500">baru</span>
                        ) : (
                          <span className={`flex items-center text-xs font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(delta).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">sebelumnya {t.money ? formatRp(t.prev) : t.prev}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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

          <div ref={chartsRef} className="space-y-5">
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800/60">
              <p className="text-sm font-bold text-zinc-100">{trend.granularity === 'hour' ? 'Penjualan per Jam' : 'Penjualan per Hari'}</p>
              <p className="text-[11px] text-zinc-500">{periodLabel}</p>
            </div>
            <div className="p-4" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend.points} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" stroke="#71717a" fontSize={11} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => formatRp(v)} width={80} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelFormatter={(l) => (trend.granularity === 'hour' ? `Jam ${l}` : String(l))}
                    formatter={(value: any, name: any) => [name === 'sales' ? formatRp(value) : value, name === 'sales' ? 'Penjualan' : 'Transaksi']}
                  />
                  <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800/60">
                <p className="text-sm font-bold text-zinc-100">Komposisi Metode Pembayaran</p>
                <p className="text-[11px] text-zinc-500">{periodLabel}</p>
              </div>
              {(analytics?.paymentTrend.methods.length || 0) === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-600">Tidak ada transaksi pada periode ini.</p>
              ) : (
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={posSalesSummary?.tenders || []} dataKey="amount" nameKey="method" innerRadius={55} outerRadius={90} paddingAngle={2}>
                          {(posSalesSummary?.tenders || []).map((_, i) => <Cell key={i} fill={PAY_COLORS[i % PAY_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} formatter={(v: any) => formatRp(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics!.paymentTrend.points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="label" stroke="#71717a" fontSize={11} interval="preserveStartEnd" minTickGap={24} />
                        <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => formatRp(v)} width={80} />
                        <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} formatter={(v: any) => formatRp(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {analytics!.paymentTrend.methods.map((m, i) => (
                          <Bar key={m} dataKey={m} stackId="pay" fill={PAY_COLORS[i % PAY_COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>

          {analytics && (
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800/60">
                <p className="text-sm font-bold text-zinc-100">Jam & Hari Tersibuk</p>
                <p className="text-[11px] text-zinc-500">Penjualan per hari dalam seminggu x jam · warna lebih pekat = lebih ramai · {periodLabel}</p>
              </div>
              <div className="overflow-x-auto p-4">
                {(() => {
                  const max = Math.max(1, ...analytics.heatmapSales.flat())
                  return (
                    <div className="min-w-[640px]">
                      <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}>
                        <div />
                        {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center text-[9px] text-zinc-500">{h}</div>)}
                        {analytics.heatmapSales.map((row, di) => (
                          <div key={di} className="contents">
                            <div className="pr-2 text-[10px] text-zinc-400 flex items-center">{DAY_LABELS[di]}</div>
                            {row.map((v, h) => (
                              <div
                                key={h}
                                title={`${DAY_LABELS[di]} ${String(h).padStart(2, '0')}:00 — ${formatRp(v)} (${analytics.heatmapOrders[di][h]} transaksi)`}
                                className="h-6 rounded-[3px] border border-zinc-800/50"
                                style={{ backgroundColor: v > 0 ? `rgba(99, 102, 241, ${0.12 + (v / max) * 0.88})` : 'transparent' }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {analytics && (
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800/60">
                <p className="text-sm font-bold text-zinc-100">Performa Kasir</p>
                <p className="text-[11px] text-zinc-500">{periodLabel}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-2 font-medium">Kasir</th>
                      <th className="px-4 py-2 font-medium text-right">Transaksi</th>
                      <th className="px-4 py-2 font-medium text-right">Penjualan</th>
                      <th className="px-4 py-2 font-medium text-right">Rata-rata</th>
                      <th className="px-4 py-2 font-medium text-right">Diskon</th>
                      <th className="px-4 py-2 font-medium text-right">Void</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.cashiers.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-zinc-600 text-sm">Tidak ada transaksi pada periode ini.</td></tr>
                    ) : analytics.cashiers.map((c, i) => (
                      <tr key={i} className="border-b border-zinc-800/30 last:border-0">
                        <td className="px-4 py-3 font-medium text-zinc-100">{c.name}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{c.orders}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatRp(c.sales)}</td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-400">{formatRp(c.averageTransaction)}</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-400/80">{c.discount > 0 ? formatRp(c.discount) : '—'}</td>
                        <td className={`px-4 py-3 text-right ${c.voided > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{c.voided}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800/60">
              <div>
                <p className="text-sm font-bold text-zinc-100">Data Transaksi</p>
                <p className="text-[11px] text-zinc-500">Rincian per order · {periodLabel} · {saleDetails.length} transaksi</p>
              </div>
              {canExport && (
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
                >
                  <Download className="h-3.5 w-3.5" /> Download CSV
                </button>
              )}
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
                    <th className="px-4 py-2 font-medium text-right">Pembulatan</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {saleDetails.length === 0 ? (
                    <tr><td colSpan={11} className="py-8 text-center text-zinc-600 text-sm">Tidak ada transaksi pada periode ini.</td></tr>
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
                      <td className="px-4 py-2.5 text-right font-mono text-violet-400/80">{d.rounding_amount > 0 ? formatRp(d.rounding_amount) : '—'}</td>
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

          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800/60">
              <div>
                <p className="text-sm font-bold text-zinc-100">Detail Item per Transaksi</p>
                <p className="text-[11px] text-zinc-500">Setiap item yang terjual · {periodLabel} · {itemRows.length} baris</p>
              </div>
              {canExport && (
                <button
                  onClick={handleExportItemsCsv}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
                >
                  <Download className="h-3.5 w-3.5" /> Download CSV
                </button>
              )}
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="border-b border-zinc-800/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-2 font-medium">Tanggal</th>
                    <th className="px-4 py-2 font-medium">Order #</th>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium">Kategori</th>
                    <th className="px-4 py-2 font-medium text-right">Qty</th>
                    <th className="px-4 py-2 font-medium text-right">Harga</th>
                    <th className="px-4 py-2 font-medium text-right">Diskon</th>
                    <th className="px-4 py-2 font-medium text-right">Subtotal</th>
                    <th className="px-4 py-2 font-medium">Kasir</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.length === 0 ? (
                    <tr><td colSpan={10} className="py-8 text-center text-zinc-600 text-sm">Tidak ada transaksi pada periode ini.</td></tr>
                  ) : itemRows.map((r, i) => (
                    <tr key={`${r.order_id}-${i}`} className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/20">
                      <td className="px-4 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{format(new Date(r.created_at), 'dd/MM/yy HH:mm')}</td>
                      <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{r.order_id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-2.5 font-medium text-zinc-100">{r.item_name}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs">{r.category}</td>
                      <td className="px-4 py-2.5 text-zinc-300 text-right">{r.qty}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-400">{formatRp(r.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-400/80">{r.discount_amount > 0 ? `-${formatRp(r.discount_amount)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-100">{formatRp(r.subtotal)}</td>
                      <td className="px-4 py-2.5 text-zinc-300">{r.cashier_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${r.status === 'voided' ? 'bg-red-950/30 text-red-400 border border-red-900/40' : 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40'}`}>
                          {r.status === 'voided' ? 'Voided' : 'Selesai'}
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
