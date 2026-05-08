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
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { 
  Loader2, 
  ArrowLeft, 
  Check, 
  Save, 
  Trash2, 
  AlertTriangle, 
  Plus, 
  BookOpen,
  ArrowRightLeft
} from 'lucide-react'
import { formatRp } from '@/lib/format'

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
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      
      // Get user's org_id
      const { data: profile } = await supabase.from('user_profiles').select('org_id').single()
      setOrgId(profile?.org_id || null)

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
      
      // Load item master and COA for mapping
      const { data: items } = await supabase.from('item_master').select('*')
      const { data: accounts } = await supabase.from('chart_of_accounts').select('*').eq('is_active', true).order('code')
      
      setItemMaster(items || [])
      setCoa(accounts || [])

      // Load extracted items if available
      if (inv.extracted_data?.line_items) {
        setLineItems(inv.extracted_data.line_items.map((item: any, idx: number) => {
          const matchedItem = (items || []).find(im => im.id === item.item_master_id)
          return {
            ...item,
            id: item.id !== undefined ? item.id : idx,
            item_master_id: item.item_master_id || null,
            coa_id: item.coa_id || matchedItem?.default_coa_id || null,
            is_inventory: item.is_inventory !== undefined ? item.is_inventory : (!!item.item_master_id || true)
          }
        }))
      }

      setLoading(false)
    }

    fetchData()
  }, [params.id, supabase, router])

  const updateLineItem = (id: number | string, field: string, value: any) => {
    setLineItems(prev => prev.map(item => {
      if (String(item.id) === String(id)) {
        let updated = { ...item, [field]: value }
        
        // Auto-match COA when item is selected
        if (field === 'item_master_id' && value) {
          const matchedItem = itemMaster.find(im => im.id === value)
          if (matchedItem?.default_coa_id) {
            updated.coa_id = matchedItem.default_coa_id
            updated.is_inventory = true
          }
        }

        if (field === 'qty' || field === 'unit_price') {
          updated.total = (updated.qty || 0) * (updated.unit_price || 0)
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
      coa_id: null,
      is_inventory: true
    }])
  }

  const calculatedSubtotal = lineItems.reduce((acc, item) => acc + (item.total || 0), 0)
  const calculatedDiscount = invoice?.discount || 0
  const calculatedTax = invoice?.tax_total || 0
  const calculatedGrandTotal = calculatedSubtotal - calculatedDiscount + calculatedTax

  const handlePost = async () => {
    if (invoice.status === 'posted') return

    // Validation
    const invalid = lineItems.filter(item => !item.coa_id || (item.is_inventory && !item.item_master_id))
    if (invalid.length > 0) {
      toast.error('Please map all items to a COA account. Inventory items also require an Item Master match.')
      return
    }

    setPosting(true)
    try {
      // 1. Update invoice metadata first
      await supabase.from('invoices').update({
        subtotal: calculatedSubtotal,
        tax_total: calculatedTax,
        grand_total: calculatedGrandTotal,
        vendor: invoice.vendor,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        discount: invoice.discount || 0,
      }).eq('id', invoice.id)

      // 2. Call the new Dual-Mode RPC
      const { error: rpcError } = await supabase.rpc('post_invoice', {
        p_invoice_id: invoice.id,
        p_outlet_id: selectedOutletId,
        p_org_id: orgId,
        p_lines: lineItems.map(item => ({
          item_id: item.is_inventory ? item.item_master_id : null,
          qty: item.qty,
          unit_price: item.unit_price,
          total_price: item.total,
          description: item.description,
          coa_id: item.coa_id,
          is_inventory: item.is_inventory
        }))
      })

      if (rpcError) throw rpcError

      toast.success('Invoice recorded and journalized successfully!')
      router.push('/invoices')
    } catch (error: any) {
      console.error('Post error:', error)
      toast.error(error.message || 'Failed to post invoice')
    } finally {
      setPosting(false)
    }
  }

  const handleSaveDraft = async () => {
    try {
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
        }
      }
      await supabase.from('invoices').update(payload).eq('id', invoice.id)
      toast.success('Draft saved.')
    } catch (error: any) {
      toast.error('Failed to save draft.')
    }
  }

  if (loading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-zinc-500" /></div>

  const isPosted = invoice.status === 'posted'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Review & Journalize</h2>
            <p className="text-zinc-400 text-sm">Review extracted data and map to accounting accounts.</p>
          </div>
        </div>
        <div className="flex gap-3">
          {isPosted && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 text-sm font-medium">
              <Check className="h-3.5 w-3.5" /> Posted
            </div>
          )}
          <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300" onClick={handleSaveDraft}>
            <Save className="mr-2 h-4 w-4" /> Save Draft
          </Button>
          {!isPosted && (
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handlePost} disabled={posting}>
              {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpen className="mr-2 h-4 w-4" />}
              Approve & Post
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Invoice Image */}
        <div className="xl:col-span-5 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden sticky top-8">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50 py-3">
              <CardTitle className="text-sm font-medium text-zinc-400">Digital Copy</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex items-center justify-center bg-black min-h-[500px]">
              <img src={invoice.image_url} alt="Invoice" className="max-w-full h-auto" />
            </CardContent>
          </Card>
        </div>

        {/* Right: Data Table */}
        <div className="xl:col-span-7 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="border-b border-zinc-800 py-3">
              <CardTitle className="text-sm font-medium text-zinc-400">Header Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Vendor</label>
                <Input value={invoice.vendor || ''} onChange={(e) => setInvoice({...invoice, vendor: e.target.value})} className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Invoice No</label>
                <Input value={invoice.invoice_no || ''} onChange={(e) => setInvoice({...invoice, invoice_no: e.target.value})} className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Invoice Date</label>
                <Input type="date" value={invoice.invoice_date || ''} onChange={(e) => setInvoice({...invoice, invoice_date: e.target.value})} className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="border-b border-zinc-800 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-400">Line Items & Account Mapping</CardTitle>
              <Button variant="ghost" size="sm" onClick={addLineItem} className="h-8 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[80px] text-zinc-500 text-[10px] uppercase font-bold">Stock?</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold">Description / Mapping</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Qty</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Amount</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/20">
                      <TableCell className="text-center">
                        <Switch 
                          checked={item.is_inventory} 
                          onCheckedChange={(val) => updateLineItem(item.id, 'is_inventory', val)}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-2">
                          <Input 
                            value={item.description || ''}
                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                            className="bg-zinc-950 border-zinc-800 h-8 text-xs font-medium"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <select 
                              className="bg-zinc-950 border border-zinc-800 rounded px-2 h-7 text-[10px] text-zinc-400 focus:outline-none"
                              value={item.coa_id || ''}
                              onChange={(e) => updateLineItem(item.id, 'coa_id', e.target.value)}
                            >
                              <option value="">Select Account...</option>
                              {coa.map(acc => <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>)}
                            </select>
                            
                            {item.is_inventory ? (
                              <select 
                                className="bg-zinc-950 border border-zinc-800 rounded px-2 h-7 text-[10px] text-emerald-400/80 focus:outline-none"
                                value={item.item_master_id || ''}
                                onChange={(e) => updateLineItem(item.id, 'item_master_id', e.target.value)}
                              >
                                <option value="">Map to Stock Item...</option>
                                {itemMaster.map(im => <option key={im.id} value={im.id}>{im.name}</option>)}
                              </select>
                            ) : (
                              <div className="h-7 border border-zinc-800/30 rounded flex items-center px-2 text-[10px] text-zinc-600 bg-zinc-950/50 italic">
                                Direct Expense
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input 
                          type="number" 
                          value={item.qty} 
                          onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-950 border-zinc-800 h-7 text-xs w-16 ml-auto text-right font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Input 
                            type="number" 
                            value={item.unit_price} 
                            onChange={(e) => updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="bg-zinc-950 border-zinc-800 h-7 text-xs w-24 text-right font-mono"
                          />
                          <span className="text-[10px] font-bold text-zinc-100">{formatRp(item.total)}</span>
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

          <div className="grid md:grid-cols-2 gap-6">
            {/* Totals */}
            <Card className="border-zinc-800 bg-zinc-900 border-l-4 border-l-zinc-100 h-fit">
              <CardContent className="p-6 space-y-3">
                <div className="flex justify-between text-zinc-400 text-sm">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatRp(calculatedSubtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-red-400 text-sm">
                  <span>Discount</span>
                  <Input type="number" value={invoice.discount || ''} onChange={(e) => setInvoice({...invoice, discount: parseFloat(e.target.value) || 0})} className="bg-zinc-950 border-zinc-800 h-7 w-24 text-right font-mono text-red-400" />
                </div>
                <div className="flex justify-between items-center text-zinc-400 text-sm">
                  <span>Tax (PPN)</span>
                  <Input type="number" value={invoice.tax_total || ''} onChange={(e) => setInvoice({...invoice, tax_total: parseFloat(e.target.value) || 0})} className="bg-zinc-950 border-zinc-800 h-7 w-24 text-right font-mono" />
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                  <span className="text-lg font-bold text-zinc-100">Grand Total</span>
                  <span className="text-2xl font-bold text-zinc-100 font-mono">{formatRp(calculatedGrandTotal)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Journal Preview */}
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="border-b border-zinc-800 py-3">
                <CardTitle className="text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-2">
                  <ArrowRightLeft className="h-3 w-3" /> Journal Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {lineItems.map((item, idx) => item.coa_id && (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <span className="text-emerald-400 font-medium">DR {coa.find(a => a.id === item.coa_id)?.name}</span>
                    <span className="text-zinc-400 font-mono">{formatRp(item.total)}</span>
                  </div>
                ))}
                {calculatedTax > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-emerald-400 font-medium">DR PPN Masukan</span>
                    <span className="text-zinc-400 font-mono">{formatRp(calculatedTax)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] pt-2 border-t border-zinc-800">
                  <span className="text-amber-400 font-medium ml-4">CR Hutang Usaha (AP)</span>
                  <span className="text-zinc-100 font-mono">{formatRp(calculatedGrandTotal)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
