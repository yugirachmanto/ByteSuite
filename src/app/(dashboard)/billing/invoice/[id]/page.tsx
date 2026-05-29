'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function InvoicePDFPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [invoice, setInvoice] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) fetchInvoice()
  }, [id])

  async function fetchInvoice() {
    try {
      const { data: invData, error: invError } = await supabase
        .from('tenant_invoices')
        .select('*')
        .eq('id', id)
        .single()
      
      if (invError) throw invError
      setInvoice(invData)

      if (invData) {
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', invData.org_id)
          .single()
        
        if (orgError) throw orgError
        setOrg(orgData)
      }
    } catch (error) {
      console.error('Error fetching invoice:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!invoice || !org) {
    return (
      <div className="p-8 text-center text-zinc-500">
        Invoice not found or you do not have access to it.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      {/* Non-printable Controls */}
      <div className="mx-auto max-w-3xl mb-8 flex items-center justify-between print:hidden">
        <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100" onClick={() => router.push('/billing')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Billing
        </Button>
        <Button onClick={handlePrint} className="bg-indigo-600 text-white hover:bg-indigo-700">
          <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      {/* Printable Invoice Container */}
      <div className="mx-auto max-w-3xl bg-white text-zinc-900 rounded-lg p-8 md:p-16 shadow-lg print:shadow-none print:p-0">
        <div className="flex justify-between items-start border-b border-zinc-200 pb-8 mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-indigo-900 mb-2">INVOICE</h1>
            <p className="text-zinc-500 font-medium">#{invoice.id.split('-')[0].toUpperCase()}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-2xl font-bold italic mb-1">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 text-white text-lg">
                B
              </span>
              ByteSuite
            </div>
            <p className="text-sm text-zinc-500">Bandung, Indonesia</p>
            <p className="text-sm text-zinc-500">billing@bytesuite.com</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Bill To</p>
            <p className="font-semibold text-lg">{org.name}</p>
            <p className="text-zinc-500 text-sm mt-1">Tenant ID: {org.id.substring(0,8)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Details</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-end gap-4">
                <span className="text-zinc-500">Date Issued:</span>
                <span className="font-medium">{new Date(invoice.created_at).toLocaleDateString()}</span>
              </div>
              {invoice.due_date && (
                <div className="flex justify-end gap-4">
                  <span className="text-zinc-500">Due Date:</span>
                  <span className="font-medium">{new Date(invoice.due_date).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex justify-end gap-4 items-center pt-1">
                <span className="text-zinc-500">Status:</span>
                {invoice.status === 'paid' ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 uppercase print:border-emerald-800">Paid</Badge>
                ) : invoice.status === 'pending' ? (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 uppercase print:border-amber-800">Pending</Badge>
                ) : (
                  <Badge className="bg-zinc-100 text-zinc-800 border-zinc-200 uppercase print:border-zinc-800">{invoice.status}</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-12">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-zinc-200 text-sm font-bold text-zinc-600 uppercase tracking-wider">
                <th className="py-3 pr-4">Description</th>
                <th className="py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-4 pr-4 text-zinc-800 font-medium">{invoice.description}</td>
                <td className="py-4 text-right text-zinc-800 font-medium">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mb-16">
          <div className="w-64 space-y-3">
            <div className="flex justify-between text-sm text-zinc-600">
              <span>Subtotal</span>
              <span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.amount)}</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-600 border-b border-zinc-200 pb-3">
              <span>Tax (0%)</span>
              <span>Rp 0,00</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-indigo-900 pt-2">
              <span>Total Due</span>
              <span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.amount)}</span>
            </div>
          </div>
        </div>

        {invoice.status === 'paid' && (
          <div className="flex items-center justify-center p-6 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-800 print:border-emerald-800">
            <CheckCircle2 className="h-6 w-6 mr-3" />
            <span className="font-medium">This invoice has been paid in full. Thank you for your business!</span>
          </div>
        )}
        {invoice.status === 'pending' && (
          <div className="text-center p-6 bg-zinc-50 rounded-lg border border-zinc-200 text-zinc-600 print:border-zinc-800">
            <p className="font-medium mb-1">Payment Instructions</p>
            <p className="text-sm">Please transfer to Bank Central Asia 777-777-777 PT. ByteSuite Indonesia.</p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body {
            background-color: white !important;
          }
          @page { margin: 0; size: auto; }
        }
      `}} />
    </div>
  )
}
