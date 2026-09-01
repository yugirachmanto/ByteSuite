'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClipboardCheck, Plus } from 'lucide-react'
import { format } from 'date-fns'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  pending_approval: 'bg-amber-950/30 text-amber-400 border-amber-900/50',
  approved: 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50',
  rejected: 'bg-red-950/30 text-red-400 border-red-900/50',
  converted: 'bg-blue-950/30 text-blue-400 border-blue-900/50',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted to PO',
}

export default function RequisitionsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [prs, setPrs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedOutletId) return
    async function fetchPrs() {
      setLoading(true)
      const { data } = await supabase
        .from('purchase_requisitions')
        .select('*, pr_lines(id)')
        .eq('outlet_id', selectedOutletId)
        .order('created_at', { ascending: false })
      setPrs(data || [])
      setLoading(false)
    }
    fetchPrs()
  }, [selectedOutletId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-indigo-400" />
            Purchase Requisitions
          </h2>
          <p className="text-zinc-400 text-sm">Raise and approve requests for what's needed before ordering.</p>
        </div>
        <Link href="/purchasing/pr/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="mr-2 h-4 w-4" /> New Requisition
          </Button>
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Date</TableHead>
              <TableHead className="text-zinc-400">Needed By</TableHead>
              <TableHead className="text-zinc-400">Lines</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="h-32 text-center text-zinc-600">Loading requisitions…</TableCell></TableRow>
            ) : prs.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="h-32 text-center text-zinc-500 text-sm">No requisitions yet. Create your first one.</TableCell></TableRow>
            ) : (
              prs.map((pr) => (
                <TableRow
                  key={pr.id}
                  className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer"
                  onClick={() => router.push(`/purchasing/pr/${pr.id}`)}
                >
                  <TableCell className="text-zinc-300">{format(new Date(pr.created_at), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-zinc-400">{pr.needed_by_date ? format(new Date(pr.needed_by_date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-zinc-400">{pr.pr_lines?.length || 0} item{pr.pr_lines?.length === 1 ? '' : 's'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[pr.status] || ''}>{STATUS_LABEL[pr.status] || pr.status}</Badge>
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
