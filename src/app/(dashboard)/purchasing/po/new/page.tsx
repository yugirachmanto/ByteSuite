'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { useLanguage } from '@/lib/contexts/language-context'
import { Button } from '@/components/ui/button'
import { CoaCombobox } from '@/components/ui/coa-combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { AddRawItemDialog } from '@/components/purchasing/AddRawItemDialog'
import { AddVendorDialog } from '@/components/purchasing/AddVendorDialog'
import { ArrowLeft, Plus, Trash2, Loader2, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { formatRp } from '@/lib/format'

interface Line {
  item_id: string
  description: string
  qty: number
  unit: string
  unit_price: number
  coa_id: string
  is_inventory: boolean
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prId = searchParams.get('pr_id')
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const { t } = useLanguage()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [vendors, setVendors] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [vendorId, setVendorId] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', description: '', qty: 1, unit: '', unit_price: 0, coa_id: '', is_inventory: true }])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [addItemLineIdx, setAddItemLineIdx] = useState<number | null>(null)
  const [addVendorOpen, setAddVendorOpen] = useState(false)
  const [lastPrices, setLastPrices] = useState<Record<string, { price: number; date: string }>>({})

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) return
      setOrgId(profile.org_id)

      const [{ data: vendorData }, { data: coaData }, { data: itemData }] = await Promise.all([
        supabase.from('vendors').select('id, name').eq('org_id', profile.org_id).order('name'),
        supabase.from('chart_of_accounts').select('id, code, name, is_header').eq('org_id', profile.org_id).order('code'),
        supabase.from('item_master').select('id, name, unit, purchase_unit, default_coa_id, is_inventory').eq('org_id', profile.org_id).eq('category', 'raw').order('name'),
      ])
      setVendors(vendorData || [])
      setAccounts(coaData || [])
      setItems(itemData || [])

      if (prId) {
        const { data: prLines } = await supabase.from('pr_lines').select('*, item_master(name, unit, purchase_unit, default_coa_id, is_inventory)').eq('pr_id', prId)
        if (prLines && prLines.length > 0) {
          setLines(prLines.map((l: any) => ({
            item_id: l.item_id,
            description: l.item_master?.name || '',
            qty: l.qty,
            unit: l.unit || l.item_master?.purchase_unit || l.item_master?.unit || '',
            unit_price: 0,
            coa_id: l.item_master?.default_coa_id || '',
            is_inventory: l.item_master?.is_inventory ?? true,
          })))
          prLines.forEach((l: any, idx: number) => fetchLastPrice(l.item_id, idx))
        }
      }
      setLoading(false)
    }
    init()
  }, [prId])

  const addLine = () => setLines([...lines, { item_id: '', description: '', qty: 1, unit: '', unit_price: 0, coa_id: '', is_inventory: true }])
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx))
  const updateLine = (idx: number, field: keyof Line, value: any) => {
    const updated = [...lines]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === 'item_id') {
      const item = items.find((i) => i.id === value)
      if (item) {
        updated[idx].description = item.name
        updated[idx].unit = item.purchase_unit || item.unit
        updated[idx].coa_id = item.default_coa_id || ''
        updated[idx].is_inventory = item.is_inventory
      }
      fetchLastPrice(value, idx)
    }
    setLines(updated)
  }

  // Suggests unit_price from the most recent PO line for this item (across
  // any past purchase order), since po_lines.unit_price is always recorded
  // in Purchase Unit — the same unit this form's price field uses. Cached
  // per item_id so re-selecting the same item doesn't re-query.
  const fetchLastPrice = async (itemId: string, idx: number) => {
    if (!itemId) return

    const applyCached = (entry: { price: number; date: string }) => {
      setLines((prev) => {
        if (prev[idx]?.item_id !== itemId) return prev
        const copy = [...prev]
        copy[idx] = { ...copy[idx], unit_price: entry.price }
        return copy
      })
    }

    if (lastPrices[itemId]) {
      applyCached(lastPrices[itemId])
      return
    }

    const { data } = await supabase
      .from('po_lines')
      .select('unit_price, purchase_orders(order_date, created_at)')
      .eq('item_id', itemId)

    if (!data || data.length === 0) return

    const withDate = data
      .map((row: any) => ({
        price: row.unit_price,
        date: row.purchase_orders?.order_date || row.purchase_orders?.created_at,
      }))
      .filter((row) => row.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const latest = withDate[0]
    if (!latest) return

    setLastPrices((prev) => ({ ...prev, [itemId]: latest }))
    applyCached(latest)
  }

  const handleItemCreated = (newItem: any) => {
    setItems((prev) => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)))
    if (addItemLineIdx !== null) {
      updateLine(addItemLineIdx, 'item_id', newItem.id)
    }
  }

  const handleVendorCreated = (newVendor: any) => {
    setVendors((prev) => [...prev, newVendor].sort((a, b) => a.name.localeCompare(b.name)))
    setVendorId(newVendor.id)
  }

  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validLines = lines.filter((l) => l.item_id && l.qty > 0 && l.coa_id)
    if (validLines.length === 0) {
      toast.error(t('purchasing.po.new.errAddLine'))
      return
    }
    if (!vendorId) {
      toast.error(t('purchasing.po.new.errSelectVendor'))
      return
    }
    if (!selectedOutletId) {
      toast.error(t('purchasing.po.new.errSelectOutlet'))
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          outlet_id: selectedOutletId,
          pr_id: prId || null,
          vendor_id: vendorId,
          status: 'draft',
          order_date: orderDate || null,
          expected_date: expectedDate || null,
          notes: notes || null,
          created_by: user?.id,
        })
        .select('id')
        .single()

      if (poError) throw poError

      const { error: linesError } = await supabase.from('po_lines').insert(
        validLines.map((l) => ({
          po_id: po.id,
          item_id: l.item_id,
          description: l.description,
          qty: l.qty,
          unit: l.unit,
          unit_price: l.unit_price,
          total: l.qty * l.unit_price,
          coa_id: l.coa_id,
          is_inventory: l.is_inventory,
        }))
      )
      if (linesError) throw linesError

      if (prId) {
        await supabase.from('purchase_requisitions').update({ status: 'converted' }).eq('id', prId)
      }

      toast.success(t('purchasing.po.new.successCreated'))
      router.push(`/purchasing/po/${po.id}`)
    } catch (err: any) {
      toast.error(err.message || t('purchasing.po.new.errFailedCreate'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-20 text-center text-zinc-500 text-sm">{t('purchasing.po.new.loading')}</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/purchasing/po" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft className="h-4 w-4" /> {t('purchasing.po.new.backLink')}
      </Link>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{t('purchasing.po.new.title')}</h1>
            <p className="text-xs text-zinc-400">{prId ? t('purchasing.po.new.subtitlePrefilled') : t('purchasing.po.new.subtitleBlank')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{t('purchasing.po.new.vendorLabel')}</label>
              <select
                value={vendorId}
                onChange={(e) => {
                  if (e.target.value === '__add_new__') {
                    setAddVendorOpen(true)
                    return
                  }
                  setVendorId(e.target.value)
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl h-10 text-sm px-3 text-zinc-100"
              >
                <option value="">{t('purchasing.po.new.selectVendor')}</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                <option value="__add_new__">{t('purchasing.po.new.addNewVendor')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{t('purchasing.po.new.orderDateLabel')}</label>
              <DatePicker value={orderDate} onChange={setOrderDate} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{t('purchasing.po.new.expectedDeliveryLabel')}</label>
              <DatePicker value={expectedDate} onChange={setExpectedDate} placeholder={t('common.optional')} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">{t('purchasing.po.new.lineItemsLabel')} <span className="text-zinc-500 font-normal">{t('purchasing.po.new.lineItemsHint')}</span></label>
              <Button type="button" size="sm" variant="outline" onClick={addLine} className="border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs gap-1">
                <Plus className="h-3.5 w-3.5" /> {t('common.addLine')}
              </Button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-2.5">
                <span className="col-span-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.new.colItem')}</span>
                <span className="col-span-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.new.colQty')}</span>
                <span className="col-span-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.new.colUnit')}</span>
                <span className="col-span-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.new.colUnitPrice')}</span>
                <span className="col-span-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">{t('purchasing.po.new.colAccount')}</span>
                <span className="col-span-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide text-right">{t('purchasing.po.new.colTotal')}</span>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 items-center">
                  <select
                    value={line.item_id}
                    onChange={(e) => {
                      if (e.target.value === '__add_new__') {
                        setAddItemLineIdx(idx)
                        return
                      }
                      updateLine(idx, 'item_id', e.target.value)
                    }}
                    className="col-span-3 bg-zinc-900 border border-zinc-800 rounded-lg h-9 text-sm px-2 text-zinc-100"
                  >
                    <option value="">{t('purchasing.po.new.itemPlaceholder')}</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    <option value="__add_new__">{t('purchasing.po.new.addNewItem')}</option>
                  </select>
                  <input
                    type="number" min="0" step="any" value={line.qty}
                    onChange={(e) => updateLine(idx, 'qty', parseFloat(e.target.value) || 0)}
                    className="col-span-1 bg-zinc-900 border border-zinc-800 rounded-lg h-9 text-sm px-2 text-zinc-100" placeholder={t('purchasing.pr.new.qtyPlaceholder')}
                  />
                  <span className="col-span-1 text-xs text-zinc-500 text-center">{line.unit || '—'}</span>
                  <div className="col-span-2 space-y-1">
                    <input
                      type="number" min="0" step="any" value={line.unit_price}
                      onChange={(e) => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg h-9 text-sm px-2 text-zinc-100" placeholder={t('purchasing.po.new.colUnitPrice')}
                    />
                    {lastPrices[line.item_id] && (
                      <p className="text-[10px] text-zinc-500 px-0.5">
                        {t('purchasing.po.new.lastPrice', { price: formatRp(lastPrices[line.item_id].price), date: format(new Date(lastPrices[line.item_id].date), 'dd MMM') })}
                      </p>
                    )}
                  </div>
                  <div className="col-span-4">
                    <CoaCombobox coas={accounts} value={line.coa_id} onChange={(val) => updateLine(idx, 'coa_id', val)} placeholder={t('purchasing.po.new.accountPlaceholder')} />
                  </div>
                  <span className="col-span-1 text-xs text-zinc-300 font-mono text-right">{formatRp(line.qty * line.unit_price)}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(idx)} className="col-span-0 h-9 w-9 text-zinc-500 hover:text-red-400 justify-self-end">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 text-sm">
              <span className="text-zinc-400 mr-3">{t('purchasing.po.new.totalLabel')}</span>
              <span className="text-zinc-100 font-bold font-mono">{formatRp(total)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">{t('purchasing.po.new.notesLabel')}</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Link href="/purchasing/po">
              <Button type="button" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">{t('common.cancel')}</Button>
            </Link>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('purchasing.po.new.saveDraft')}
            </Button>
          </div>
        </form>
      </div>

      <AddRawItemDialog
        open={addItemLineIdx !== null}
        onOpenChange={(open) => !open && setAddItemLineIdx(null)}
        orgId={orgId || ''}
        accounts={accounts}
        onCreated={handleItemCreated}
      />

      <AddVendorDialog
        open={addVendorOpen}
        onOpenChange={setAddVendorOpen}
        orgId={orgId || ''}
        onCreated={handleVendorCreated}
      />
    </div>
  )
}
