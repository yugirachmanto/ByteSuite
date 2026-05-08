'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, Check, Save, Trash2, AlertTriangle, Plus } from 'lucide-react'

export default function InvoiceReviewPage() {
  const params = useParams()
  const router = useRouter()
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [invoice, setInvoice] = useState<any>(null)
  const [lineItems, setLineItems] = useState<any[]>([])
  const [itemMaster, setItemMaster] = useState<any[]>([])
  const [coa, setCoa] = useState<any[]>([])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: inv, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', params.id)
        .single()

      if (invError) {
        toast.error('Failed to load invoice')
        router.push('/invoices')
        return
      }

      setInvoice(inv)
      
      // Load extracted items if available
      if (inv.extracted_data?.line_items) {
        setLineItems(inv.extracted_data.line_items.map((item: any, idx: number) => ({
          ...item,
          id: item.id !== undefined ? item.id : idx,
          item_master_id: item.item_master_id || null,
          coa_id: item.coa_id || null,
          is_inventory: item.is_inventory !== undefined ? item.is_inventory : true
        })))
      }

      // Load item master and COA for mapping
      const { data: items } = await supabase.from('item_master').select('*')
      const { data: accounts } = await supabase.from('chart_of_accounts').select('*')
      
      setItemMaster(items || [])
      setCoa(accounts || [])
      setLoading(false)
    }

    fetchData()
  }, [params.id, supabase, router])

  const updateLineItem = (id: number | string, field: string, value: any) => {
    setLineItems(prev => prev.map(item => {
      if (String(item.id) === String(id)) {
        const updated = { ...item, [field]: value }
        if (field === 'qty' || field === 'unit_price') {
          updated.total = updated.qty * updated.unit_price
        }
        return updated
      }
      return item
    }))
  }

  const removeLineItem = (id: number | string) => {
    setLineItems(prev => prev.filter(item => String(item.id) !== String(id)))
  }

  const addLineItem = () => {
    const newId = lineItems.length > 0 ? Math.max(...lineItems.map(i => i.id)) + 1 : 0
    setLineItems(prev => [...prev, {
      id: newId,
      description: 'New Item',
      qty: 1,
      unit_price: 0,
      total: 0,
      item_master_id: null,
      is_inventory: true
    }])
  }

  // Use item.total (which auto-updates when qty or unit_price changes) as the source of truth
  const calculatedSubtotal = lineItems.reduce((acc, item) => acc + (item.total || 0), 0)
  const calculatedDiscount = invoice?.discount || 0
  const calculatedTax = invoice?.tax_total || 0
  const calculatedGrandTotal = calculatedSubtotal - calculatedDiscount + calculatedTax

  const handlePost = async () => {
    // Guard: prevent double-posting
    if (invoice.status === 'posted') {
      toast.error('This invoice has already been posted and is locked.')
      return
    }

    const unmapped = lineItems.filter(item => !item.item_master_id)
    if (unmapped.length > 0) {
      toast.error(`Please map all line items before posting. ${unmapped.length} item(s) unmapped.`)
      return
    }

    setPosting(true)
    try {
      // Pre-flight: check if invoice_lines already exist for this invoice
      // This prevents duplicate entries if a previous post failed mid-way
      const { data: existingLines } = await supabase
        .from('invoice_lines')
        .select('id')
        .eq('invoice_id', invoice.id)
        .limit(1)
      
      if (existingLines && existingLines.length > 0) {
        // Lines already written — just mark status as posted and stop
        await supabase.from('invoices').update({
          status: 'posted',
          updated_at: new Date().toISOString()
        }).eq('id', invoice.id)
        toast.success('Invoice marked as posted.')
        router.push('/invoices')
        return
      }

      // Step 1: Insert invoice_lines
      for (const item of lineItems) {
        const { error: lineError } = await supabase.from('invoice_lines').insert({
          invoice_id: invoice.id,
          item_master_id: item.item_master_id,
          description: item.description || '',
          qty: item.qty,
          unit: item.unit || '',
          unit_price: item.unit_price,
          total: item.total,
          is_inventory: true
        })
        if (lineError) throw new Error(`Invoice line insert failed: ${lineError.message}`)

        // Step 3: Upsert inventory_balance (add to stock)
        const { data: existing } = await supabase
          .from('inventory_balance')
          .select('qty_on_hand, inventory_value')
          .eq('outlet_id', selectedOutletId)
          .eq('item_id', item.item_master_id)
          .single()

        if (existing) {
          const { error: balErr } = await supabase
            .from('inventory_balance')
            .update({
              qty_on_hand: existing.qty_on_hand + item.qty,
              inventory_value: existing.inventory_value + item.total,
              updated_at: new Date().toISOString()
            })
            .eq('outlet_id', selectedOutletId)
            .eq('item_id', item.item_master_id)
          if (balErr) throw new Error(`Inventory balance update failed: ${balErr.message}`)
        } else {
          const { error: balErr } = await supabase.from('inventory_balance').insert({
            outlet_id: selectedOutletId,
            item_id: item.item_master_id,
            qty_on_hand: item.qty,
            inventory_value: item.total,
            updated_at: new Date().toISOString()
          })
          if (balErr) throw new Error(`Inventory balance insert failed: ${balErr.message}`)
        }

        // Step 4: Insert stock_ledger entry
        const { error: ledgerErr } = await supabase.from('stock_ledger').insert({
          outlet_id: selectedOutletId,
          item_id: item.item_master_id,
          txn_type: 'IN',
          qty: item.qty,
          unit_cost: item.unit_price,
          total_value: item.total,
          reference_type: 'invoice',
          reference_id: invoice.id
        })
        if (ledgerErr) throw new Error(`Stock ledger insert failed: ${ledgerErr.message}`)

        // Step 5: Insert stock_batch
        const { error: batchErr } = await supabase.from('stock_batches').insert({
          outlet_id: selectedOutletId,
          item_id: item.item_master_id,
          purchase_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
          original_qty: item.qty,
          qty_remaining: item.qty,
          unit_cost: item.unit_price
        })
        if (batchErr) throw new Error(`Stock batch insert failed: ${batchErr.message}`)
      }

      // Final: Mark invoice as posted and save final totals
      const { error: invoiceErr } = await supabase.from('invoices').update({
        status: 'posted',
        subtotal: calculatedSubtotal,
        tax_total: calculatedTax,
        grand_total: calculatedGrandTotal,
        vendor: invoice.vendor,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        discount: invoice.discount || 0,
        updated_at: new Date().toISOString()
      }).eq('id', invoice.id)
      if (invoiceErr) throw new Error(`Invoice status update failed: ${invoiceErr.message}`)

      toast.success('Invoice approved and posted to Inventory & GL!')
      router.push('/invoices')
    } catch (error: any) {
      console.error('Post invoice error:', error)
      toast.error(error.message || 'Failed to post invoice')
    } finally {
      setPosting(false)
    }
  }

  const handleSaveDraft = async () => {
    try {
      console.log('Saving Draft. lineItems:', lineItems)
      console.log('Saving Draft. invoice.extracted_data:', invoice.extracted_data)
      
      const payload = {
        subtotal: calculatedSubtotal,
        tax_total: calculatedTax,
        grand_total: calculatedGrandTotal,
        vendor: invoice.vendor,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        discount: invoice.discount || 0,
        extracted_data: {
          ...invoice.extracted_data,
          line_items: lineItems,
          discount: invoice.discount || 0
        }
      }
      console.log('Update payload:', payload)

      const { error } = await supabase.from('invoices').update(payload).eq('id', invoice.id)

      if (error) throw error

      // Refetch to confirm DB saved it correctly and to update local state
      const { data: updatedInv } = await supabase.from('invoices').select('extracted_data').eq('id', invoice.id).single()
      if (updatedInv) {
        setInvoice({ ...invoice, ...payload, extracted_data: updatedInv.extracted_data })
      }

      toast.success('Draft saved successfully!')
    } catch (error: any) {
      console.error('Save draft error:', error)
      toast.error(error.message || 'Failed to save draft')
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  const isPosted = invoice.status === 'posted'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Review Invoice</h2>
            <p className="text-zinc-400 text-sm">
              {isPosted ? 'This invoice has been posted and is locked.' : 'Review AI extraction and map items to inventory.'}
            </p>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          {isPosted && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 text-sm font-medium">
              <Check className="h-3.5 w-3.5" />
              Posted
            </div>
          )}
          <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100" onClick={handleSaveDraft}>
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </Button>
          {!isPosted && (
            <Button 
              className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              onClick={handlePost}
              disabled={posting}
            >
              {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Approve & Post
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Invoice Image */}
        <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <CardHeader className="border-b border-zinc-800 bg-zinc-900/50 py-3">
            <CardTitle className="text-sm font-medium text-zinc-400">Invoice Document</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex items-center justify-center bg-black min-h-[600px]">
            <img src={invoice.image_url} alt="Invoice" className="max-w-full h-auto" />
          </CardContent>
        </Card>

        {/* Right: Data Table */}
        <div className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="border-b border-zinc-800 py-3">
              <CardTitle className="text-sm font-medium text-zinc-400">Header Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 uppercase font-bold">Vendor</label>
                <Input 
                  value={invoice.vendor || ''} 
                  onChange={(e) => setInvoice({...invoice, vendor: e.target.value})}
                  className="bg-zinc-950 border-zinc-800 h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 uppercase font-bold">Invoice No</label>
                <Input 
                  value={invoice.invoice_no || ''} 
                  onChange={(e) => setInvoice({...invoice, invoice_no: e.target.value})}
                  className="bg-zinc-950 border-zinc-800 h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 uppercase font-bold">Invoice Date</label>
                <Input 
                  type="date"
                  value={invoice.invoice_date || ''} 
                  onChange={(e) => setInvoice({...invoice, invoice_date: e.target.value})}
                  className="bg-zinc-950 border-zinc-800 h-8 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="border-b border-zinc-800 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-400">Line Items</CardTitle>
              {!isPosted && lineItems.some(i => !i.item_master_id) && (
                <div className="flex items-center text-xs text-amber-500 gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Unmapped items
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={addLineItem} className="h-8 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 ml-auto">
                <Plus className="h-3 w-3 mr-1" /> Add Row
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40%] text-zinc-500 text-[10px] uppercase font-bold">Description / Match</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-center">Qty</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Price</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Total</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/20">
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-2">
                          <Input 
                            value={item.description || ''}
                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                            className="bg-zinc-950 border-zinc-800 h-8 text-xs w-full text-zinc-300"
                            placeholder="Item description"
                          />
                          <select 
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-md text-xs px-2 h-8 text-zinc-400 focus:ring-1 focus:ring-zinc-700 focus:outline-none"
                            value={item.item_master_id || ''}
                            onChange={(e) => updateLineItem(item.id, 'item_master_id', e.target.value)}
                          >
                            <option value="">Map to item master...</option>
                            {itemMaster.map(im => (
                              <option key={im.id} value={im.id}>{im.name}</option>
                            ))}
                          </select>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input 
                          type="number" 
                          value={item.qty} 
                          onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-950 border-zinc-800 h-7 text-xs w-16 mx-auto text-center p-0"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input 
                          type="number" 
                          value={item.unit_price} 
                          onChange={(e) => updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-950 border-zinc-800 h-7 text-xs w-24 ml-auto text-right p-1"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs font-bold text-zinc-100">
                          {new Intl.NumberFormat('id-ID').format(item.total)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-600 hover:text-red-400" onClick={() => removeLineItem(item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900 border-l-4 border-l-zinc-100">
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-2 text-zinc-400 text-sm">
                <span>Subtotal</span>
                <span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(calculatedSubtotal)}</span>
              </div>
              <div className="flex justify-between items-center mb-2 text-zinc-400 text-sm">
                <span className="text-red-400">Discount (Rp)</span>
                <Input 
                  type="number" 
                  value={invoice.discount || ''} 
                  placeholder="0"
                  onChange={(e) => setInvoice({...invoice, discount: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-950 border-zinc-800 h-7 text-xs w-24 text-right p-1 text-red-400"
                />
              </div>
              <div className="flex justify-between items-center mb-4 text-zinc-400 text-sm">
                <span>Tax Total</span>
                <Input 
                  type="number" 
                  value={invoice.tax_total || ''} 
                  placeholder="0"
                  onChange={(e) => setInvoice({...invoice, tax_total: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-950 border-zinc-800 h-7 text-xs w-24 text-right p-1"
                />
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                <span className="text-lg font-bold text-zinc-100">Grand Total</span>
                <span className="text-2xl font-bold text-zinc-100">
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(calculatedGrandTotal)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
