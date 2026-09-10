'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Receipt, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'

export default function CustomerInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceId } = use(params)
  const supabase = createClient()

  const [invoice, setInvoice] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: invoiceData } = await supabase.from('customer_invoices').select('*, customers(name, email, phone, address)').eq('id', invoiceId).single()
      setInvoice(invoiceData)

      const { data: lineData } = await supabase.from('customer_invoice_lines').select('*, chart_of_accounts(code, name)').eq('invoice_id', invoiceId)
      setLines(lineData || [])

      const { data: paymentData } = await supabase.from('ar_payments').select('*, chart_of_accounts(name, code)').eq('invoice_id', invoiceId).order('payment_date', { ascending: false })
      setPayments(paymentData || [])

      setLoading(false)
    }
    load()
  }, [invoiceId])

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm"><Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-30" />Loading invoice…</div>
  if (!invoice) return (
    <div className="py-20 text-center space-y-4">
      <p className="text-zinc-400">Invoice not found.</p>
      <Link href="/accounting/ar"><Button variant="outline" className="border-zinc-800 text-zinc-300">Back to Accounts Receivable</Button></Link>
    </div>
  )

  const balance = invoice.grand_total - (invoice.paid_amount || 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="space-y-1">
          <Link href="/accounting/ar" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-indigo-400" />
            {invoice.invoice_no || 'Customer Invoice'}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={
                invoice.payment_status === 'paid'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : invoice.payment_status === 'partial'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-zinc-500/10 text-zinc-400 border-zinc-800'
              }
            >
              {invoice.payment_status === 'paid' ? 'Paid' : invoice.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
            </Badge>
            <span className="text-xs text-zinc-500">
              {invoice.customers?.name} — {format(new Date(invoice.invoice_date), 'dd MMM yyyy')}
              {invoice.due_date && ` — Due: ${format(new Date(invoice.due_date), 'dd MMM yyyy')}`}
            </span>
          </div>
        </div>
      </div>

      {invoice.notes && <p className="text-sm text-zinc-400">{invoice.notes}</p>}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Description</TableHead>
              <TableHead className="text-zinc-400">Qty</TableHead>
              <TableHead className="text-zinc-400">Unit Price</TableHead>
              <TableHead className="text-zinc-400">Account</TableHead>
              <TableHead className="text-zinc-400">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id} className="border-zinc-800">
                <TableCell className="text-zinc-100">{line.description}</TableCell>
                <TableCell className="text-zinc-300 font-mono">{line.qty}</TableCell>
                <TableCell className="text-zinc-400 font-mono">{formatRp(line.unit_price)}</TableCell>
                <TableCell className="text-zinc-500 text-xs">{line.chart_of_accounts?.code} - {line.chart_of_accounts?.name}</TableCell>
                <TableCell className="text-zinc-100 font-semibold font-mono">{formatRp(line.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-col items-end gap-1 p-4 border-t border-zinc-800 text-sm">
          <div className="flex gap-3"><span className="text-zinc-400">Subtotal</span><span className="text-zinc-300 font-mono w-32 text-right">{formatRp(invoice.subtotal)}</span></div>
          <div className="flex gap-3"><span className="text-zinc-400">Tax</span><span className="text-zinc-300 font-mono w-32 text-right">{formatRp(invoice.tax_total)}</span></div>
          <div className="flex gap-3"><span className="text-zinc-400 font-bold">Grand Total</span><span className="text-zinc-100 font-bold font-mono w-32 text-right">{formatRp(invoice.grand_total)}</span></div>
          <div className="flex gap-3"><span className="text-emerald-400">Paid</span><span className="text-emerald-400 font-mono w-32 text-right">{formatRp(invoice.paid_amount || 0)}</span></div>
          <div className="flex gap-3"><span className="text-zinc-100 font-bold">Balance</span><span className="text-zinc-100 font-bold font-mono w-32 text-right">{formatRp(balance)}</span></div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-200">Payment History</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">No payments recorded yet.</p>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800/60">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <span className="text-zinc-200">{format(new Date(p.payment_date), 'dd MMM yyyy')}</span>
                  <span className="text-zinc-500 text-xs ml-2">{p.chart_of_accounts?.code} - {p.chart_of_accounts?.name}</span>
                  {p.reference_no && <span className="text-zinc-600 text-xs ml-2">Ref: {p.reference_no}</span>}
                </div>
                <span className="font-mono text-emerald-400">{formatRp(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
