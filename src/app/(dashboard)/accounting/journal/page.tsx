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
import { Button } from '@/components/ui/button'
import { Plus, Search, Filter, ArrowRightLeft, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default function JournalPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<any[]>([])

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchEntries() {
      setLoading(true)
      const { data, error } = await supabase
        .from('gl_entries')
        .select(`
          *,
          chart_of_accounts (code, name)
        `)
        .eq('outlet_id', selectedOutletId)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (data) {
        setEntries(data)
      }
      setLoading(false)
    }

    fetchEntries()
  }, [selectedOutletId, supabase])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Journal Entries</h2>
          <p className="text-zinc-400 text-sm">Review all financial transactions recorded in the ledger.</p>
        </div>
        <Link href="/accounting/journal/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4 py-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input 
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm text-zinc-100 focus:border-zinc-700 focus:outline-none"
            placeholder="Search description or account..."
          />
        </div>
        <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Date</TableHead>
              <TableHead className="text-zinc-400">Account</TableHead>
              <TableHead className="text-zinc-400">Description</TableHead>
              <TableHead className="text-zinc-400 text-right">Debit</TableHead>
              <TableHead className="text-zinc-400 text-right">Credit</TableHead>
              <TableHead className="text-zinc-400">Ref</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  Loading entries...
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  No entries found.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-300">
                    {format(new Date(entry.entry_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-zinc-100 font-medium">{entry.chart_of_accounts?.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{entry.chart_of_accounts?.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-400 max-w-[200px] truncate">
                    {entry.description || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-400">
                    {entry.debit > 0 ? formatRp(entry.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-400">
                    {entry.credit > 0 ? formatRp(entry.credit) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-zinc-800 text-[10px] text-zinc-400 border-zinc-700 uppercase">
                      {entry.reference_type || 'Manual'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
