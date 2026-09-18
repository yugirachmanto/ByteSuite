'use client'

import React, { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, FileText, CheckCircle2, Trash2, RefreshCw, ArrowUpCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Link from 'next/link'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { getSignedFileUrl } from '@/lib/storage'

export default function AdminBillingPage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)

  // Receipt Modal State
  const [viewingReceipt, setViewingReceipt] = useState<any>(null)

  // The receipts bucket is private — resolve a fresh signed URL whenever the
  // modal is opened for an invoice, rather than trusting the stored public-style URL.
  const handleViewReceipt = async (inv: any) => {
    setViewingReceipt(inv)
    if (!inv.receipt_url) return
    const signed = await getSignedFileUrl(supabase, 'receipts', inv.receipt_url)
    setViewingReceipt((prev: any) => (prev?.id === inv.id ? { ...prev, signedReceiptUrl: signed } : prev))
  }

  useEffect(() => {
    fetchInvoices()
    fetchRequests()
  }, [])

  async function fetchInvoices() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/invoices')
      const data = await res.json()
      if (data.invoices) {
        setInvoices(data.invoices)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchRequests() {
    setRequestsLoading(true)
    try {
      const res = await fetch('/api/admin/upgrade-requests')
      const data = await res.json()
      if (data.requests) setRequests(data.requests)
    } catch (err) {
      console.error(err)
    } finally {
      setRequestsLoading(false)
    }
  }

  async function handleGenerateNow() {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/billing/generate-invoices', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate invoices')
      toast.success(`Generated ${data.invoices_created} invoice(s), flagged ${data.flagged_overdue} as overdue`, {
        description: data.skipped?.length > 0 ? `Skipped: ${data.skipped.map((s: any) => `${s.org} (${s.reason})`).join(', ')}` : undefined,
      })
      fetchInvoices()
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate invoices')
    } finally {
      setGenerating(false)
    }
  }

  async function resolveRequest(id: string, status: string, applyPlan: boolean) {
    try {
      const res = await fetch('/api/admin/upgrade-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, apply_plan: applyPlan }),
      })
      if (res.ok) {
        toast.success(status === 'completed' ? 'Marked completed and plan applied' : `Marked ${status.replace('_', ' ')}`)
        fetchRequests()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function updateInvoiceStatus(invoiceId: string, status: string) {
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoiceId, status })
      })
      if (res.ok) fetchInvoices()
    } catch (err) {
      console.error(err)
    }
  }

  async function deleteInvoice(invoiceId: string) {
    if (!confirm('Are you sure you want to delete this billing?')) return
    try {
      const res = await fetch(`/api/admin/invoices?id=${invoiceId}`, {
        method: 'DELETE',
      })
      if (res.ok) fetchInvoices()
    } catch (err) {
      console.error(err)
    }
  }


  const outstandingInvoices = invoices.filter((inv: any) => ['pending', 'under_review', 'past_due', 'overdue'].includes(inv.status))
  const historyInvoices = invoices.filter((inv: any) => !['pending', 'under_review', 'past_due', 'overdue'].includes(inv.status))
  const pendingRequests = requests.filter((r: any) => r.status === 'pending')

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Billing Management</h2>
          <p className="text-zinc-400">Review all tenant invoices and approve payments.</p>
        </div>
        <Button
          variant="outline"
          onClick={handleGenerateNow}
          disabled={generating}
          className="border-zinc-800 text-zinc-300 hover:bg-zinc-800"
        >
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Generate Now
        </Button>
      </div>

      {/* Upgrade Requests */}
      {!requestsLoading && pendingRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-indigo-400" />
            Upgrade Requests
            <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 bg-indigo-950/20">{pendingRequests.length} pending</Badge>
          </h3>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-900">
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Date</TableHead>
                  <TableHead className="text-zinc-400">Organization</TableHead>
                  <TableHead className="text-zinc-400">Current Plan</TableHead>
                  <TableHead className="text-zinc-400">Requested Plan</TableHead>
                  <TableHead className="text-zinc-400">Requested By</TableHead>
                  <TableHead className="text-right text-zinc-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map((r: any) => (
                  <TableRow key={r.id} className="border-zinc-800 hover:bg-zinc-800/30 text-sm">
                    <TableCell className="text-zinc-300">{format(new Date(r.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-zinc-200 font-medium">{r.organizations?.name || 'Unknown'}</TableCell>
                    <TableCell className="text-zinc-400">{r.organizations?.subscription_plan || 'Free'}</TableCell>
                    <TableCell className="text-indigo-300 font-medium">
                      {r.subscription_plans?.name}
                      {r.subscription_plans?.price !== null && (
                        <span className="text-zinc-500 ml-1">
                          ({new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(r.subscription_plans.price)}/mo)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-400">{r.requested_by?.full_name || 'Unknown'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
                          onClick={() => resolveRequest(r.id, 'completed', true)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Complete &amp; Apply
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-950/30"
                          onClick={() => resolveRequest(r.id, 'dismissed', false)}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Dismiss
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Outstanding Billings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
          <FileText className="h-5 w-5 text-amber-400" />
          Outstanding Billings
        </h3>
        
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-900">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Date</TableHead>
                <TableHead className="text-zinc-400">Organization</TableHead>
                <TableHead className="text-zinc-400">Description</TableHead>
                <TableHead className="text-zinc-400">Amount</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-right text-zinc-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-30" />
                    Loading...
                  </TableCell>
                </TableRow>
              ) : outstandingInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                    No outstanding billings across all tenants.
                  </TableCell>
                </TableRow>
              ) : (
                outstandingInvoices.map((inv: any) => (
                  <TableRow key={inv.id} className="border-zinc-800 hover:bg-zinc-800/30 text-sm">
                    <TableCell className="text-zinc-300">
                      {format(new Date(inv.created_at), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="text-zinc-200 font-medium">
                      {inv.organizations?.name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-zinc-300">{inv.description}</TableCell>
                    <TableCell className="text-zinc-300 font-medium">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(inv.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        inv.status === 'overdue' ? 'border-orange-500/40 text-orange-400 bg-orange-950/30 font-semibold' :
                        inv.status === 'pending' ? 'border-red-500/30 text-red-400 bg-red-950/20' :
                        inv.status === 'under_review' ? 'border-amber-500/30 text-amber-400 bg-amber-950/20' :
                        'border-zinc-500/30 text-zinc-400 bg-zinc-950/20'
                      }>
                        {inv.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {inv.status === 'under_review' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
                            onClick={() => updateInvoiceStatus(inv.id, 'paid')}
                          >
                            Approve
                          </Button>
                        )}
                        {inv.receipt_url && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30"
                            onClick={() => handleViewReceipt(inv)}
                          >
                            Receipt
                          </Button>
                        )}
                        {inv.status !== 'paid' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 ml-2"
                            onClick={() => deleteInvoice(inv.id)}
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

      {/* Invoice History */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          Billing History
        </h3>
        
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-900">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Date</TableHead>
                <TableHead className="text-zinc-400">Organization</TableHead>
                <TableHead className="text-zinc-400">Description</TableHead>
                <TableHead className="text-zinc-400">Amount</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-right text-zinc-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-30" />
                    Loading...
                  </TableCell>
                </TableRow>
              ) : historyInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                    No billing history found.
                  </TableCell>
                </TableRow>
              ) : (
                historyInvoices.map((inv: any) => (
                  <TableRow key={inv.id} className="border-zinc-800 hover:bg-zinc-800/30 text-sm">
                    <TableCell className="text-zinc-300">
                      {format(new Date(inv.created_at), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="text-zinc-200 font-medium">
                      {inv.organizations?.name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-zinc-300">{inv.description}</TableCell>
                    <TableCell className="text-zinc-300 font-medium">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(inv.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        inv.status === 'paid' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' : 
                        'border-zinc-500/30 text-zinc-400 bg-zinc-950/20'
                      }>
                        {inv.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {inv.receipt_url && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30"
                            onClick={() => handleViewReceipt(inv)}
                          >
                            Receipt
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

      {/* Receipt View Modal */}
      <Dialog open={!!viewingReceipt} onOpenChange={(open) => !open && setViewingReceipt(null)}>
        <DialogContent className="sm:max-w-[600px] bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Review the payment receipt below.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex justify-center bg-zinc-900 rounded-md overflow-hidden relative min-h-[200px]">
            {!viewingReceipt?.receipt_url ? (
              <span className="text-zinc-500 my-auto">No receipt found.</span>
            ) : !viewingReceipt.signedReceiptUrl ? (
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500 my-auto" />
            ) : viewingReceipt.receipt_url.toLowerCase().endsWith('.pdf') ? (
              <iframe src={viewingReceipt.signedReceiptUrl} className="w-full h-[60vh] border-0 bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewingReceipt.signedReceiptUrl} alt="Receipt" className="max-w-full max-h-[60vh] object-contain" />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingReceipt(null)} className="text-zinc-400 hover:text-zinc-100">
              Close
            </Button>
            {viewingReceipt?.status === 'under_review' && (
              <Button 
                onClick={() => {
                  updateInvoiceStatus(viewingReceipt.id, 'paid')
                  setViewingReceipt(null)
                }} 
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Approve Payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
