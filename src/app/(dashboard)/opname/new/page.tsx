'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { ArrowLeft, Loader2, Save, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { format } from 'date-fns'

export default function NewOpnamePage() {
  const router = useRouter()
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()
  
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [opnameDate, setOpnameDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchInventory() {
      setLoading(true)
      const { data } = await supabase
        .from('inventory_balance')
        .select(`
          qty_on_hand,
          inventory_value,
          item_id,
          item_master (
            id,
            name,
            unit,
            category
          )
        `)
        .eq('outlet_id', selectedOutletId)
      
      if (data) {
        setItems(data.map(d => ({
          ...d,
          physical_qty: d.qty_on_hand, // Default to system qty
          variance_reason: null
        })))
      }
      setLoading(false)
    }
    fetchInventory()
  }, [selectedOutletId, supabase])

  const handleQtyChange = (itemId: string, val: string) => {
    const num = parseInt(val)
    setItems(items.map(item => 
      item.item_id === itemId 
        ? { ...item, physical_qty: isNaN(num) ? 0 : num }
        : item
    ))
  }

  const handleReasonChange = (itemId: string, reason: string) => {
    setItems(items.map(item => 
      item.item_id === itemId 
        ? { ...item, variance_reason: reason }
        : item
    ))
  }

  const handlePost = async () => {
    if (!selectedOutletId) return
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user?.id).single()

      const entries = items.map(item => ({
        outlet_id: selectedOutletId,
        item_id: item.item_id,
        system_qty: item.qty_on_hand,
        physical_qty: item.physical_qty,
        opname_date: opnameDate,
        variance_reason: item.variance_reason
      }))

      const { data: insertedLogs, error } = await supabase
        .from('opname_log')
        .insert(entries)
        .select('id, item_id, physical_qty, system_qty')
      if (error) throw error

      // Apply adjustments for items with variance
      const adjustedItems = items.filter(item => item.physical_qty !== item.qty_on_hand)

      for (const item of adjustedItems) {
        const variance = item.physical_qty - item.qty_on_hand
        const logId = insertedLogs?.find(l => l.item_id === item.item_id)?.id

        // Calculate value adjustment based on average cost
        const avgCost = item.qty_on_hand > 0 ? (item.inventory_value / item.qty_on_hand) : 0
        const valueAdjustment = variance * avgCost
        const newInventoryValue = item.inventory_value + valueAdjustment

        // Update inventory_balance to match physical count and new value
        await supabase
          .from('inventory_balance')
          .update({
            qty_on_hand: item.physical_qty,
            inventory_value: Math.max(0, newInventoryValue), // prevent negative value
            updated_at: new Date().toISOString()
          })
          .eq('outlet_id', selectedOutletId)
          .eq('item_id', item.item_id)

        // Write stock_ledger entry for the adjustment
        await supabase.from('stock_ledger').insert({
          outlet_id: selectedOutletId,
          item_id: item.item_id,
          txn_type: 'OPNAME_ADJ',
          qty: variance,
          unit_cost: avgCost,
          total_value: Math.abs(valueAdjustment),
          reference_type: 'opname',
          reference_id: logId || null
        })

        // If it's a negative variance (loss) with a reason, generate a GL Journal
        if (variance < 0 && item.variance_reason) {
          // Find correct expense COA
          let expenseCoaCode = '5-3-00-050' // Default to Cost of Variance
          if (item.variance_reason === 'spoilage' || item.variance_reason === 'waste') {
            if (item.item_master?.category === 'raw' || item.item_master?.category === 'wip' || item.item_master?.category === 'finished') {
              // Food or generic
              expenseCoaCode = '5-1-10-030' // Cost of Food Spoil / Waste
              // Note: If we had a clear way to distinguish Beverage vs Food here, we'd use '5-2-00-040'
            }
          }

          // Fetch COAs
          const { data: coas } = await supabase.from('chart_of_accounts').select('id, code').eq('org_id', profile?.org_id)
          const inventoryCoa = coas?.find(c => c.code === '1-3-00-000') // INVENTORIES (Asset)
          const expenseCoa = coas?.find(c => c.code === expenseCoaCode)

          if (inventoryCoa && expenseCoa && Math.abs(valueAdjustment) > 0) {
            // Create Journal
            const { data: journal } = await supabase.from('gl_journals').insert({
              org_id: profile?.org_id,
              outlet_id: selectedOutletId,
              journal_number: `OPJ-${Date.now()}-${item.item_id.substring(0,4)}`,
              date: opnameDate,
              description: `Opname Adjustment (${item.variance_reason}) for ${item.item_master?.name}`,
              status: 'posted',
              source_system: 'inventory'
            }).select('id').single()

            if (journal) {
              await supabase.from('gl_journal_lines').insert([
                {
                  journal_id: journal.id,
                  coa_id: expenseCoa.id,
                  debit: Math.abs(valueAdjustment),
                  credit: 0,
                  description: `Spoilage/Waste Expense - ${item.item_master?.name}`
                },
                {
                  journal_id: journal.id,
                  coa_id: inventoryCoa.id,
                  debit: 0,
                  credit: Math.abs(valueAdjustment),
                  description: `Inventory Asset Reduction - ${item.item_master?.name}`
                }
              ])
            }
          }
        }
      }

      const adjCount = adjustedItems.length
      toast.success(
        adjCount > 0
          ? `Opname posted! ${adjCount} item(s) adjusted to match physical count.`
          : 'Opname posted. All items matched — no adjustments needed.'
      )
      router.push('/opname')
    } catch (error: any) {
      toast.error(error.message || 'Failed to post opname')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/opname">
            <Button variant="ghost" size="icon" className="text-zinc-400">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">New Physical Count</h2>
            <p className="text-zinc-400 text-sm">Perform weekly stock verification for {format(new Date(), 'MMMM yyyy')}.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium uppercase">Date:</span>
            <Input 
              type="date" 
              className="h-9 w-40 bg-zinc-900 border-zinc-800 text-sm" 
              value={opnameDate}
              onChange={(e) => setOpnameDate(e.target.value)}
            />
          </div>
          <Button 
            className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            disabled={submitting || items.length === 0}
            onClick={handlePost}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Post Adjustments
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-500 text-xs font-bold uppercase">Item Name</TableHead>
              <TableHead className="text-zinc-500 text-xs font-bold uppercase text-right">System Qty</TableHead>
              <TableHead className="text-blue-400 text-xs font-bold uppercase text-right w-[200px]">
                Physical Qty
                <span className="block text-[9px] font-normal text-zinc-500 normal-case">enter actual count ↓</span>
              </TableHead>
              <TableHead className="text-zinc-500 text-xs font-bold uppercase text-right w-24">Variance</TableHead>
              <TableHead className="text-zinc-500 text-xs font-bold uppercase w-[200px]">Reason</TableHead>
              <TableHead className="text-zinc-500 text-xs font-bold uppercase w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin opacity-20 mb-2" />
                  Fetching current stock levels...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-zinc-500">
                  No items in inventory to count.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const variance = item.physical_qty - item.qty_on_hand
                return (
                  <TableRow key={item.item_id} className="border-zinc-800 hover:bg-zinc-800/20">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-zinc-100">{item.item_master?.name}</span>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.item_master?.unit}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-zinc-500 font-mono">
                      {Number(item.qty_on_hand).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right bg-blue-950/10">
                      <Input
                        type="number"
                        className="bg-zinc-950 border-blue-800/50 h-9 text-right font-mono focus:border-blue-500"
                        value={item.physical_qty}
                        placeholder="Count..."
                        onChange={(e) => handleQtyChange(item.item_id, e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right font-bold font-mono">
                      {variance > 0 ? (
                        <span className="text-emerald-500">+{Number(variance).toLocaleString()}</span>
                      ) : variance < 0 ? (
                        <span className="text-red-500">{Number(variance).toLocaleString()}</span>
                      ) : (
                        <span className="text-zinc-500">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {variance < 0 && (
                        <Select value={item.variance_reason || ""} onValueChange={(val) => handleReasonChange(item.item_id, val)}>
                          <SelectTrigger className="h-8 bg-zinc-950 border-zinc-800 text-xs text-zinc-300">
                            <SelectValue placeholder="Select reason..." />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                            <SelectItem value="spoilage">Spoilage</SelectItem>
                            <SelectItem value="waste">Waste</SelectItem>
                            <SelectItem value="theft">Theft/Loss</SelectItem>
                            <SelectItem value="count_error">Count Error</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {variance > 0 && (
                        <span className="text-[11px] text-zinc-500 px-2 py-1 bg-zinc-900 rounded">Found Stock</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {variance === 0 ? (
                        <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          Matched
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-500 text-xs font-medium">
                          <AlertCircle className="h-3 w-3" />
                          Adjustment
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
