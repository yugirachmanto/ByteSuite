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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Search, Loader2, Plus, ArrowLeft, ArrowRight, ArrowRightLeft, BookOpen, Check, Save, Trash2, Edit2, AlertCircle, Package, Receipt, Calculator, ChevronRight, Layers, LayoutGrid, Tag, FileText, CheckCircle2, History, TrendingUp, AlertTriangle, FileSpreadsheet, Download } from 'lucide-react'
import { STANDARD_UOMS } from '@/lib/constants'
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
  const [transportFee, setTransportFee] = useState<number>(0)
  const [newItemModalOpen, setNewItemModalOpen] = useState<number | string | null>(null)
  const [journalPreview, setJournalPreview] = useState<any[] | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [newItemData, setNewItemData] = useState<any>({
    default_coa_id: '',
    purchase_unit: '',
    conversion_factor: 1
  })
  const [selectedCreditCoaId, setSelectedCreditCoaId] = useState<string>('')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      
      // Get user's org_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      
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
          // Smart matching: Try to find item by ID first, then by Name (case-insensitive)
          const matchedItem = (items || []).find(im => 
            im.id === item.item_master_id || 
            im.name.toLowerCase() === item.description?.toLowerCase()
          )
          
          return {
            ...item,
            id: item.id !== undefined ? item.id : idx,
            item_master_id: item.item_master_id || matchedItem?.id || null,
            coa_id: item.coa_id || matchedItem?.default_coa_id || null,
            is_inventory: item.is_inventory !== undefined ? item.is_inventory : (!!(item.item_master_id || matchedItem?.id) || true)
          }
        }))
      }

      // If already posted, fetch the ACTUAL account used in GL
      if (inv?.status === 'posted') {
        const { data: glCredit } = await supabase
          .from('gl_entries')
          .select('coa_id')
          .eq('reference_id', inv.id)
          .eq('reference_type', 'invoice')
          .gt('credit', 0)
          .order('credit', { ascending: false }) // Get the primary credit
          .limit(1)
          .single()
        
        if (glCredit) {
          setSelectedCreditCoaId(glCredit.coa_id)
          setLoading(false)
          return
        }
      }

      // Otherwise fetch default AP mapping to initialize selectedCreditCoaId
      const { data: mapping } = await supabase
        .from('default_coa_mappings')
        .select('coa_id')
        .eq('org_id', profile?.org_id)
        .eq('account_role', 'accounts_payable')
        .single()
      
      if (mapping?.coa_id) {
        setSelectedCreditCoaId(mapping.coa_id)
      } else {
        // Fallback to hardcoded code '2-1-001'
        const apAccount = accounts?.find(acc => acc.code === '2-1-001')
        if (apAccount) setSelectedCreditCoaId(apAccount.id)
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
        } else if (field === 'total') {
          if (updated.qty) {
            updated.unit_price = (updated.total || 0) / updated.qty
          }
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
  const calculatedGrandTotal = calculatedSubtotal - calculatedDiscount + calculatedTax + transportFee

  const handleDistributeFees = () => {
    const netFees = calculatedTax + transportFee - calculatedDiscount
    if (netFees === 0 && calculatedDiscount === 0 && calculatedTax === 0 && transportFee === 0) {
      toast.error('No fees or discounts to distribute')
      return
    }
    if (calculatedSubtotal === 0) {
      toast.error('Subtotal is 0, cannot distribute fees')
      return
    }

    setLineItems(prev => prev.map(item => {
      const weight = (item.total || 0) / calculatedSubtotal
      const share = weight * netFees
      const newTotal = (item.total || 0) + share
      return {
        ...item,
        total: newTotal,
        unit_price: item.qty ? newTotal / item.qty : 0
      }
    }))

    setInvoice(prev => ({
      ...prev,
      tax_total: 0,
      discount: 0
    }))
    setTransportFee(0)
    toast.success('Fees and discounts distributed proportionally to items')
  }

  const handleRefreshPreview = async () => {
    if (!orgId || !invoice?.id) return
    console.log('Refreshing preview with credit COA:', selectedCreditCoaId)
    setLoadingPreview(true)
    try {
      const { data, error } = await supabase.rpc('preview_journal', {
        p_invoice_id: invoice.id,
        p_org_id: orgId,
        p_lines: lineItems.map(item => ({
          item_id: item.is_inventory ? item.item_master_id : null,
          total_price: item.total,
          description: item.description,
          coa_id: item.coa_id,
          ppn_amount: 0
        })),
        p_credit_coa_id: selectedCreditCoaId || null
      })
      if (error) throw error
      setJournalPreview(data || [])
    } catch (error: any) {
      toast.error(error.message || 'Failed to preview journal')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleCreateNewItem = async () => {
    if (!newItemData.name || !newItemData.unit) {
      toast.error('Name and unit are required')
      return
    }

    const existing = itemMaster.find(im => im.name.toLowerCase() === newItemData.name?.toLowerCase())
    if (existing) {
      toast.error(`Item "${newItemData.name}" already exists in your catalog.`)
      return
    }

    setPosting(true)
    try {
      const { data, error } = await supabase
        .from('item_master')
        .insert({
          org_id: orgId,
          name: newItemData.name,
          unit: newItemData.unit,
          category: newItemData.category,
          default_coa_id: newItemData.default_coa_id || null,
          purchase_unit: newItemData.purchase_unit || newItemData.unit,
          conversion_factor: newItemData.conversion_factor || 1,
          is_inventory: true
        })
        .select()
        .single()

      if (error) throw error

      setItemMaster(prev => [...prev, data])
      
      if (newItemModalOpen !== null) {
        updateLineItem(newItemModalOpen, 'item_master_id', data.id)
        if (data.default_coa_id) {
          updateLineItem(newItemModalOpen, 'coa_id', data.default_coa_id)
        }
      }

      setNewItemModalOpen(null)
      toast.success('New stock item created successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create item')
    } finally {
      setPosting(false)
    }
  }

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
      const { error: updateError } = await supabase.from('invoices').update({
        subtotal: calculatedSubtotal,
        tax_total: calculatedTax,
        grand_total: calculatedGrandTotal,
        vendor: invoice.vendor,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        discount: invoice.discount || 0,
      }).eq('id', invoice.id)

      if (updateError) {
        console.error('Invoice update error:', JSON.stringify(updateError))
        throw new Error(`Failed to update invoice: ${updateError.message}`)
      }

      // 2. Call the post_invoice RPC
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
        })),
        p_credit_coa_id: selectedCreditCoaId || null
      })

      if (rpcError) {
        console.error('RPC error (raw):', JSON.stringify(rpcError))
        throw new Error(`Post failed: ${rpcError.message || rpcError.details || rpcError.hint || JSON.stringify(rpcError)}`)
      }

      toast.success('Invoice recorded and journalized successfully!')
      router.push('/invoices')
    } catch (error: any) {
      console.error('Post error:', error?.message || JSON.stringify(error))
      toast.error(error?.message || 'Failed to post invoice')
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
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                {invoice.image_url?.toLowerCase().includes('.pdf') ? (
                  <FileText className="h-4 w-4 text-red-400" />
                ) : (
                  <Receipt className="h-4 w-4 text-zinc-500" />
                )}
                Digital Copy
              </CardTitle>
              <a
                href={invoice.image_url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                Open <ArrowRight className="h-3 w-3" />
              </a>
            </CardHeader>
            <CardContent className="p-0 bg-black" style={{ height: '75vh' }}>
              {invoice.image_url?.toLowerCase().includes('.pdf') ? (
                <iframe
                  src={`${invoice.image_url}#toolbar=1&navpanes=1&scrollbar=1`}
                  className="w-full h-full border-0"
                  title="Invoice PDF Preview"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full min-h-[500px]">
                  <img src={invoice.image_url} alt="Invoice" className="max-w-full h-auto max-h-full object-contain" />
                </div>
              )}
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
                <Input value={invoice.vendor ?? ''} onChange={(e) => setInvoice({...invoice, vendor: e.target.value})} className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Invoice No</label>
                <Input value={invoice.invoice_no ?? ''} onChange={(e) => setInvoice({...invoice, invoice_no: e.target.value})} className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Invoice Date</label>
                <Input type="date" value={invoice.invoice_date ?? ''} onChange={(e) => setInvoice({...invoice, invoice_date: e.target.value})} className="bg-zinc-950 border-zinc-800 h-8 text-sm" />
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
                            value={item.description ?? ''}
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
                              <div className="flex gap-1 items-center">
                                <select 
                                  className="bg-zinc-950 border border-zinc-800 rounded px-2 h-7 text-[10px] text-emerald-400/80 focus:outline-none flex-1"
                                  value={item.item_master_id || ''}
                                  onChange={(e) => updateLineItem(item.id, 'item_master_id', e.target.value)}
                                >
                                  <option value="">Map to Stock Item...</option>
                                  {itemMaster.map(im => <option key={im.id} value={im.id}>{im.name}</option>)}
                                </select>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-emerald-400 border border-zinc-800 rounded flex-shrink-0" 
                                  onClick={() => {
                                    setNewItemData({
                                      name: item.description || '',
                                      unit: item.unit || 'pcs',
                                      category: 'raw',
                                      default_coa_id: item.coa_id || ''
                                    })
                                    setNewItemModalOpen(item.id)
                                  }}
                                  title="Add new item"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
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
                          value={isNaN(item.qty) ? 0 : (item.qty ?? 0)} 
                          onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                          className="bg-zinc-950 border-zinc-800 h-7 text-xs w-16 ml-auto text-right font-mono"
                        />
                        {item.item_master_id && (() => {
                          const im = itemMaster.find(x => x.id === item.item_master_id)
                          if (im && im.conversion_factor > 1) {
                            return <div className="text-[9px] text-blue-400 mt-1 uppercase font-bold">= {(item.qty * im.conversion_factor).toLocaleString()} {im.unit}</div>
                          }
                          return null
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Input 
                            type="number" 
                            value={isNaN(item.unit_price) ? 0 : (item.unit_price ?? 0)} 
                            onChange={(e) => updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="bg-zinc-950 border-zinc-800 h-7 text-xs w-24 text-right font-mono"
                          />
                          <Input 
                            type="number" 
                            value={isNaN(item.total) ? 0 : (item.total ?? 0)} 
                            onChange={(e) => updateLineItem(item.id, 'total', parseFloat(e.target.value) || 0)}
                            className="bg-zinc-950 border-zinc-800 h-7 text-xs w-28 text-right font-mono font-bold text-zinc-100"
                          />
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
                  <Input type="number" value={isNaN(invoice.discount) ? 0 : (invoice.discount ?? 0)} onChange={(e) => setInvoice({...invoice, discount: parseFloat(e.target.value) || 0})} className="bg-zinc-950 border-zinc-800 h-7 w-24 text-right font-mono text-red-400" />
                </div>
                <div className="flex justify-between items-center text-zinc-400 text-sm">
                  <span>Tax (PPN/PB1)</span>
                  <Input type="number" value={isNaN(invoice.tax_total) ? 0 : (invoice.tax_total ?? 0)} onChange={(e) => setInvoice({...invoice, tax_total: parseFloat(e.target.value) || 0})} className="bg-zinc-950 border-zinc-800 h-7 w-24 text-right font-mono" />
                </div>
                <div className="flex justify-between items-center text-amber-400/80 text-sm">
                  <span>Transport (Ongkir)</span>
                  <Input type="number" value={isNaN(transportFee) ? 0 : (transportFee ?? 0)} onChange={(e) => setTransportFee(parseFloat(e.target.value) || 0)} className="bg-zinc-950 border-zinc-800 h-7 w-24 text-right font-mono" />
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                  <span className="text-lg font-bold text-zinc-100">Grand Total</span>
                  <span className="text-2xl font-bold text-zinc-100 font-mono">{formatRp(calculatedGrandTotal)}</span>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full mt-2 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700" 
                  onClick={handleDistributeFees}
                  disabled={calculatedTax === 0 && transportFee === 0 && calculatedDiscount === 0}
                >
                  Distribute Fees to Items
                </Button>

                {/* Closing Account Selection */}
                <div className="pt-4 mt-2 border-t border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Closing Account (Credit)</label>
                    <span className="text-[10px] text-zinc-600 italic">Usually Hutang or Cash</span>
                  </div>
                  <select 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 h-10 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                    value={selectedCreditCoaId}
                    onChange={(e) => setSelectedCreditCoaId(e.target.value)}
                  >
                    <option value="">Select Closing Account...</option>
                    {coa.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Journal Preview */}
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="border-b border-zinc-800 py-3 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-2">
                  <ArrowRightLeft className="h-3 w-3" /> Journal Preview
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleRefreshPreview} 
                  disabled={loadingPreview}
                  className="h-6 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  {loadingPreview ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {!journalPreview ? (
                  <div className="text-center text-zinc-600 text-xs py-4">
                    Click Refresh to generate preview from accounting rules.
                  </div>
                ) : journalPreview.length === 0 ? (
                  <div className="text-center text-zinc-600 text-xs py-4">
                    No journal entries generated. Check COA mappings.
                  </div>
                ) : (
                  <>
                    {journalPreview.map((entry, idx) => (
                      <div key={idx} className={`flex justify-between text-[11px] ${entry.debit > 0 ? '' : 'pt-2 border-t border-zinc-800'}`}>
                        <span className={`${entry.debit > 0 ? 'text-emerald-400' : 'text-amber-400 ml-4'} font-medium`}>
                          {entry.debit > 0 ? 'DR' : 'CR'} {entry.coa_name || entry.coa_code}
                        </span>
                        <span className="text-zinc-400 font-mono">
                          {formatRp(entry.debit > 0 ? entry.debit : entry.credit)}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* New Item Modal */}
      <Dialog open={newItemModalOpen !== null} onOpenChange={(open) => !open && setNewItemModalOpen(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Create New Stock Item</DialogTitle>
            <DialogDescription className="text-zinc-400">Quickly add a new item to your master data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Item Name</label>
              <Input 
                value={newItemData.name ?? ''}
                onChange={e => setNewItemData({...newItemData, name: e.target.value})}
                className="bg-zinc-900 border-zinc-800 h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Category</label>
                <select 
                  value={newItemData.category}
                  onChange={e => setNewItemData({...newItemData, category: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100 focus:outline-none"
                >
                  <option value="raw">Raw Material</option>
                  <option value="wip">WIP</option>
                  <option value="packaging">Packaging</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Default COA (Optional)</label>
                <select 
                  value={newItemData.default_coa_id}
                  onChange={e => setNewItemData({...newItemData, default_coa_id: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100 focus:outline-none"
                >
                  <option value="">No Default Account</option>
                  {coa.map(acc => <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>)}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest flex items-center gap-2">
                <Layers className="h-3 w-3 text-blue-500" /> UOM Conversion Formula
              </p>
              <div className="flex items-center gap-2 bg-zinc-950/30 p-2.5 rounded-lg border border-zinc-800/50">
                <span className="text-zinc-500 font-mono text-sm pl-1">1</span>
                <div className="flex-1">
                  <Input 
                    value={newItemData.purchase_unit ?? ''}
                    onChange={e => setNewItemData({...newItemData, purchase_unit: e.target.value})}
                    className="bg-zinc-900 border-zinc-800 h-8 text-xs"
                    placeholder="Purchase Unit"
                  />
                </div>
                <span className="text-zinc-500 font-mono text-sm">=</span>
                <div className="flex-1">
                  <Input 
                    type="number"
                    value={isNaN(newItemData.conversion_factor) ? 1 : (newItemData.conversion_factor ?? 1)}
                    onChange={e => setNewItemData({...newItemData, conversion_factor: parseFloat(e.target.value) || 1})}
                    className="bg-zinc-900 border-zinc-800 h-8 text-xs text-center"
                  />
                </div>
                <div className="flex-1">
                  <select 
                    value={newItemData.unit}
                    onChange={e => setNewItemData({...newItemData, unit: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 h-8 text-[10px] text-zinc-100 focus:outline-none"
                  >
                    {STANDARD_UOMS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[9px] text-zinc-500 italic pl-1">
                Example: 1 <strong>Bottle</strong> = <strong>500</strong> <strong>ML</strong>.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewItemModalOpen(null)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
              Cancel
            </Button>
            <Button onClick={handleCreateNewItem} disabled={posting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
