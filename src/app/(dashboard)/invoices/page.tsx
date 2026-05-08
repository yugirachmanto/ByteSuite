'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Upload, Search, Filter, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchInvoices() {
      setLoading(true)
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('outlet_id', selectedOutletId)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setInvoices(data)
      }
      setLoading(false)
    }

    fetchInvoices()

    // Realtime subscription
    const channel = supabase
      .channel('invoice_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'invoices',
        filter: `outlet_id=eq.${selectedOutletId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setInvoices(prev => [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setInvoices(prev => prev.map(inv => inv.id === payload.new.id ? payload.new : inv))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedOutletId, supabase])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700">Pending</Badge>
      case 'extracted': return <Badge variant="outline" className="bg-blue-950/30 text-blue-400 border-blue-900/50">Extracted</Badge>
      case 'reviewed': return <Badge variant="outline" className="bg-purple-950/30 text-purple-400 border-purple-900/50">Reviewed</Badge>
      case 'posted': return <Badge variant="outline" className="bg-emerald-950/30 text-emerald-400 border-emerald-900/50">Posted</Badge>
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>
      case 'extraction_failed': return <Badge variant="destructive">Extraction Failed</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Invoice Pipeline</h2>
          <p className="text-zinc-400 text-sm">Capture, extract and post your vendor invoices.</p>
        </div>
        <Link href="/invoices/upload">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Upload className="mr-2 h-4 w-4" />
            Upload Invoice
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4 py-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input 
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm text-zinc-100 focus:border-zinc-700 focus:outline-none"
            placeholder="Search vendor or invoice no..."
          />
        </div>
        <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Date</TableHead>
              <TableHead className="text-zinc-400">Vendor</TableHead>
              <TableHead className="text-zinc-400">Invoice No</TableHead>
              <TableHead className="text-zinc-400">Grand Total</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-right text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  Loading invoices...
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  No invoices found. Start by uploading one.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-300">
                    {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd MMM yyyy') : format(new Date(invoice.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-100">{invoice.vendor || 'Extracting...'}</TableCell>
                  <TableCell className="text-zinc-400">{invoice.invoice_no || '-'}</TableCell>
                  <TableCell className="text-zinc-100 font-semibold">
                    {invoice.grand_total ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(invoice.grand_total) : '-'}
                  </TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell className="text-right">
                    {invoice.status === 'extracted' || invoice.status === 'extraction_failed' ? (
                      <Link href={`/invoices/${invoice.id}/review`}>
                        <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10">
                          Review
                        </Button>
                      </Link>
                    ) : (
                      <Button variant="ghost" size="icon" className="text-zinc-500">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    )}
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
