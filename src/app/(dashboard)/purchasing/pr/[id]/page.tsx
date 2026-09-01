'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/contexts/language-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, ClipboardCheck, Loader2, AlertTriangle, ArrowRight, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  pending_approval: 'bg-amber-950/30 text-amber-400 border-amber-900/50',
  approved: 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50',
  rejected: 'bg-red-950/30 text-red-400 border-red-900/50',
  converted: 'bg-blue-950/30 text-blue-400 border-blue-900/50',
}

export default function RequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: prId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useLanguage()

  const [pr, setPr] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const fetchPr = async () => {
    setLoading(true)
    const { data: prData } = await supabase.from('purchase_requisitions').select('*').eq('id', prId).single()
    setPr(prData)

    const { data: lineData } = await supabase
      .from('pr_lines')
      .select('*, item_master(name)')
      .eq('pr_id', prId)
    setLines(lineData || [])
    setLoading(false)
  }

  useEffect(() => { fetchPr() }, [prId])

  const handleApprove = async () => {
    setApproving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('purchase_requisitions')
      .update({ status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString() })
      .eq('id', prId)
    setApproving(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('purchasing.pr.detail.successApproved'))
      fetchPr()
    }
  }

  const handleReject = async () => {
    setRejecting(true)
    const { error } = await supabase.from('purchase_requisitions').update({ status: 'rejected' }).eq('id', prId)
    setRejecting(false)
    setRejectDialogOpen(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('purchasing.pr.detail.successRejected'))
      fetchPr()
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">{t('purchasing.pr.detail.loading')}</div>
  if (!pr) return (
    <div className="py-20 text-center space-y-4">
      <p className="text-zinc-400">{t('purchasing.pr.detail.notFound')}</p>
      <Link href="/purchasing/pr"><Button variant="outline" className="border-zinc-800 text-zinc-300">{t('purchasing.pr.detail.backToList')}</Button></Link>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="space-y-1">
          <Link href="/purchasing/pr" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="h-4 w-4" /> {t('common.back')}
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-indigo-400" />
            {t('purchasing.pr.detail.title')}
          </h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={STATUS_BADGE[pr.status] || ''}>{t(`statusLabel.${pr.status}`)}</Badge>
            {pr.needed_by_date && <span className="text-xs text-zinc-500">{t('purchasing.pr.detail.neededBy', { date: format(new Date(pr.needed_by_date), 'dd MMM yyyy') })}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => router.push(`/purchasing/pr/${prId}/print`)} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs gap-1.5">
            <Printer className="h-3.5 w-3.5" /> {t('purchasing.print.printButton')}
          </Button>
          {pr.status === 'pending_approval' && (
            <>
              <Button variant="outline" onClick={() => setRejectDialogOpen(true)} className="border-zinc-700 text-red-400 hover:bg-red-500/10 text-xs">
                {t('purchasing.pr.detail.reject')}
              </Button>
              <Button onClick={handleApprove} disabled={approving} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5">
                {approving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('purchasing.pr.detail.approve')}
              </Button>
            </>
          )}
          {pr.status === 'approved' && (
            <Button
              onClick={() => router.push(`/purchasing/po/new?pr_id=${pr.id}`)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5"
            >
              {t('purchasing.pr.detail.convertToPo')} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {pr.notes && <p className="text-sm text-zinc-400">{pr.notes}</p>}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">{t('purchasing.pr.detail.colItem')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.pr.detail.colQty')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.pr.detail.colUnit')}</TableHead>
              <TableHead className="text-zinc-400">{t('purchasing.pr.detail.colNotes')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id} className="border-zinc-800">
                <TableCell className="text-zinc-100">{line.item_master?.name || '—'}</TableCell>
                <TableCell className="text-zinc-300 font-mono">{line.qty}</TableCell>
                <TableCell className="text-zinc-400">{line.unit || '—'}</TableCell>
                <TableCell className="text-zinc-500 text-sm">{line.notes || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />{t('purchasing.pr.detail.rejectDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('purchasing.pr.detail.rejectDialogDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>{t('common.cancel')}</AlertDialogCancel>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleReject} disabled={rejecting}>
              {rejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('purchasing.pr.detail.reject')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
