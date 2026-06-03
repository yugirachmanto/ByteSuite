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
import { Loader2, FileText, CheckCircle2, Trash2 } from 'lucide-react'
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

export default function AdminBillingPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Receipt Modal State
  const [viewingReceipt, setViewingReceipt] = useState<any>(null)

  useEffect(() => {
    fetchInvoices()
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


  const outstandingInvoices = invoices.filter((inv: any) => ['pending', 'under_review', 'past_due'].includes(inv.status))
  const historyInvoices = invoices.filter((inv: any) => !['pending', 'under_review', 'past_due'].includes(inv.status))

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Billing Management</h2>
        <p className="text-zinc-400">Review all tenant invoices and approve payments.</p>
      </div>

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
                            onClick={() => setViewingReceipt(inv)}
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
                            onClick={() => setViewingReceipt(inv)}
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
            {viewingReceipt?.receipt_url ? (
              viewingReceipt.receipt_url.toLowerCase().endsWith('.pdf') ? (
                <iframe src={viewingReceipt.receipt_url} className="w-full h-[60vh] border-0 bg-white" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewingReceipt.receipt_url} alt="Receipt" className="max-w-full max-h-[60vh] object-contain" />
              )
            ) : (
              <span className="text-zinc-500 my-auto">No receipt found.</span>
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
