'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useDateWindow } from '@/lib/contexts/date-window-context'
import { Button } from '@/components/ui/button'
import {
  FileText,
  Package,
  AlertCircle,
  Clock,
  CheckCircle2,
  Loader2,
  DollarSign,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  UploadCloud,
  CreditCard,
  Zap,
  Activity,
} from 'lucide-react'
import { formatRp } from '@/lib/format'
import Link from 'next/link'

export default function DashboardPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets, posEnabled } = useOutlet()
  const { startDate, endDate } = useDateWindow()
  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId)

  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState<string | null>(null)
  const [stats, setStats] = useState({
    invoiceCount: 0,
    inventoryValue: 0,
    apTotal: 0,
    lowStockCount: 0,
    apAging: { current: 0, days1_30: 0, days31_60: 0, days60plus: 0 }
  })
  const [posStats, setPosStats] = useState({ revenue: 0, orderCount: 0 })
  const [recentInvoices, setRecentInvoices] = useState<any[]>([])
  const [recentMovements, setRecentMovements] = useState<any[]>([])

  useEffect(() => {
    async function fetchUserName() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      setUserName(profile?.full_name?.split(' ')[0] || null)
    }
    fetchUserName()
  }, [supabase])

  useEffect(() => {
    async function fetchDashboardData() {
      if (!selectedOutletId) return
      setLoading(true)
      const startIso = startDate.toISOString()
      const endIso = endDate.toISOString()

      try {
        const fetchPromises: any[] = [
          supabase
            .from('invoices')
            .select('*', { count: 'exact', head: true })
            .eq('outlet_id', selectedOutletId)
            .or(
              `and(invoice_date.gte.${startIso},invoice_date.lte.${endIso}),and(invoice_date.is.null,created_at.gte.${startIso},created_at.lte.${endIso})`
            ),
          supabase
            .from('inventory_balance')
            .select(`inventory_value, qty_on_hand, item_master (reorder_level)`)
            .eq('outlet_id', selectedOutletId),
          supabase
            .from('invoices')
            .select('grand_total, paid_amount, due_date')
            .eq('outlet_id', selectedOutletId)
            .eq('status', 'posted')
            .neq('payment_status', 'paid'),
          supabase
            .from('invoices')
            .select('*')
            .eq('outlet_id', selectedOutletId)
            .order('created_at', { ascending: false })
            .limit(6),
          supabase
            .from('stock_ledger')
            .select(`
              id, created_at, txn_type, qty,
              item_master ( name, unit )
            `)
            .eq('outlet_id', selectedOutletId)
            .order('created_at', { ascending: false })
            .limit(5),
        ]

        if (posEnabled) {
          fetchPromises.push(
            supabase
              .from('pos_orders')
              .select('total_amount', { count: 'exact' })
              .eq('outlet_id', selectedOutletId)
              .eq('status', 'completed')
              .gte('created_at', startIso)
              .lte('created_at', endIso)
          )
        }

        const results = await Promise.all(fetchPromises)

        const [
          { count: invCount },
          { data: invBalance },
          { data: apData },
          { data: recentInv },
          { data: recentMov },
        ] = results

        let posRev = 0
        let posCount = 0
        if (posEnabled && results[5]) {
          const { data: posData, count: pCount } = results[5]
          posCount = pCount || 0
          posRev = posData?.reduce((acc: number, curr: any) => acc + (Number(curr.total_amount) || 0), 0) || 0
        }

        const invValue =
          invBalance?.reduce(
            (acc: number, curr: any) => acc + (Number(curr.inventory_value) || 0),
            0
          ) || 0
        const lowStock =
          invBalance?.filter((i) => {
            const onHand = i.qty_on_hand || 0
            const level = (i.item_master as any)?.reorder_level || 0
            return onHand <= level
          }).length || 0
        let apSum = 0
        let current = 0
        let days1_30 = 0
        let days31_60 = 0
        let days60plus = 0

        apData?.forEach((inv) => {
          const balance = Number(inv.grand_total) - (Number(inv.paid_amount) || 0)
          apSum += balance

          if (!inv.due_date) {
            current += balance
            return
          }
          const due = new Date(inv.due_date)
          due.setHours(0,0,0,0)
          const today = new Date()
          today.setHours(0,0,0,0)
          const diffDays = Math.ceil((today.getTime() - due.getTime()) / (1000 * 3600 * 24))

          if (diffDays <= 0) {
            current += balance
          } else if (diffDays <= 30) {
            days1_30 += balance
          } else if (diffDays <= 60) {
            days31_60 += balance
          } else {
            days60plus += balance
          }
        })

        setStats({
          invoiceCount: invCount || 0,
          inventoryValue: invValue,
          apTotal: apSum,
          lowStockCount: lowStock,
          apAging: { current, days1_30, days31_60, days60plus }
        })
        setPosStats({ revenue: posRev, orderCount: posCount })
        setRecentInvoices(recentInv || [])
        setRecentMovements(recentMov || [])
      } catch (error) {
        console.error('Error fetching dashboard stats:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboardData()
  }, [selectedOutletId, supabase, startDate, endDate, posEnabled])

  const statCards = [
    {
      name: 'Invoices',
      value: stats.invoiceCount.toString(),
      desc: 'This period',
      icon: FileText,
      gradient: 'from-blue-600/20 to-indigo-600/10',
      border: 'border-blue-500/20 hover:border-blue-500/40',
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-400',
      glow: 'bg-blue-500/10',
      trend: null,
    },
    {
      name: 'Inventory Value',
      value: formatRp(stats.inventoryValue),
      desc: 'Current valuation',
      icon: Package,
      gradient: 'from-emerald-600/20 to-teal-600/10',
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-400',
      glow: 'bg-emerald-500/10',
      trend: 'up',
    },
    {
      name: 'Accounts Payable',
      value: formatRp(stats.apTotal),
      desc: 'Outstanding debt',
      icon: DollarSign,
      gradient: 'from-red-600/20 to-rose-600/10',
      border: 'border-red-500/20 hover:border-red-500/40',
      iconBg: 'bg-red-500/15',
      iconColor: 'text-red-400',
      glow: 'bg-red-500/10',
      trend: 'down',
    },
    {
      name: 'Low Stock',
      value: stats.lowStockCount.toString(),
      desc: 'Items to reorder',
      icon: AlertCircle,
      gradient: 'from-amber-600/20 to-orange-600/10',
      border:
        stats.lowStockCount > 0
          ? 'border-amber-500/40 hover:border-amber-500/60'
          : 'border-amber-500/20 hover:border-amber-500/40',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-400',
      glow: 'bg-amber-500/10',
      trend: null,
    },
  ]

  const quickActions = [
    {
      label: 'Upload Invoice',
      href: '/invoices/upload',
      icon: UploadCloud,
      color: 'text-blue-400',
      border: 'hover:border-blue-500/50 hover:bg-blue-500/5',
    },
    {
      label: 'Pay Vendors',
      href: '/accounting/ap',
      icon: CreditCard,
      color: 'text-violet-400',
      border: 'hover:border-violet-500/50 hover:bg-violet-500/5',
    },
    {
      label: 'View Inventory',
      href: '/inventory',
      icon: Package,
      color: 'text-emerald-400',
      border: 'hover:border-emerald-500/50 hover:bg-emerald-500/5',
    },
    {
      label: 'Reports',
      href: '/reports',
      icon: Activity,
      color: 'text-amber-400',
      border: 'hover:border-amber-500/50 hover:bg-amber-500/5',
    },
  ]

  const getHour = () => new Date().getHours()
  const greeting =
    getHour() < 12 ? 'Good morning' : getHour() < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── Hero Header ───────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-7">
        {/* Background glows */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 right-40 h-48 w-48 rounded-full bg-violet-600/8 blur-2xl" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                Live Overview
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
              {greeting}{userName ? `, ${userName}` : ''}!
            </h2>
            <p className="text-sm text-zinc-400">
              Here&apos;s what&apos;s happening at{' '}
              <span className="font-semibold text-zinc-200">
                {selectedOutlet?.name || 'your outlet'}
              </span>{' '}
              today.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
              <Zap className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Stat Cards ────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br ${stat.gradient} ${stat.border} p-5 backdrop-blur-sm transition-all duration-300`}
          >
            {/* Corner glow */}
            <div
              className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${stat.glow} blur-2xl transition-opacity duration-300 opacity-60 group-hover:opacity-100`}
            />

            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className={`rounded-lg p-2 ${stat.iconBg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
                </div>
                {stat.trend === 'up' && (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500 opacity-60" />
                )}
                {stat.trend === 'down' && (
                  <TrendingDown className="h-3.5 w-3.5 text-red-400 opacity-60" />
                )}
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                  {stat.name}
                </p>
                <div className="text-2xl font-bold tracking-tight text-zinc-100 font-mono">
                  {loading ? (
                    <div className="h-7 w-24 animate-pulse rounded bg-zinc-800" />
                  ) : (
                    stat.value
                  )}
                </div>
                <p className="mt-1 text-[10px] text-zinc-600 font-medium">{stat.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Content Grid ─────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-7">

        {/* Recent Transactions */}
        <div className="lg:col-span-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Recent Transactions</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Latest invoice updates</p>
            </div>
            <Link href="/invoices">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-zinc-400 hover:text-zinc-100 group gap-1.5"
              >
                View all
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>

          <div className="p-4 space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-zinc-800/40"
                />
              ))
            ) : recentInvoices.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-zinc-600 gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
                  <Clock className="h-5 w-5 opacity-40" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">No recent activity</p>
                  <p className="text-xs text-zinc-700 mt-0.5">Invoices will appear here once created</p>
                </div>
                <Link href="/invoices/upload">
                  <Button size="sm" className="mt-1 h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs">
                    Upload first invoice
                  </Button>
                </Link>
              </div>
            ) : (
              recentInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}/review`}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-950/50 border border-zinc-800/40 hover:border-zinc-700/60 hover:bg-zinc-900/70 transition-all duration-150 group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        inv.status === 'posted'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : inv.status === 'rejected'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-amber-500/10 text-amber-500'
                      }`}
                    >
                      {inv.status === 'posted' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-200 group-hover:text-zinc-100 transition-colors">
                        {inv.vendor || 'Unknown Vendor'}
                      </p>
                      <p className="text-[10px] text-zinc-600 font-mono">
                        #{inv.invoice_no || 'DRAFT'} ·{' '}
                        {inv.invoice_date
                          ? new Date(inv.invoice_date).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                            })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-zinc-100 font-mono">
                      {formatRp(inv.grand_total)}
                    </p>
                    <p
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        inv.status === 'posted'
                          ? 'text-emerald-500'
                          : inv.status === 'rejected'
                          ? 'text-red-400'
                          : 'text-amber-500'
                      }`}
                    >
                      {inv.status}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-3 space-y-5">

          {/* Quick Actions */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800/60">
              <h3 className="text-sm font-bold text-zinc-100">Quick Actions</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Fast-track common tasks</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={`flex flex-col items-center gap-2.5 rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-3 py-4 transition-all duration-150 group ${action.border}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 group-hover:scale-110 transition-transform duration-150">
                    <action.icon className={`h-4 w-4 ${action.color}`} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors text-center">
                    {action.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* POS Analytics */}
          {posEnabled && (
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden mb-5">
              <div className="px-6 py-4 border-b border-zinc-800/60 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">POS Analytics</h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Point of Sale performance</p>
                </div>
                <CreditCard className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="p-4 space-y-2">
                {[
                  {
                    label: 'Total Revenue',
                    value: formatRp(posStats.revenue),
                    icon: DollarSign,
                    iconBg: 'bg-emerald-500/10',
                    iconColor: 'text-emerald-400',
                    valueColor: 'text-zinc-100',
                  },
                  {
                    label: 'Completed Orders',
                    value: posStats.orderCount.toString(),
                    icon: Activity,
                    iconBg: 'bg-blue-500/10',
                    iconColor: 'text-blue-400',
                    valueColor: 'text-zinc-100',
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${row.iconBg}`}>
                        <row.icon className={`h-3.5 w-3.5 ${row.iconColor}`} />
                      </div>
                      <span className="text-xs text-zinc-400">{row.label}</span>
                    </div>
                    <span className={`text-xs font-bold font-mono ${row.valueColor}`}>
                      {loading ? (
                        <div className="h-4 w-16 animate-pulse rounded bg-zinc-800" />
                      ) : (
                        row.value
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financials Summary */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800/60">
              <h3 className="text-sm font-bold text-zinc-100">Financials</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Real-time key metrics</p>
            </div>
            <div className="p-4 space-y-2">
              {[
                {
                  label: 'Outstanding Payables',
                  value: formatRp(stats.apTotal),
                  icon: DollarSign,
                  iconBg: 'bg-red-500/10',
                  iconColor: 'text-red-400',
                  valueColor: 'text-red-400',
                },
                {
                  label: 'Inventory Value',
                  value: formatRp(stats.inventoryValue),
                  icon: Package,
                  iconBg: 'bg-emerald-500/10',
                  iconColor: 'text-emerald-400',
                  valueColor: 'text-zinc-100',
                },
                {
                  label: 'Low Stock Alerts',
                  value: stats.lowStockCount > 0 ? `${stats.lowStockCount} items` : 'All good',
                  icon: AlertCircle,
                  iconBg: 'bg-amber-500/10',
                  iconColor: 'text-amber-400',
                  valueColor:
                    stats.lowStockCount > 0 ? 'text-amber-400' : 'text-emerald-400',
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/40"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${row.iconBg}`}>
                      <row.icon className={`h-3.5 w-3.5 ${row.iconColor}`} />
                    </div>
                    <span className="text-xs text-zinc-400">{row.label}</span>
                  </div>
                  <span className={`text-xs font-bold font-mono ${row.valueColor}`}>
                    {loading ? (
                      <div className="h-4 w-16 animate-pulse rounded bg-zinc-800" />
                    ) : (
                      row.value
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* AP Aging Widget */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">AP Aging</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">Payables by due date</p>
              </div>
              <DollarSign className="h-4 w-4 text-zinc-500" />
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: 'Current (Not Due)', amount: stats.apAging.current, color: 'text-emerald-400', bar: 'bg-emerald-500' },
                { label: '1 - 30 Days Overdue', amount: stats.apAging.days1_30, color: 'text-amber-400', bar: 'bg-amber-500' },
                { label: '31 - 60 Days Overdue', amount: stats.apAging.days31_60, color: 'text-orange-400', bar: 'bg-orange-500' },
                { label: '> 60 Days Overdue', amount: stats.apAging.days60plus, color: 'text-red-400', bar: 'bg-red-500' }
              ].map((bucket) => {
                const max = Math.max(stats.apTotal, 1);
                const pct = (bucket.amount / max) * 100;
                return (
                  <div key={bucket.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{bucket.label}</span>
                      <span className={`font-mono font-bold ${bucket.amount > 0 ? bucket.color : 'text-zinc-600'}`}>
                        {formatRp(bucket.amount)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800/50 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${bucket.bar} rounded-full transition-all duration-1000 ${bucket.amount > 0 ? 'opacity-100' : 'opacity-0'}`} 
                        style={{ width: `${pct}%` }} 
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent Inventory Movements */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Inventory Movements</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">Latest stock changes</p>
              </div>
              <Link href="/inventory/ledger">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400 hover:text-zinc-100 group gap-1.5">
                  Ledger
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </div>
            <div className="p-4 space-y-2">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-zinc-800/40" />
                ))
              ) : recentMovements.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-zinc-600 gap-2">
                  <Package className="h-5 w-5 opacity-40" />
                  <p className="text-sm font-medium">No recent movements</p>
                </div>
              ) : (
                recentMovements.map((mov) => (
                  <div key={mov.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-950/50 border border-zinc-800/40 hover:border-zinc-700/60 hover:bg-zinc-900/70 transition-all duration-150">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mov.qty > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        <Package className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">
                          {mov.item_master?.name}
                        </p>
                        <p className="text-[10px] text-zinc-600 font-mono">
                          {new Date(mov.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold font-mono ${mov.qty > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {mov.qty > 0 ? '+' : ''}{mov.qty} <span className="text-[10px] font-normal text-zinc-500">{mov.item_master?.unit}</span>
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        {mov.txn_type}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
