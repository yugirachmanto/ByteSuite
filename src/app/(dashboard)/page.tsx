'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  FileText, 
  Package, 
  TrendingUp, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  Loader2,
  DollarSign,
  ArrowRight
} from 'lucide-react'
import { formatRp } from '@/lib/format'
import Link from 'next/link'

export default function DashboardPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const selectedOutlet = outlets.find(o => o.id === selectedOutletId)
  
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    invoiceCount: 0,
    inventoryValue: 0,
    apTotal: 0,
    lowStockCount: 0
  })
  const [recentInvoices, setRecentInvoices] = useState<any[]>([])

  useEffect(() => {
    async function fetchDashboardData() {
      if (!selectedOutletId) return
      setLoading(true)

      try {
        // 1. Fetch Stats in Parallel
        const [
          { count: invCount },
          { data: invBalance },
          { data: apData },
          { data: recentInv }
        ] = await Promise.all([
          supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('outlet_id', selectedOutletId),
          supabase.from('inventory_balance').select('inventory_value, qty_on_hand').eq('outlet_id', selectedOutletId),
          supabase.from('invoices').select('grand_total, paid_amount').eq('outlet_id', selectedOutletId).eq('status', 'posted').neq('payment_status', 'paid'),
          supabase.from('invoices').select('*').eq('outlet_id', selectedOutletId).order('created_at', { ascending: false }).limit(5)
        ])

        // Calculate metrics
        const invValue = invBalance?.reduce((acc, curr) => acc + (Number(curr.inventory_value) || 0), 0) || 0
        const lowStock = invBalance?.filter(i => (i.qty_on_hand || 0) < 10).length || 0
        const apSum = apData?.reduce((acc, curr) => acc + (Number(curr.grand_total) - (Number(curr.paid_amount) || 0)), 0) || 0

        setStats({
          invoiceCount: invCount || 0,
          inventoryValue: invValue,
          apTotal: apSum,
          lowStockCount: lowStock
        })
        setRecentInvoices(recentInv || [])
      } catch (error) {
        console.error('Error fetching dashboard stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [selectedOutletId, supabase])

  const dashboardCards = [
    { 
      name: 'Total Invoices', 
      value: stats.invoiceCount.toString(), 
      icon: FileText, 
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      desc: 'All recorded invoices'
    },
    { 
      name: 'Inventory Value', 
      value: formatRp(stats.inventoryValue), 
      icon: Package, 
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      desc: 'Current stock valuation'
    },
    { 
      name: 'Accounts Payable', 
      value: formatRp(stats.apTotal), 
      icon: DollarSign, 
      color: 'text-red-400',
      bg: 'bg-red-400/10',
      desc: 'Outstanding vendor debt'
    },
    { 
      name: 'Low Stock Items', 
      value: stats.lowStockCount.toString(), 
      icon: AlertCircle, 
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      desc: 'Items needing reorder'
    },
  ]

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider border border-blue-500/20">
            Overview
          </span>
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-100">
          Hello, welcome back!
        </h2>
        <p className="text-zinc-400 text-sm">
          Here's what's happening at <span className="font-medium text-zinc-200">{selectedOutlet?.name || 'your outlet'}</span> today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {dashboardCards.map((stat) => (
          <Card key={stat.name} className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm relative overflow-hidden group hover:border-zinc-700 transition-all duration-300">
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${stat.bg} blur-3xl opacity-20 group-hover:opacity-40 transition-opacity`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                {stat.name}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-100 font-mono tracking-tight">
                {loading ? <Loader2 className="h-6 w-6 animate-spin text-zinc-700" /> : stat.value}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1 font-medium italic">{stat.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Invoices */}
        <Card className="col-span-4 border-zinc-800 bg-zinc-900/30 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-zinc-100">Recent Transactions</CardTitle>
              <CardDescription className="text-zinc-500">Latest invoice updates and postings.</CardDescription>
            </div>
            <Link href="/invoices">
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100 group">
                View All <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[240px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-800" />
              </div>
            ) : recentInvoices.length === 0 ? (
              <div className="flex h-[240px] flex-col items-center justify-center text-zinc-600 gap-2">
                <Clock className="h-8 w-8 opacity-20" />
                <p className="text-sm">No recent activity found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/50 hover:bg-zinc-950/60 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${inv.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {inv.status === 'posted' ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">{inv.vendor || 'Unknown Vendor'}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">#{inv.invoice_no || 'DRAFT'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-zinc-100 font-mono">{formatRp(inv.grand_total)}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${inv.status === 'posted' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {inv.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Health & Quick Actions */}
        <div className="col-span-3 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-zinc-100">System Status</CardTitle>
              <CardDescription className="text-zinc-500">Live operational monitoring.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                <div className="flex items-center gap-4 group">
                  <div className="relative">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                  <div className="flex-1 text-sm text-zinc-300 font-medium group-hover:text-zinc-100 transition-colors">Database Engine</div>
                  <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-[10px] text-emerald-500 font-bold border border-emerald-500/20 uppercase tracking-wider">Online</div>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="relative">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                  <div className="flex-1 text-sm text-zinc-300 font-medium group-hover:text-zinc-100 transition-colors">Storage Infrastructure</div>
                  <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-[10px] text-emerald-500 font-bold border border-emerald-500/20 uppercase tracking-wider">Online</div>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="relative">
                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  </div>
                  <div className="flex-1 text-sm text-zinc-300 font-medium group-hover:text-zinc-100 transition-colors">AI Extraction Engine</div>
                  <div className="px-2 py-0.5 rounded bg-blue-500/10 text-[10px] text-blue-500 font-bold border border-blue-500/20 uppercase tracking-wider">Ready</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 backdrop-blur-sm overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10" />
            <CardHeader>
              <CardTitle className="text-zinc-100">Quick Start</CardTitle>
              <CardDescription className="text-zinc-500">Fast-track common tasks.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Link href="/invoices/upload" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-900 transition-all group">
                <FileText className="h-6 w-6 text-blue-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">New Invoice</span>
              </Link>
              <Link href="/accounting/ap" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-red-500/50 hover:bg-zinc-900 transition-all group">
                <DollarSign className="h-6 w-6 text-red-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Pay Vendors</span>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
