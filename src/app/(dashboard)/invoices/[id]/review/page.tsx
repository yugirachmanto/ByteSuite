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
import { Loader2, ArrowLeft, Check, Save, Trash2, AlertTriangle } from 'lucide-react'

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
          id: idx,
          item_master_id: null,
          coa_id: null,
          is_inventory: true
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

  const updateLineItem = (id: number, field: string, value: any) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value, total: field === 'qty' || field === 'unit_price' ? (field === 'qty' ? value : item.qty) * (field === 'unit_price' ? value : item.unit_price) : item.total } : item
    ))
  }

  const handlePost = async () => {
    if (lineItems.some(item => !item.item_master_id)) {
      toast.error('Please map all items to item master before posting')
      return
    }

    setPosting(true)
    try {
      // 1. Get user profile for org_id
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single()

      if (!profile) throw new Error('User profile not found')

      // 2. Call the atomic RPC
      const { error: rpcError } = await supabase.rpc('post_invoice', {
        p_invoice_id: invoice.id,
        p_outlet_id: selectedOutletId,
        p_org_id: profile.organization_id,
        p_lines: lineItems.map(item => ({
          item_id: item.item_master_id,
          qty: item.qty,
          unit_price: item.unit_price,
          total_price: item.total
        }))
      })

      if (rpcError) throw rpcError

      toast.success('Invoice approved and posted to Inventory & GL!')
      router.push('/invoices')
    } catch (error: any) {
      toast.error(error.message || 'Failed to post invoice')
    } finally {
      setPosting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Review Invoice</h2>
            <p className="text-zinc-400 text-sm">Review AI extraction and map items to inventory.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-zinc-800 bg-zinc-900 text-zinc-300">
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </Button>
          <Button 
            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            onClick={handlePost}
            disabled={posting}
          >
            {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Approve & Post
          </Button>
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
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="border-b border-zinc-800 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-400">Line Items</CardTitle>
              {lineItems.some(i => !i.item_master_id) && (
                <div className="flex items-center text-xs text-amber-500 gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Unmapped items
                </div>
              )}
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
                        <div className="space-y-1">
                          <div className="text-xs text-zinc-300 font-medium">{item.description}</div>
                          <select 
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-sm text-[10px] px-1 py-0.5 text-zinc-400"
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
                          onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 h-7 text-xs w-16 mx-auto text-center p-0"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs text-zinc-300">
                          {new Intl.NumberFormat('id-ID').format(item.unit_price)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs font-bold text-zinc-100">
                          {new Intl.NumberFormat('id-ID').format(item.total)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-600 hover:text-red-400">
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
                <span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(invoice.subtotal || 0)}</span>
              </div>
              <div className="flex justify-between items-center mb-4 text-zinc-400 text-sm">
                <span>Tax Total</span>
                <span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(invoice.tax_total || 0)}</span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                <span className="text-lg font-bold text-zinc-100">Grand Total</span>
                <span className="text-2xl font-bold text-zinc-100">
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(invoice.grand_total || 0)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
