'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'
import { Loader2, ArrowRightLeft } from 'lucide-react'

export default function LedgerPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all')
  const [entries, setEntries] = useState<any[]>([])
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    async function fetchAccounts() {
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      setAccounts(data || [])
    }
    fetchAccounts()
  }, [supabase])

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchLedger() {
      setLoading(true)
      let query = supabase
        .from('gl_entries')
        .select(`
          *,
          chart_of_accounts (code, name, type)
        `)
        .eq('outlet_id', selectedOutletId)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true })

      if (selectedAccountId !== 'all') {
        query = query.eq('coa_id', selectedAccountId)
      }

      const { data } = await query

      if (data) {
        let runningBalance = 0
        const mapped = data.map(entry => {
          const coa = entry.chart_of_accounts as any
          const type = coa?.type
          // Asset and Expense: Debit increases, Credit decreases
          // Liability, Equity, Income: Credit increases, Debit decreases
          const isDebitNormal = type === 'asset' || type === 'expense'
          
          const impact = (entry.debit || 0) - (entry.credit || 0)
          runningBalance += impact
          
          return {
            ...entry,
            runningBalance: isDebitNormal ? runningBalance : -runningBalance
          }
        })
        setEntries(mapped.reverse()) // Show latest first in table, but calculated with chron order
        setBalance(runningBalance)
      }
      setLoading(false)
    }

    fetchLedger()
  }, [selectedOutletId, selectedAccountId, supabase])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">General Ledger</h2>
          <p className="text-zinc-400 text-sm">Detailed transaction history for every account.</p>
        </div>
      </div>

      <div className="flex items-center gap-4 py-4">
        <div className="w-72">
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100">
              <SelectValue placeholder="Select Account..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-h-[300px]">
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
              {selectedAccountId === 'all' ? 'Consolidated Transactions' : `History: ${accounts.find(a => a.id === selectedAccountId)?.name}`}
            </CardTitle>
            {selectedAccountId !== 'all' && (
              <div className="text-right">
                <span className="text-xs text-zinc-500 block">Current Balance</span>
                <span className="text-lg font-bold text-emerald-400">{formatRp(Math.abs(balance))}</span>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="border-zinc-800">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-zinc-400">Date</TableHead>
                  {selectedAccountId === 'all' && <TableHead className="text-zinc-400">Account</TableHead>}
                  <TableHead className="text-zinc-400">Description</TableHead>
                  <TableHead className="text-zinc-400 text-right">Debit</TableHead>
                  <TableHead className="text-zinc-400 text-right">Credit</TableHead>
                  <TableHead className="text-zinc-400 text-right">Cumulative</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={selectedAccountId === 'all' ? 6 : 5} className="h-24 text-center text-zinc-500">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={selectedAccountId === 'all' ? 6 : 5} className="h-24 text-center text-zinc-500">
                      No transactions found for this account.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.id} className="border-zinc-800 hover:bg-zinc-800/30">
                      <TableCell className="text-zinc-400 text-xs">
                        {format(new Date(entry.entry_date), 'dd MMM yyyy')}
                      </TableCell>
                      {selectedAccountId === 'all' && (
                        <TableCell>
                          <span className="text-zinc-100 text-sm font-medium">{entry.chart_of_accounts?.name}</span>
                        </TableCell>
                      )}
                      <TableCell className="text-zinc-300 text-sm">
                        {entry.description}
                      </TableCell>
                      <TableCell className="text-right font-mono text-zinc-400">
                        {entry.debit > 0 ? formatRp(entry.debit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-zinc-400">
                        {entry.credit > 0 ? formatRp(entry.credit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-zinc-100">
                        {formatRp(Math.abs(entry.runningBalance))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
