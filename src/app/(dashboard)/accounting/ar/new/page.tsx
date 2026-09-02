'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CoaCombobox } from '@/components/ui/coa-combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { AddCustomerDialog } from '@/components/ar/AddCustomerDialog'
import { ArrowLeft, Plus, Trash2, Loader2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { formatRp } from '@/lib/format'

interface Line {
  description: string
  qty: number
  unit_price: number
  coa_id: string
}

const emptyLine: Line = { description: '', qty: 1, unit_price: 0, coa_id: '' }

export default function NewCustomerInvoicePage() {
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])

  const [customerId, setCustomerId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [taxAmount, setTaxAmount] = useState(0)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }])

  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) { setLoading(false); return }
      setOrgId(profile.org_id)

      const [{ data: customersData }, { data: coaData }] = await Promise.all([
        supabase.from('customers').select('*').eq('org_id', profile.org_id).order('name'),
        supabase.from('chart_of_accounts').select('id, code, name, is_header').eq('org_id', profile.org_id).eq('is_active', true).eq('type', 'income').order('code'),
      ])
      setCustomers(customersData || [])
      setAccounts(coaData || [])
      setLoading(false)
    }
    init()
  }, [])

  const handleCustomerChange = (value: string) => {
    setCustomerId(value)
    const customer = customers.find((c) => c.id === value)
    if (customer) {
      setDueDate(format(addDays(new Date(invoiceDate), customer.payment_terms_days || 30), 'yyyy-MM-dd'))
    }
  }

  const updateLine = (idx: number, field: keyof Line, value: any) => {
    const updated = [...lines]
    updated[idx] = { ...updated[idx], [field]: value }
    setLines(updated)
  }

  const addLine = () => setLines([...lines, { ...emptyLine }])
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx))

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0)
  const grandTotal = subtotal + (taxAmount || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) {
      toast.error('Select a customer first.')
      return
    }
    if (!selectedOutletId || !orgId) {
      toast.error('Outlet or organization not resolved.')
      return
    }
    const validLines = lines.filter((l) => l.description.trim() && l.qty > 0 && l.unit_price >= 0)
    if (validLines.length === 0) {
      toast.error('Add at least one line item.')
      return
    }
    if (validLines.some((l) => !l.coa_id)) {
      toast.error('Every line needs a revenue account.')
      return
    }

    setSaving(true)
    try {
      const { data: invoiceId, error } = await supabase.rpc('post_customer_invoice', {
        p_org_id: orgId,
        p_outlet_id: selectedOutletId,
        p_customer_id: customerId,
        p_invoice_no: invoiceNo || null,
        p_invoice_date: invoiceDate,
        p_due_date: dueDate || null,
        p_lines: validLines.map((l) => ({ description: l.description, qty: l.qty, unit_price: l.unit_price, coa_id: l.coa_id })),
        p_tax_amount: taxAmount || 0,
        p_notes: notes || null,
      })

      if (error) throw error

      toast.success('Customer invoice posted.')
      router.push(`/accounting/ar/${invoiceId}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to post invoice')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/accounting/ar" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Accounts Receivable
      </Link>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">New Customer Invoice</h1>
            <p className="text-xs text-zinc-400">Bill a customer for credit sales, catering, or any other AR.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Customer</label>
              <select
                value={customerId}
                onChange={(e) => {
                  if (e.target.value === '__add_new__') { setAddCustomerOpen(true); return }
                  handleCustomerChange(e.target.value)
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 h-10 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="__add_new__">+ Add new customer…</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Invoice Number (Optional)</label>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="bg-zinc-950 border-zinc-800 h-10 text-zinc-100" placeholder="Auto-generated if left blank" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Invoice Date</label>
              <DatePicker value={invoiceDate} onChange={setInvoiceDate} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Due Date</label>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Line Items</label>
            <div className="grid grid-cols-12 gap-2 px-3">
              <span className="col-span-5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Description</span>
              <span className="col-span-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Qty</span>
              <span className="col-span-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Unit Price</span>
              <span className="col-span-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Revenue Account</span>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-3 items-center">
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(idx, 'description', e.target.value)}
                  className="col-span-5 bg-zinc-900 border-zinc-800 h-9 text-sm text-zinc-100"
                  placeholder="e.g. Catering Paket A"
                />
                <Input
                  type="number" min="0" step="any" value={line.qty}
                  onChange={(e) => updateLine(idx, 'qty', parseFloat(e.target.value) || 0)}
                  className="col-span-2 bg-zinc-900 border-zinc-800 h-9 text-sm text-zinc-100"
                />
                <Input
                  type="number" min="0" step="any" value={line.unit_price}
                  onChange={(e) => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                  className="col-span-2 bg-zinc-900 border-zinc-800 h-9 text-sm text-zinc-100"
                />
                <div className="col-span-2">
                  <CoaCombobox coas={accounts} value={line.coa_id} onChange={(v) => updateLine(idx, 'coa_id', v)} placeholder="Account…" className="h-9 text-xs" />
                </div>
                <button type="button" onClick={() => removeLine(idx)} className="col-span-1 flex justify-center text-zinc-500 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addLine} className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 gap-2 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add Line
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Tax (Optional)</label>
              <Input
                type="number" min="0" value={taxAmount}
                onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
                className="bg-zinc-950 border-zinc-800 h-10 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-zinc-950 border-zinc-800 h-10 text-zinc-100" />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-1.5">
            <div className="flex justify-between text-sm text-zinc-400">
              <span>Subtotal</span>
              <span className="font-mono">{formatRp(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-400">
              <span>Tax</span>
              <span className="font-mono">{formatRp(taxAmount || 0)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-zinc-100 pt-1.5 border-t border-zinc-800">
              <span>Grand Total</span>
              <span className="font-mono">{formatRp(grandTotal)}</span>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Link href="/accounting/ar">
              <Button type="button" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
            </Link>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Post Invoice
            </Button>
          </div>
        </form>
      </div>

      {orgId && (
        <AddCustomerDialog
          open={addCustomerOpen}
          onOpenChange={setAddCustomerOpen}
          orgId={orgId}
          onCreated={(customer) => {
            setCustomers((prev) => [...prev, customer])
            handleCustomerChange(customer.id)
          }}
        />
      )}
    </div>
  )
}
