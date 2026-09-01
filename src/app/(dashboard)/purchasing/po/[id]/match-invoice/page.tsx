'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { CoaCombobox } from '@/components/ui/coa-combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { ArrowLeft, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatRp } from '@/lib/format'

export default function MatchInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: poId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [po, setPo] = useState<any>(null)
  const [lines, setLines] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [taxAmount, setTaxAmount] = useState(0)
  const [taxCoaId, setTaxCoaId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) return
      setOrgId(profile.org_id)

      const { data: poData } = await supabase.from('purchase_orders').select('*, vendors(name)').eq('id', poId).single()
      setPo(poData)

      const { data: lineData } = await supabase.from('po_lines').select('*, item_master(name)').eq('po_id', poId)
      setLines(
        (lineData || [])
          .filter((l: any) => (l.received_qty - l.returned_qty) > 0.0001)
          .map((l: any) => ({
            item_id: l.item_id,
            description: l.item_master?.name || l.description,
            qty: l.received_qty - l.returned_qty,
            unit_price: l.unit_price,
            coa_id: l.coa_id,
            is_inventory: l.is_inventory,
          }))
      )

      const { data: coaData } = await supabase.from('chart_of_accounts').select('id, code, name, is_header').eq('org_id', profile.org_id).order('code')
      setAccounts(coaData || [])

      setLoading(false)
    }
    init()
  }, [poId])

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0)
  const total = subtotal + (taxAmount || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lines.length === 0) {
      toast.error('Nothing received to invoice.')
      return
    }
    if (!selectedOutletId || !orgId) {
      toast.error('Outlet or organization not resolved.')
      return
    }
    if (taxAmount > 0 && !taxCoaId) {
      toast.error('Select a PPN Masukan account or clear the tax amount.')
      return
    }

    setSaving(true)
    try {
      const { data: invoiceId, error } = await supabase.rpc('post_matched_invoice', {
        p_po_id: poId,
        p_outlet_id: selectedOutletId,
        p_org_id: orgId,
        p_vendor_id: po.vendor_id,
        p_invoice_no: invoiceNo || null,
        p_invoice_date: invoiceDate,
        p_due_date: dueDate || null,
        p_lines: lines.map((l) => ({
          item_id: l.item_id,
          description: l.description,
          qty: l.qty,
          unit_price: l.unit_price,
          total: l.qty * l.unit_price,
          coa_id: l.coa_id,
          is_inventory: l.is_inventory,
        })),
        p_tax_amount: taxAmount || 0,
        p_tax_coa_id: taxCoaId || null,
      })

      if (error) throw error

      toast.success('Invoice matched and posted. GR/IR clearing settled, AP updated.')
      router.push(`/invoices/${invoiceId}/review`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to post matched invoice')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href={`/purchasing/po/${poId}`} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to PO
      </Link>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-zinc-100/10 border border-zinc-700 flex items-center justify-center text-zinc-100">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Match Vendor Invoice</h1>
            <p className="text-xs text-zinc-400">{po?.vendors?.name} — quantities and costs are locked to what was actually received.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Vendor Invoice No.</label>
              <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Invoice Date</label>
              <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Due Date</label>
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="Optional" />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Item</th>
                  <th className="text-right px-3 py-2 font-medium">Qty Received</th>
                  <th className="text-right px-3 py-2 font-medium">Unit Price</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {lines.map((l, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-zinc-100">{l.description}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 font-mono">{l.qty}</td>
                    <td className="px-3 py-2 text-right text-zinc-400 font-mono">{formatRp(l.unit_price)}</td>
                    <td className="px-3 py-2 text-right text-zinc-100 font-semibold font-mono">{formatRp(l.qty * l.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Tax Amount (PPN)</label>
              <input type="number" min="0" step="any" value={taxAmount}
                onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500" />
            </div>
            {taxAmount > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">PPN Masukan Account</label>
                <CoaCombobox coas={accounts} value={taxCoaId} onChange={setTaxCoaId} placeholder="Select account…" />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-6 text-sm border-t border-zinc-800 pt-4">
            <div className="text-right">
              <p className="text-zinc-400">Subtotal</p>
              <p className="text-zinc-200 font-mono">{formatRp(subtotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-400">Tax</p>
              <p className="text-zinc-200 font-mono">{formatRp(taxAmount || 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-400">Total</p>
              <p className="text-zinc-100 font-bold font-mono">{formatRp(total)}</p>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Link href={`/purchasing/po/${poId}`}>
              <Button type="button" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
            </Link>
            <Button type="submit" disabled={saving} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 gap-2 font-medium">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Post Matched Invoice
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
