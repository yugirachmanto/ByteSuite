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
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'
import { Loader2, ArrowRightLeft, FileText, Download } from 'lucide-react'
import { toast } from 'sonner'

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
        // Collect unique invoice IDs for GL entries originating from invoices
        const invoiceIds = Array.from(new Set(
          data
            .filter(entry => entry.reference_type === 'invoice' && entry.reference_id)
            .map(entry => entry.reference_id)
        ))

        const invoiceMap: Record<string, string> = {}
        if (invoiceIds.length > 0) {
          const { data: invData } = await supabase
            .from('invoices')
            .select('id, image_url')
            .in('id', invoiceIds)
          
          if (invData) {
            invData.forEach(inv => {
              if (inv.image_url) {
                invoiceMap[inv.id] = inv.image_url
              }
            })
          }
        }

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
            runningBalance: isDebitNormal ? runningBalance : -runningBalance,
            imageUrl: entry.reference_type === 'invoice' ? (invoiceMap[entry.reference_id] || null) : null
          }
        })
        setEntries(mapped.reverse()) // Show latest first in table, but calculated with chron order
        setBalance(runningBalance)
      }
      setLoading(false)
    }

    fetchLedger()
  }, [selectedOutletId, selectedAccountId, supabase])

  const exportToCSV = () => {
    if (entries.length === 0) {
      toast.error('No data to export')
      return
    }

    // CSV Headers
    const headers = [
      'Date',
      'Account Code',
      'Account Name',
      'Description',
      'Debit',
      'Credit',
      'Cumulative Balance'
    ]

    // Map entries to rows
    const rows = entries.map(entry => {
      const coa = entry.chart_of_accounts
      return [
        format(new Date(entry.entry_date), 'yyyy-MM-dd'),
        `"${coa?.code || ''}"`,
        `"${coa?.name || ''}"`,
        `"${(entry.description || '').replace(/"/g, '""')}"`,
        entry.debit || 0,
        entry.credit || 0,
        Math.abs(entry.runningBalance)
      ]
    })

    // Combine headers and rows
    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    
    // Friendly filename based on account
    const accountName = selectedAccountId === 'all' 
      ? 'All_Accounts' 
      : (accounts.find(a => a.id === selectedAccountId)?.name || 'Account')
    const fileName = `General_Ledger_${accountName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.csv`
    
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast.success('Ledger exported successfully!')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">General Ledger</h2>
          <p className="text-zinc-400 text-sm">Detailed transaction history for every account.</p>
        </div>
      </div>

      <div className="flex items-center justify-between py-4">
        <div className="w-72">
          <Select value={selectedAccountId} onValueChange={(val) => setSelectedAccountId(val || 'all')}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100">
              <SelectValue placeholder="Select Account...">
                {selectedAccountId === 'all' ? (
                  'All Accounts'
                ) : (
                  accounts.find(a => a.id === selectedAccountId)
                    ? `${accounts.find(a => a.id === selectedAccountId)?.code} - ${accounts.find(a => a.id === selectedAccountId)?.name}`
                    : 'Select Account...'
                )}
              </SelectValue>
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
        <Button 
          variant="outline" 
          onClick={exportToCSV}
          className="border-zinc-800 bg-zinc-900 text-zinc-300 text-xs font-semibold gap-2 h-9"
          disabled={loading || entries.length === 0}
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
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
            <div className="max-h-[calc(100vh-250px)] overflow-y-auto rounded-b-xl">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur shadow-sm border-zinc-800">
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
                        <div className="flex items-center gap-2">
                          <span>{entry.description}</span>
                          {entry.imageUrl && (
                            <a 
                              href={entry.imageUrl} 
                              target="_blank" 
                              rel="noreferrer" 
                              title="View Invoice digital copy"
                              className="text-indigo-400 hover:text-indigo-300 transition-colors inline-flex items-center"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
