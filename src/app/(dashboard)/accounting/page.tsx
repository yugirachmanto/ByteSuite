'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  BookOpen, 
  Receipt, 
  ArrowRightLeft, 
  FileSpreadsheet, 
  TrendingUp, 
  Plus,
  Loader2
} from 'lucide-react'
import Link from 'next/link'
import { formatRp } from '@/lib/format'

export default function AccountingPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    cashBank: 0,
    ar: 0,
    ap: 0,
    revenue: 0,
    expenses: 0
  })

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchAccountingSummary() {
      setLoading(true)
      
      // Fetch GL balances for specific categories
      // Kas/Bank: code starting with 1-1-001, 1-1-002
      // AR: 1-1-003
      // AP: 2-1-001
      // Revenue: starting with 4
      // Expenses: starting with 5 or 6

      const { data: entries } = await supabase
        .from('gl_entries')
        .select(`
          debit,
          credit,
          chart_of_accounts (code, type)
        `)
        .eq('outlet_id', selectedOutletId)

      const sums = {
        cashBank: 0,
        ar: 0,
        ap: 0,
        revenue: 0,
        expenses: 0
      }

      entries?.forEach(entry => {
        const coa = entry.chart_of_accounts as any
        const code = coa?.code || ''
        const type = coa?.type || ''
        const amount = (entry.debit || 0) - (entry.credit || 0)

        if (code.startsWith('1-1-001') || code.startsWith('1-1-002')) {
          sums.cashBank += amount
        } else if (code.startsWith('1-1-003')) {
          sums.ar += amount
        } else if (code.startsWith('2-1-001')) {
          // Liability usually has credit balance, so we negate for positive display
          sums.ap -= amount 
        }

        if (type === 'income') {
          // Income has credit balance
          sums.revenue -= amount
        } else if (type === 'expense') {
          sums.expenses += amount
        }
      })

      setSummary(sums)
      setLoading(false)
    }

    fetchAccountingSummary()
  }, [selectedOutletId, supabase])

  const modules = [
    {
      title: 'Chart of Accounts',
      desc: 'Manage your accounts, codes and classifications.',
      href: '/settings/coa',
      icon: BookOpen,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10'
    },
    {
      title: 'Journal Entries',
      desc: 'View and record manual journal transactions.',
      href: '/accounting/journal',
      icon: Receipt,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10'
    },
    {
      title: 'General Ledger',
      desc: 'Detailed transaction history for every account.',
      href: '/accounting/ledger',
      icon: ArrowRightLeft,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10'
    },
    {
      title: 'Financial Reports',
      desc: 'Profit & Loss, Balance Sheet and Trial Balance.',
      href: '/accounting/reports',
      icon: FileSpreadsheet,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10'
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Accounting Dashboard</h2>
          <p className="text-zinc-400 text-sm">Monitor your financial health and manage ledgers.</p>
        </div>
        <Link href="/accounting/journal/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Cash & Bank</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatRp(summary.cashBank)}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Total liquid assets</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatRp(summary.revenue)}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Life-time income</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Receivables (AR)</CardTitle>
            <div className="h-4 w-4 rounded-full bg-blue-500/20 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatRp(summary.ar)}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Uncollected income</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Payables (AP)</CardTitle>
            <div className="h-4 w-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatRp(summary.ap)}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Unpaid vendor invoices</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {modules.map((mod, idx) => (
          <Link key={idx} href={mod.href}>
            <Card className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 transition-all cursor-pointer group h-full">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${mod.bg} ${mod.color}`}>
                    <mod.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-zinc-100 group-hover:text-blue-400 transition-colors">
                      {mod.title}
                    </CardTitle>
                    <CardDescription className="text-zinc-400 mt-1">{mod.desc}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
