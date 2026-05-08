'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Plus, Upload, Search, Filter, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { toast } from 'sonner'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { selectedOutletId } = useOutlet()
  const router = useRouter()
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
        // Fetch user profiles for all unique created_by IDs
        const userIds = [...new Set(data.map(inv => inv.created_by).filter(Boolean))]
        let profileMap: Record<string, string> = {}
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', userIds)
          profiles?.forEach(p => { profileMap[p.id] = p.full_name })
        }
        setInvoices(data.map(inv => ({ ...inv, _author: profileMap[inv.created_by] || 'Unknown' })))
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

  const deleteInvoice = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click navigation
    if (!confirm('Are you sure you want to permanently delete this invoice and all related inventory data? This cannot be undone.')) return

    try {
      // Delete in FK dependency order
      await supabase.from('stock_batches').delete().eq('outlet_id', selectedOutletId)
        .in('invoice_line_id', 
          (await supabase.from('invoice_lines').select('id').eq('invoice_id', invoiceId)).data?.map(l => l.id) || []
        )
      await supabase.from('stock_ledger').delete().eq('reference_id', invoiceId).eq('reference_type', 'invoice')
      await supabase.from('inventory_balance') // Only remove if we need to reverse — skip for safety
      await supabase.from('invoice_lines').delete().eq('invoice_id', invoiceId)
      const { error } = await supabase.from('invoices').delete().eq('id', invoiceId)
      if (error) throw error

      setInvoices(prev => prev.filter(inv => inv.id !== invoiceId))
      toast.success('Invoice deleted successfully.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete invoice')
    }
  }

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
              <TableHead className="text-zinc-400">Uploaded By</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-right text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">
                  Loading invoices...
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">
                  No invoices found. Start by uploading one.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow 
                  key={invoice.id} 
                  className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                  onClick={() => router.push(`/invoices/${invoice.id}/review`)}
                >
                  <TableCell className="text-zinc-300">
                    {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd MMM yyyy') : format(new Date(invoice.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-100">{invoice.vendor || 'Extracting...'}</TableCell>
                  <TableCell className="text-zinc-400">{invoice.invoice_no || '-'}</TableCell>
                  <TableCell className="text-zinc-100 font-semibold">
                    {invoice.grand_total ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(invoice.grand_total) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-300 font-medium">
                        {(invoice._author || 'U').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-zinc-400">{invoice._author || 'Unknown'}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {(invoice.status === 'extracted' || invoice.status === 'pending') && (
                        <Link href={`/invoices/${invoice.id}/review`}>
                          <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10">
                            Review
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-zinc-600 hover:text-red-400 hover:bg-red-400/10"
                        onClick={(e) => deleteInvoice(invoice.id, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
