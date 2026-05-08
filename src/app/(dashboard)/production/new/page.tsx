'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { ArrowLeft, Loader2, Hammer, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { format } from 'date-fns'

export default function NewProductionPage() {
  const router = useRouter()
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()
  
  const [wipItems, setWipItems] = useState<any[]>([])
  const [selectedWipId, setSelectedWipId] = useState<string>('')
  const [qtyProduced, setQtyProduced] = useState<number>(0)
  const [productionDate, setProductionDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState<string>('')
  
  const [bom, setBom] = useState<any[]>([])
  const [stockLevels, setStockLevels] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function fetchWIP() {
      setLoading(true)
      const { data } = await supabase
        .from('item_master')
        .select('*')
        .eq('category', 'wip')
      if (data) setWipItems(data)
      setLoading(false)
    }
    fetchWIP()
  }, [supabase])

  useEffect(() => {
    if (!selectedWipId || !selectedOutletId) {
      setBom([])
      return
    }

    async function fetchBOMAndStock() {
      // 1. Get BOM for this item
      const { data: bomData } = await supabase
        .from('bom')
        .select(`
          input_item_id,
          qty_per_unit,
          item_master!bom_input_item_id_fkey (
            name,
            unit
          )
        `)
        .eq('output_item_id', selectedWipId)
      
      if (bomData) {
        setBom(bomData)
        
        // 2. Get current stock levels for these ingredients
        const itemIds = bomData.map(b => b.input_item_id)
        const { data: stockData } = await supabase
          .from('inventory_balance')
          .select('item_id, qty_on_hand')
          .eq('outlet_id', selectedOutletId)
          .in('item_id', itemIds)
        
        const levels: Record<string, number> = {}
        stockData?.forEach(s => {
          levels[s.item_id] = s.qty_on_hand
        })
        setStockLevels(levels)
      }
    }
    fetchBOMAndStock()
  }, [selectedWipId, selectedOutletId, supabase])

  const handlePost = async () => {
    if (!selectedWipId || !selectedOutletId || qtyProduced <= 0) return
    
    // Check for negative stock
    const wouldGoNegative = bom.some(line => {
      const needed = line.qty_per_unit * qtyProduced
      const available = stockLevels[line.input_item_id] || 0
      return needed > available
    })

    if (wouldGoNegative) {
      toast.error('Cannot post production: Insufficient raw material stock')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('post_production', {
        p_outlet_id: selectedOutletId,
        p_wip_item_id: selectedWipId,
        p_qty_produced: qtyProduced,
        p_production_date: productionDate,
        p_notes: notes
      })

      if (error) throw error

      toast.success('Production logged successfully! Inventory updated.')
      router.push('/production')
    } catch (error: any) {
      toast.error(error.message || 'Failed to log production')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedWip = wipItems.find(i => i.id === selectedWipId)

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/production">
          <Button variant="ghost" size="icon" className="text-zinc-400">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Log New Production</h2>
          <p className="text-zinc-400 text-sm">Enter production batch details to update inventory.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <Card className="lg:col-span-1 border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Batch Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wipItem">WIP Item</Label>
              <select
                id="wipItem"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-700"
                value={selectedWipId}
                onChange={(e) => setSelectedWipId(e.target.value)}
              >
                <option value="">Select item...</option>
                {wipItems.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qty">Qty Produced {selectedWip && `(${selectedWip.unit})`}</Label>
              <Input
                id="qty"
                type="number"
                value={qtyProduced}
                onChange={(e) => setQtyProduced(parseFloat(e.target.value))}
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Production Date</Label>
              <Input
                id="date"
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-700 min-h-[80px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Preview Column */}
        <Card className="lg:col-span-2 border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Deduction Preview</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedWipId ? (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-sm">
                Select a WIP item to preview raw material deductions
              </div>
            ) : bom.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-amber-500 bg-amber-500/5 text-sm p-8 text-center space-y-2">
                <AlertTriangle className="h-6 w-6" />
                <p>No BOM found for this item. Please define recipe in Settings/BOM first.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <Table>
                  <TableHeader className="border-zinc-800">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-zinc-500 text-[10px] uppercase font-bold">Ingredient</TableHead>
                      <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Required</TableHead>
                      <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Available</TableHead>
                      <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bom.map((line) => {
                      const needed = line.qty_per_unit * qtyProduced
                      const available = stockLevels[line.input_item_id] || 0
                      const balance = available - needed
                      const isLow = balance < 0
                      
                      return (
                        <TableRow key={line.input_item_id} className="border-zinc-800 hover:bg-zinc-800/20">
                          <TableCell className="text-zinc-300 py-4">
                            {line.item_master?.name}
                          </TableCell>
                          <TableCell className="text-right text-zinc-100 font-medium">
                            {needed} {line.item_master?.unit}
                          </TableCell>
                          <TableCell className="text-right text-zinc-500">
                            {available} {line.item_master?.unit}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${isLow ? 'text-red-500' : 'text-emerald-500'}`}>
                            {balance.toFixed(2)} {line.item_master?.unit}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                
                <div className="p-6 pt-0">
                  <Button 
                    className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                    size="lg"
                    disabled={submitting || qtyProduced <= 0 || bom.some(l => (stockLevels[l.input_item_id] || 0) < l.qty_per_unit * qtyProduced)}
                    onClick={handlePost}
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Hammer className="mr-2 h-5 w-5" />
                    )}
                    Post Production Batch
                  </Button>
                  {bom.some(l => (stockLevels[l.input_item_id] || 0) < l.qty_per_unit * qtyProduced) && (
                    <p className="mt-4 text-center text-xs text-red-500 flex items-center justify-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Cannot proceed: some ingredients are out of stock
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
