'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { formatRp } from '@/lib/format'
import { Loader2, Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AccountingReportsPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [loading, setLoading] = useState(true)
  
  const [coaBalances, setCoaBalances] = useState<any[]>([])

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchBalances() {
      setLoading(true)
      const { data: coa } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name, type')
        .eq('is_active', true)
      
      const { data: entries } = await supabase
        .from('gl_entries')
        .select('coa_id, debit, credit')
        .eq('outlet_id', selectedOutletId)

      const balances = coa?.map(acc => {
        const accEntries = entries?.filter(e => e.coa_id === acc.id) || []
        const totalDebit = accEntries.reduce((sum, e) => sum + (e.debit || 0), 0)
        const totalCredit = accEntries.reduce((sum, e) => sum + (e.credit || 0), 0)
        const net = totalDebit - totalCredit
        
        // Normal balance logic
        let balance = net
        if (['liability', 'equity', 'income'].includes(acc.type)) {
          balance = -net
        }

        return { ...acc, balance }
      })

      setCoaBalances(balances || [])
      setLoading(false)
    }

    fetchBalances()
  }, [selectedOutletId, supabase])

  const assets = coaBalances.filter(b => b.type === 'asset' && b.balance !== 0)
  const liabilities = coaBalances.filter(b => b.type === 'liability' && b.balance !== 0)
  const equity = coaBalances.filter(b => b.type === 'equity' && b.balance !== 0)
  const income = coaBalances.filter(b => b.type === 'income' && b.balance !== 0)
  const expenses = coaBalances.filter(b => b.type === 'expense' && b.balance !== 0)

  const totalAssets = assets.reduce((sum, b) => sum + b.balance, 0)
  const totalLiabilities = liabilities.reduce((sum, b) => sum + b.balance, 0)
  const totalEquity = equity.reduce((sum, b) => sum + b.balance, 0)
  const totalIncome = income.reduce((sum, b) => sum + b.balance, 0)
  const totalExpenses = expenses.reduce((sum, b) => sum + b.balance, 0)
  const netProfit = totalIncome - totalExpenses

  if (loading) return <div className="flex h-[60vh] items-center justify-center text-zinc-500"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Financial Reports</h2>
          <p className="text-zinc-400 text-sm">Official financial statements for your outlet.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pl" className="space-y-6">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="pl" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-zinc-100">
            Profit & Loss
          </TabsTrigger>
          <TabsTrigger value="bs" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-zinc-100">
            Balance Sheet
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pl">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="text-center border-b border-zinc-800">
              <CardTitle className="text-xl font-bold text-zinc-100">Statement of Profit & Loss</CardTitle>
              <p className="text-zinc-500 text-sm italic">Accumulated Period</p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="max-w-3xl mx-auto space-y-8">
                {/* Income */}
                <section>
                  <h4 className="text-emerald-400 font-bold uppercase text-xs tracking-widest mb-4">Revenues</h4>
                  <div className="space-y-2">
                    {income.map(b => (
                      <div key={b.id} className="flex justify-between text-sm py-1 border-b border-zinc-800/50">
                        <span className="text-zinc-300">{b.name}</span>
                        <span className="font-mono text-zinc-100">{formatRp(b.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-zinc-100 pt-2">
                      <span>Total Revenues</span>
                      <span className="underline decoration-double underline-offset-4">{formatRp(totalIncome)}</span>
                    </div>
                  </div>
                </section>

                {/* Expenses */}
                <section>
                  <h4 className="text-red-400 font-bold uppercase text-xs tracking-widest mb-4">Expenses</h4>
                  <div className="space-y-2">
                    {expenses.map(b => (
                      <div key={b.id} className="flex justify-between text-sm py-1 border-b border-zinc-800/50">
                        <span className="text-zinc-300">{b.name}</span>
                        <span className="font-mono text-zinc-100">{formatRp(b.balance)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-zinc-100 pt-2">
                      <span>Total Expenses</span>
                      <span className="underline decoration-zinc-800">{formatRp(totalExpenses)}</span>
                    </div>
                  </div>
                </section>

                {/* Net Profit */}
                <div className="bg-zinc-800/50 p-4 rounded-lg flex justify-between items-center mt-12 border border-zinc-700">
                  <span className="text-lg font-bold text-zinc-100 uppercase tracking-wider">Net Profit / (Loss)</span>
                  <span className={`text-2xl font-bold font-mono ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatRp(netProfit)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bs">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="text-center border-b border-zinc-800">
              <CardTitle className="text-xl font-bold text-zinc-100">Balance Sheet</CardTitle>
              <p className="text-zinc-500 text-sm italic">As of {new Date().toLocaleDateString()}</p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-2 gap-12">
                {/* Assets */}
                <div className="space-y-6">
                  <h4 className="text-blue-400 font-bold uppercase text-xs tracking-widest border-b border-blue-400/20 pb-2">Assets</h4>
                  <div className="space-y-2">
                    {assets.map(b => (
                      <div key={b.id} className="flex justify-between text-sm py-1">
                        <span className="text-zinc-300">{b.name}</span>
                        <span className="font-mono text-zinc-100">{formatRp(b.balance)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-zinc-100 pt-4 border-t border-zinc-800">
                    <span>Total Assets</span>
                    <span className="text-lg">{formatRp(totalAssets)}</span>
                  </div>
                </div>

                {/* Liabilities & Equity */}
                <div className="space-y-12">
                  {/* Liabilities */}
                  <div className="space-y-6">
                    <h4 className="text-amber-400 font-bold uppercase text-xs tracking-widest border-b border-amber-400/20 pb-2">Liabilities</h4>
                    <div className="space-y-2">
                      {liabilities.length === 0 ? <p className="text-zinc-600 text-xs italic">No liabilities record.</p> : liabilities.map(b => (
                        <div key={b.id} className="flex justify-between text-sm py-1">
                          <span className="text-zinc-300">{b.name}</span>
                          <span className="font-mono text-zinc-100">{formatRp(b.balance)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between font-bold text-zinc-100 pt-4 border-t border-zinc-800">
                      <span>Total Liabilities</span>
                      <span>{formatRp(totalLiabilities)}</span>
                    </div>
                  </div>

                  {/* Equity */}
                  <div className="space-y-6">
                    <h4 className="text-purple-400 font-bold uppercase text-xs tracking-widest border-b border-purple-400/20 pb-2">Equity</h4>
                    <div className="space-y-2">
                      {equity.map(b => (
                        <div key={b.id} className="flex justify-between text-sm py-1">
                          <span className="text-zinc-300">{b.name}</span>
                          <span className="font-mono text-zinc-100">{formatRp(b.balance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm py-1 font-medium text-emerald-400/80 italic">
                        <span>Retained Earnings (Net Profit)</span>
                        <span className="font-mono">{formatRp(netProfit)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between font-bold text-zinc-100 pt-4 border-t border-zinc-800">
                      <span>Total Equity</span>
                      <span>{formatRp(totalEquity + netProfit)}</span>
                    </div>
                  </div>

                  <div className="bg-zinc-800/80 p-4 rounded-lg flex justify-between items-center border border-zinc-700">
                    <span className="font-bold text-zinc-100 text-sm uppercase">Total Liab. + Equity</span>
                    <span className="text-xl font-bold font-mono text-zinc-100">
                      {formatRp(totalLiabilities + totalEquity + netProfit)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
