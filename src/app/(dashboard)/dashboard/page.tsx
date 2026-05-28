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
  const { selectedOutletId, outlets } = useOutlet()
  const { startDate, endDate } = useDateWindow()
  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId)

  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState<string | null>(null)
  const [stats, setStats] = useState({
    invoiceCount: 0,
    inventoryValue: 0,
    apTotal: 0,
    lowStockCount: 0,
  })
  const [recentInvoices, setRecentInvoices] = useState<any[]>([])

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
        const [
          { count: invCount },
          { data: invBalance },
          { data: apData },
          { data: recentInv },
        ] = await Promise.all([
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
            .select('grand_total, paid_amount')
            .eq('outlet_id', selectedOutletId)
            .eq('status', 'posted')
            .neq('payment_status', 'paid'),
          supabase
            .from('invoices')
            .select('*')
            .eq('outlet_id', selectedOutletId)
            .order('created_at', { ascending: false })
            .limit(6),
        ])

        const invValue =
          invBalance?.reduce(
            (acc, curr) => acc + (Number(curr.inventory_value) || 0),
            0
          ) || 0
        const lowStock =
          invBalance?.filter((i) => {
            const onHand = i.qty_on_hand || 0
            const level = (i.item_master as any)?.reorder_level || 0
            return onHand <= level
          }).length || 0
        const apSum =
          apData?.reduce(
            (acc, curr) =>
              acc +
              (Number(curr.grand_total) - (Number(curr.paid_amount) || 0)),
            0
          ) || 0

        setStats({
          invoiceCount: invCount || 0,
          inventoryValue: invValue,
          apTotal: apSum,
          lowStockCount: lowStock,
        })
        setRecentInvoices(recentInv || [])
      } catch (error) {
        console.error('Error fetching dashboard stats:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboardData()
  }, [selectedOutletId, supabase, startDate, endDate])

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
        </div>
      </div>
    </div>
  )
}
