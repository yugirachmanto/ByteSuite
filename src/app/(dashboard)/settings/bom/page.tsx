'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Loader2, AlertTriangle, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { tierColors, tierLabels } from '@/lib/format'

interface BomRow {
  id: string
  input_item_id: string
  qty_per_unit: number
  unit: string
  item_master?: { name: string; unit: string; category: string }
}

export default function BomSettingsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [selectedOutputId, setSelectedOutputId] = useState<string>('')
  const [bomRows, setBomRows] = useState<BomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null)

  // New row state
  const [newInputId, setNewInputId] = useState<string>('')
  const [newQty, setNewQty] = useState<number>(0)

  useEffect(() => {
    async function fetchItems() {
      setLoading(true)
      const { data } = await supabase
        .from('item_master')
        .select('id, name, unit, category')
        .order('name')
      setItems(data || [])
      setLoading(false)
    }
    fetchItems()
  }, [])

  const outputItems = items.filter(
    (i) => i.category === 'wip' || i.category === 'finished'
  )
  const inputItems = items.filter((i) => i.category !== 'finished')
  const selectedOutput = items.find((i) => i.id === selectedOutputId)

  useEffect(() => {
    if (!selectedOutputId) {
      setBomRows([])
      return
    }
    async function fetchBOM() {
      const { data } = await supabase
        .from('bom')
        .select(`
          id,
          input_item_id,
          qty_per_unit,
          unit,
          item_master!bom_input_item_id_fkey (
            name,
            unit,
            category
          )
        `)
        .eq('output_item_id', selectedOutputId)
      setBomRows((data || []) as unknown as BomRow[])
    }
    fetchBOM()
  }, [selectedOutputId])

  // Circular reference check (DFS)
  function wouldCreateCycle(outputId: string, inputId: string): boolean {
    if (outputId === inputId) return true
    // For now, check one level: does the input item's BOM use outputId?
    const inputInBom = bomRows.some((r) => r.input_item_id === outputId)
    return inputInBom
  }

  async function handleAddRow() {
    if (!newInputId || newQty <= 0 || !selectedOutputId) {
      toast.error('Select an ingredient and enter a valid quantity')
      return
    }

    if (wouldCreateCycle(selectedOutputId, newInputId)) {
      toast.error('Circular BOM reference detected! This would create an infinite loop.')
      return
    }

    if (bomRows.some((r) => r.input_item_id === newInputId)) {
      toast.error('This ingredient is already in the BOM')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user?.id)
        .single()

      const inputItem = items.find((i) => i.id === newInputId)

      const { error } = await supabase.from('bom').insert({
        org_id: profile?.org_id,
        output_item_id: selectedOutputId,
        input_item_id: newInputId,
        qty_per_unit: newQty,
        unit: inputItem?.unit || 'KG',
      })
      if (error) throw error

      toast.success('Ingredient added to BOM')
      setNewInputId('')
      setNewQty(0)
      // Refetch
      const { data } = await supabase
        .from('bom')
        .select(`id, input_item_id, qty_per_unit, unit, item_master!bom_input_item_id_fkey (name, unit, category)`)
        .eq('output_item_id', selectedOutputId)
      setBomRows((data || []) as unknown as BomRow[])
    } catch (error: any) {
      toast.error(error.message || 'Failed to add ingredient')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRow() {
    if (!deleteRowId) return
    try {
      const { error } = await supabase.from('bom').delete().eq('id', deleteRowId)
      if (error) throw error
      setBomRows((prev) => prev.filter((r) => r.id !== deleteRowId))
      toast.success('Ingredient removed')
      setDeleteRowId(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete')
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Output selector */}
        <Card className="lg:col-span-1 border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
              Select Output Item
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedOutputId} onValueChange={(v) => setSelectedOutputId(v as string)}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800">
                <SelectValue placeholder="Select WIP or Recipe..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 max-h-72">
                {outputItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <div className="flex items-center gap-2">
                      <span>{item.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase">{item.category}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedOutput && (
              <div className="rounded-lg bg-zinc-950 p-4 space-y-2">
                <div className="text-sm font-medium text-zinc-100">{selectedOutput.name}</div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={tierColors[selectedOutput.category] || ''}>
                    {tierLabels[selectedOutput.category] || selectedOutput.category}
                  </Badge>
                  <span className="text-xs text-zinc-500">{selectedOutput.unit}</span>
                </div>
                <div className="text-xs text-zinc-500 pt-1">
                  {bomRows.length} ingredient{bomRows.length !== 1 ? 's' : ''} in BOM
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* BOM Table */}
        <Card className="lg:col-span-2 border-zinc-800 bg-zinc-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
              Bill of Materials
            </CardTitle>
            <div className="flex items-center gap-1 text-zinc-500">
              <Layers className="h-3.5 w-3.5" />
              <span className="text-xs">per 1 {selectedOutput?.unit || 'unit'} output</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedOutputId ? (
              <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
                Select a WIP or Recipe item to manage its BOM
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader className="border-zinc-800">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-zinc-500 text-xs uppercase font-bold">Ingredient</TableHead>
                      <TableHead className="text-zinc-500 text-xs uppercase font-bold">Tier</TableHead>
                      <TableHead className="text-zinc-500 text-xs uppercase font-bold text-right">Qty Per Unit</TableHead>
                      <TableHead className="text-zinc-500 text-xs uppercase font-bold">Unit</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bomRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-zinc-500 text-sm">
                          <AlertTriangle className="mx-auto h-4 w-4 mb-1 opacity-40" />
                          No ingredients yet. Add below.
                        </TableCell>
                      </TableRow>
                    ) : (
                      bomRows.map((row) => (
                        <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-800/20">
                          <TableCell className="font-medium text-zinc-100">
                            {row.item_master?.name || 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={tierColors[row.item_master?.category || ''] || ''}>
                              {tierLabels[row.item_master?.category || ''] || row.item_master?.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-zinc-100 font-mono">
                            {row.qty_per_unit}
                          </TableCell>
                          <TableCell className="text-zinc-400">{row.unit}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-500 hover:text-red-400"
                              onClick={() => setDeleteRowId(row.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* Add row */}
                <div className="border-t border-zinc-800 p-4 flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] uppercase text-zinc-500 font-bold">Ingredient</Label>
                    <Select value={newInputId} onValueChange={(v) => setNewInputId(v as string)}>
                      <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 max-h-60">
                        {inputItems
                          .filter((i) => i.id !== selectedOutputId && !bomRows.some((r) => r.input_item_id === i.id))
                          .map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} ({item.unit})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-[10px] uppercase text-zinc-500 font-bold">Qty / Unit</Label>
                    <Input
                      type="number"
                      className="bg-zinc-950 border-zinc-800 h-9"
                      value={newQty || ''}
                      onChange={(e) => setNewQty(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <Button
                    className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 h-9"
                    onClick={handleAddRow}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRowId} onOpenChange={(open) => !open && setDeleteRowId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Ingredient?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This ingredient will be removed from the BOM. This does not affect existing production records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 text-zinc-300">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={handleDeleteRow}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
