'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useDateWindow } from '@/lib/contexts/date-window-context'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Upload, Search, Trash2, X, ChevronDown, BadgeCheck } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { formatRp } from '@/lib/format'

const ALL_STATUSES = ['pending', 'extracted', 'reviewed', 'posted', 'rejected', 'extraction_failed'] as const
type Status = typeof ALL_STATUSES[number]

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  extracted: 'Extracted',
  reviewed: 'Approved',
  posted: 'Posted',
  rejected: 'Rejected',
  extraction_failed: 'Failed',
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':          return <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700">Pending</Badge>
    case 'extracted':        return <Badge variant="outline" className="bg-blue-950/30 text-blue-400 border-blue-900/50">Extracted</Badge>
    case 'reviewed':         return <Badge variant="outline" className="bg-purple-950/30 text-purple-400 border-purple-900/50">Approved</Badge>
    case 'posted':           return <Badge variant="outline" className="bg-emerald-950/30 text-emerald-400 border-emerald-900/50">Posted</Badge>
    case 'rejected':         return <Badge variant="destructive">Rejected</Badge>
    case 'extraction_failed':return <Badge variant="destructive">Failed</Badge>
    default:                 return <Badge variant="outline">{status}</Badge>
  }
}

export default function InvoicesPage() {
  const [invoices, setInvoices]       = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | ''>('')
  const [filterOpen, setFilterOpen]   = useState(false)

  const { selectedOutletId } = useOutlet()
  const { startDate, endDate } = useDateWindow()
  const router = useRouter()
  const supabase = createClient()

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchInvoices() {
      setLoading(true)
      const startIso = startDate.toISOString()
      const endIso   = endDate.toISOString()

      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('outlet_id', selectedOutletId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })

      if (!error && data) {
        const userIds = [...new Set(data.map(inv => inv.created_by).filter(Boolean))]
        let profileMap: Record<string, string> = {}
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles').select('id, full_name').in('id', userIds)
          profiles?.forEach(p => { profileMap[p.id] = p.full_name })
        }
        setInvoices(data.map(inv => ({ ...inv, _author: profileMap[inv.created_by] || 'Unknown' })))
      }
      setLoading(false)
    }

    fetchInvoices()

    const channel = supabase
      .channel('invoice_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'invoices',
        filter: `outlet_id=eq.${selectedOutletId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') setInvoices(prev => [payload.new, ...prev])
        else if (payload.eventType === 'UPDATE')
          setInvoices(prev => prev.map(inv => inv.id === payload.new.id ? payload.new : inv))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedOutletId, startDate, endDate])

  // ── Client-side search + status filter ────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter(inv => {
      const matchSearch = !q || (
        (inv.vendor?.toLowerCase()?.includes(q) ?? false) ||
        (inv.invoice_no?.toLowerCase()?.includes(q) ?? false) ||
        (inv._author?.toLowerCase()?.includes(q) ?? false)
      )
      const matchStatus = !statusFilter || inv.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [invoices, search, statusFilter])

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteInvoice = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this invoice and all related data? This cannot be undone.')) return
    try {
      await supabase.from('stock_batches').delete().eq('outlet_id', selectedOutletId)
        .in('invoice_line_id',
          (await supabase.from('invoice_lines').select('id').eq('invoice_id', invoiceId)).data?.map(l => l.id) || []
        )
      await supabase.from('stock_ledger').delete().eq('reference_id', invoiceId).eq('reference_type', 'invoice')
      await supabase.from('invoice_lines').delete().eq('invoice_id', invoiceId)
      const { error } = await supabase.from('invoices').delete().eq('id', invoiceId)
      if (error) throw error
      setInvoices(prev => prev.filter(inv => inv.id !== invoiceId))
      toast.success('Invoice deleted.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete invoice')
    }
  }

  const hasActiveFilter = !!statusFilter
  const showEmpty       = !loading && filtered.length === 0
  const showNoMatch     = !loading && invoices.length > 0 && filtered.length === 0

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Invoice Pipeline</h2>
          <p className="text-zinc-400 text-sm">Capture, extract and post your vendor invoices.</p>
        </div>
        <Link href="/invoices/upload">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Upload className="mr-2 h-4 w-4" /> Upload Invoice
          </Button>
        </Link>
      </div>

      {/* ── Search + Filter bar ── */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            id="invoice-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-10 pr-9 text-sm text-zinc-100 placeholder-zinc-600 transition focus:border-zinc-600 focus:outline-none"
            placeholder="Search by vendor, invoice no, or uploader…"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status filter dropdown */}
        <div className="relative">
          <button
            id="status-filter-btn"
            onClick={() => setFilterOpen(o => !o)}
            className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition
              ${hasActiveFilter
                ? 'border-blue-700 bg-blue-950/40 text-blue-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100'
              }`}
          >
            {hasActiveFilter
              ? <><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />{STATUS_LABELS[statusFilter as Status]}</>
              : 'All Statuses'
            }
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>

          {filterOpen && (
            <div className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
              <button
                className={`flex w-full items-center px-3 py-2 text-sm transition hover:bg-zinc-800
                  ${!statusFilter ? 'text-zinc-100 font-medium' : 'text-zinc-400'}`}
                onClick={() => { setStatusFilter(''); setFilterOpen(false) }}
              >
                All Statuses
              </button>
              {ALL_STATUSES.map(s => (
                <button
                  key={s}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition hover:bg-zinc-800
                    ${statusFilter === s ? 'text-zinc-100 font-medium' : 'text-zinc-400'}`}
                  onClick={() => { setStatusFilter(s); setFilterOpen(false) }}
                >
                  <StatusBadge status={s} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear all filters */}
        {(search || hasActiveFilter) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('') }}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* ── Results count ── */}
      {!loading && (
        <p className="text-xs text-zinc-600">
          {filtered.length === invoices.length
            ? `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`
            : `${filtered.length} of ${invoices.length} invoices`}
          {(search || hasActiveFilter) && ' matching filters'}
        </p>
      )}

      {/* ── Table ── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
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
                <TableCell colSpan={7} className="h-32 text-center text-zinc-600">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
                    Loading invoices…
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-zinc-500 text-sm">
                      {invoices.length === 0
                        ? 'No invoices found. Start by uploading one.'
                        : 'No invoices match your search or filter.'}
                    </p>
                    {(search || hasActiveFilter) && (
                      <button
                        onClick={() => { setSearch(''); setStatusFilter('') }}
                        className="text-xs text-blue-400 hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className={`border-zinc-800 ${invoice.vendor !== 'ByteSuite' ? 'hover:bg-zinc-800/30 cursor-pointer' : 'opacity-80'}`}
                  onClick={() => invoice.vendor !== 'ByteSuite' && router.push(`/invoices/${invoice.id}/review`)}
                >
                  <TableCell className="text-zinc-300">
                    {invoice.invoice_date
                      ? format(new Date(invoice.invoice_date), 'dd MMM yyyy')
                      : format(new Date(invoice.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-100">
                    <div className="flex items-center gap-2">
                      {invoice.vendor || <span className="italic text-zinc-600">Extracting…</span>}
                      {invoice.vendor === 'ByteSuite' && (
                        <div className="flex items-center gap-1.5">
                          <BadgeCheck className="h-4 w-4 text-indigo-400" />
                          <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                            Subscription
                          </Badge>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-400">{invoice.invoice_no || <span className="text-zinc-700">—</span>}</TableCell>
                  <TableCell className="text-zinc-100 font-semibold font-mono">
                    {invoice.grand_total ? formatRp(invoice.grand_total) : <span className="text-zinc-700">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium ${invoice.vendor === 'ByteSuite' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-700 text-zinc-300'}`}>
                        {invoice.vendor === 'ByteSuite' ? 'B' : (invoice._author || 'U').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        {invoice.vendor === 'ByteSuite' ? (
                          <>
                            ByteSuite
                            <BadgeCheck className="h-3 w-3 text-indigo-400" />
                          </>
                        ) : (invoice._author || 'Unknown')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={invoice.status} /></TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {(invoice.status === 'extracted' || invoice.status === 'pending') && invoice.vendor !== 'ByteSuite' && (
                        <Link href={`/invoices/${invoice.id}/review`}>
                          <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10">
                            Review
                          </Button>
                        </Link>
                      )}
                      {invoice.status !== 'posted' && invoice.vendor !== 'ByteSuite' && (
                        <Button
                          variant="ghost" size="icon"
                          className="text-zinc-600 hover:text-red-400 hover:bg-red-400/10"
                          onClick={e => deleteInvoice(invoice.id, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
