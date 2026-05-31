'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2, Search, Loader2, AlertTriangle, Download, Upload, Image as ImageIcon, Scissors, Save } from 'lucide-react'
import { parseCSV, generateItemTemplate } from '@/lib/inventory/import'
import { STANDARD_UOMS } from '@/lib/constants'
import { toast } from 'sonner'
import { tierColors, tierLabels } from '@/lib/format'

interface Item {
  id: string
  code: string | null
  name: string
  unit: string
  category: string
  is_inventory: boolean
  reorder_level: number
  default_coa_id: string | null
  purchase_unit: string | null
  conversion_factor: number
  image_url?: string | null
}

const emptyItem: Omit<Item, 'id'> = {
  code: '',
  name: '',
  unit: 'KG',
  category: 'raw',
  is_inventory: true,
  reorder_level: 0,
  default_coa_id: null,
  purchase_unit: '',
  conversion_factor: 1,
}

// Auto-fill purchase unit & conversion factor when a known base unit is selected
const UOM_AUTO_CONVERSIONS: Record<string, { purchase_unit: string; conversion_factor: number }> = {
  GR:  { purchase_unit: 'KG',   conversion_factor: 0.001 },
  KG:  { purchase_unit: 'KG',   conversion_factor: 1000 },
  ML:  { purchase_unit: 'L',    conversion_factor: 0.001 },
  L:   { purchase_unit: 'L',    conversion_factor: 1000 },
  MG:  { purchase_unit: 'KG',   conversion_factor: 0.000001 },
}

export default function ItemsSettingsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Item[]>([])
  const [coa, setCoa] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<Omit<Item, 'id'> & { id?: string }>(emptyItem)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<any>(null)
  
  const [activeItemForDisassembly, setActiveItemForDisassembly] = useState<any>(null)
  const [requiresDisassembly, setRequiresDisassembly] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [savingDisassembly, setSavingDisassembly] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: itemsData }, { data: coaData }] = await Promise.all([
      supabase.from('item_master').select('*').order('name'),
      supabase.from('chart_of_accounts').select('id, code, name, type'),
    ])
    setItems(itemsData || [])
    setCoa(coaData || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!editItem.name.trim()) {
      toast.error('Item name is required')
      return
    }
    setSaving(true)
    try {
      // Get org_id
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user?.id)
        .single()

      const payload = {
        ...editItem,
        org_id: profile?.org_id,
        is_inventory: editItem.category !== 'finished',
      }

      if (editItem.id) {
        const { error } = await supabase
          .from('item_master')
          .update(payload)
          .eq('id', editItem.id)
        if (error) throw error
        toast.success('Item updated')
      } else {
        const { id, ...rest } = payload as any
        const { error } = await supabase.from('item_master').insert(rest)
        if (error) throw error
        toast.success('Item created')
      }
      setDialogOpen(false)
      fetchData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      const { error } = await supabase.from('item_master').delete().eq('id', deleteId)
      if (error) throw error
      toast.success('Item deleted')
      setDeleteId(null)
      fetchData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete item. It may be referenced by other records.')
    }
  }

  const openDisassemblyConfig = async (item: any) => {
    setActiveItemForDisassembly(item)
    setRequiresDisassembly(item.requires_disassembly || false)
    try {
      const { data } = await supabase
        .from('disassembly_templates')
        .select('*')
        .eq('parent_item_id', item.id)
        .order('sort_order', { ascending: true })
      setTemplates(data || [])
    } catch (e) {
      // Ignore
      setTemplates([])
    }
  }

  const handleAddTemplate = () => {
    setTemplates([...templates, {
      id: `new-${Date.now()}`,
      parent_item_id: activeItemForDisassembly.id,
      child_item_name: '',
      unit: 'kg',
      default_yield_pct: 0,
      waste_threshold_pct: 20
    }])
  }

  const handleRemoveTemplate = (id: string) => {
    setTemplates(templates.filter(t => t.id !== id))
  }

  const handleTemplateChange = (id: string, field: string, value: any) => {
    setTemplates(templates.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const handleSaveDisassembly = async () => {
    setSavingDisassembly(true)
    try {
      if (requiresDisassembly && templates.length === 0) {
        throw new Error("Must have at least 1 component to enable disassembly")
      }
      const totalPct = templates.reduce((sum, t) => sum + (parseFloat(t.default_yield_pct) || 0), 0)
      if (totalPct > 100) {
        throw new Error("Total yield percentage cannot exceed 100%")
      }

      const { error: updateError } = await supabase
        .from('item_master')
        .update({ requires_disassembly: requiresDisassembly })
        .eq('id', activeItemForDisassembly.id)
      
      if (updateError) throw updateError

      const { error: delError } = await supabase
        .from('disassembly_templates')
        .delete()
        .eq('parent_item_id', activeItemForDisassembly.id)
      
      if (delError) throw delError

      if (templates.length > 0) {
        const toInsert = templates.map((t, idx) => ({
          parent_item_id: activeItemForDisassembly.id,
          child_item_name: t.child_item_name,
          unit: t.unit,
          default_yield_pct: parseFloat(t.default_yield_pct) || 0,
          waste_threshold_pct: parseFloat(t.waste_threshold_pct) || 20,
          sort_order: idx
        }))
        const { error: insError } = await supabase
          .from('disassembly_templates')
          .insert(toInsert)
        
        if (insError) throw insError
      }

      toast.success('Disassembly configuration saved')
      setActiveItemForDisassembly(null)
      fetchData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save configuration')
    } finally {
      setSavingDisassembly(false)
    }
  }

  const handleDownloadTemplate = () => {
    const csv = generateItemTemplate()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'item_master_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      // Get org_id
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user?.id)
        .single()
      
      const orgId = profile?.org_id
      if (!orgId) throw new Error('Could not identify organization')

      const text = await file.text()
      const rawData = parseCSV(text)
      
      if (rawData.length === 0) throw new Error('CSV is empty or invalid')

      // Map COA codes to IDs
      const coaCodes = Array.from(new Set(rawData.map(r => r.coa_code).filter(Boolean)))
      let coaMap: Record<string, string> = {}
      
      if (coaCodes.length > 0) {
        const { data: coas } = await supabase
          .from('chart_of_accounts')
          .select('id, code')
          .in('code', coaCodes)
        
        coas?.forEach(c => {
          coaMap[c.code] = c.id
        })
      }

      const itemsToUpsert = rawData.map(r => ({
        org_id: orgId,
        code: r.code || null,
        name: r.name,
        category: r.category || 'raw',
        unit: r.unit || 'pcs',
        purchase_unit: r.purchase_unit || r.unit || 'pcs',
        conversion_factor: parseFloat(r.conversion_factor) || 1,
        reorder_level: parseFloat(r.reorder_level) || 0,
        default_coa_id: r.coa_code ? coaMap[r.coa_code] : null,
        is_inventory: r.category !== 'finished'
      }))

      const { error } = await supabase
        .from('item_master')
        .upsert(itemsToUpsert, { onConflict: 'org_id,name' })

      if (error) throw error

      toast.success(`Successfully imported ${itemsToUpsert.length} items`)
      fetchData()
    } catch (error: any) {
      console.error('Import error:', error)
      toast.error(error.message || 'Failed to import CSV')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const filtered = items.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(search.toLowerCase())
    const matchTier = filterTier === 'all' || item.category === filterTier
    return matchSearch && matchTier
  })

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              className="w-64 bg-zinc-950 border-zinc-800 pl-10"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterTier} onValueChange={(v) => setFilterTier(v as string)}>
            <SelectTrigger className="w-40 bg-zinc-950 border-zinc-800 text-zinc-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="raw">Bahan Baku</SelectItem>
              <SelectItem value="wip">WIP</SelectItem>
              <SelectItem value="packaging">Packaging</SelectItem>
              <SelectItem value="finished">Finished</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
            accept=".csv" 
            className="hidden" 
          />
          <Button 
            variant="outline" 
            onClick={handleDownloadTemplate}
            className="border-zinc-800 bg-zinc-900 text-zinc-300 gap-2"
          >
            <Download className="h-4 w-4" />
            Template
          </Button>
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="border-zinc-800 bg-zinc-900 text-zinc-300 gap-2"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import CSV
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            onClick={() => {
              setEditItem(emptyItem)
              setDialogOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12"></TableHead>
              <TableHead className="text-zinc-400">Code</TableHead>
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Recipe Unit</TableHead>
              <TableHead className="text-zinc-400">Purchase Unit</TableHead>
              <TableHead className="text-zinc-400">Tier</TableHead>
              <TableHead className="text-zinc-400 text-right">Reorder Level</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-1 opacity-30" />
                  Loading items...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  {search ? 'No items match your search.' : 'No items yet. Add your first item.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell>
                    <div className="h-8 w-8 rounded bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-zinc-800" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-500 font-mono text-xs">{item.code || '-'}</TableCell>
                  <TableCell className="font-medium text-zinc-100">{item.name}</TableCell>
                  <TableCell className="text-zinc-400 font-mono text-xs uppercase">{item.unit}</TableCell>
                  <TableCell>
                    {item.purchase_unit ? (
                      <div className="flex flex-col">
                        <span className="text-zinc-100 font-medium">{item.purchase_unit}</span>
                        <span className="text-[10px] text-blue-400">1 {item.purchase_unit} = {item.conversion_factor} {item.unit}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Not Set</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={tierColors[item.category] || ''}>
                      {tierLabels[item.category] || item.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-zinc-400">{item.reorder_level}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {item.category === 'raw' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Disassembly Settings"
                          className="h-7 w-7 text-zinc-500 hover:text-orange-400"
                          onClick={() => openDisassemblyConfig(item)}
                        >
                          <Scissors className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-500 hover:text-zinc-100"
                        onClick={() => {
                          setEditItem(item)
                          setDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-500 hover:text-red-400"
                        onClick={() => setDeleteId(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editItem.id ? 'Edit Item' : 'Add New Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input
                className="bg-zinc-950 border-zinc-800"
                placeholder="e.g. Telur Ayam"
                value={editItem.name}
                onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code (SKU)</Label>
                <Input
                  className="bg-zinc-950 border-zinc-800"
                  placeholder="e.g. RAW-001"
                  value={editItem.code || ''}
                  onChange={(e) => setEditItem({ ...editItem, code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tier / Category</Label>
                <select
                  value={editItem.category}
                  onChange={(e) => setEditItem({ ...editItem, category: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100 focus:outline-none"
                >
                  <option value="raw">Bahan Baku (Raw)</option>
                  <option value="wip">WIP (Semi-finished)</option>
                  <option value="packaging">Packaging</option>
                  <option value="finished">Finished Goods</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reorder Level</Label>
                <Input
                  type="number"
                  className="bg-zinc-950 border-zinc-800"
                  value={editItem.reorder_level}
                  onChange={(e) =>
                    setEditItem({ ...editItem, reorder_level: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Default COA</Label>
                <select
                  value={editItem.default_coa_id || 'none'}
                  onChange={(e) =>
                    setEditItem({ ...editItem, default_coa_id: e.target.value === 'none' ? null : e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 h-9 text-sm text-zinc-100 focus:outline-none"
                >
                  <option value="none">No Default Account</option>
                  {coa.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <Label className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest flex items-center gap-2">
                UOM Conversion Formula
              </Label>
              <div className="flex items-center gap-2 bg-zinc-950/30 p-2.5 rounded-lg border border-zinc-800/50">
                <span className="text-zinc-500 font-mono text-sm pl-1">1</span>
                <div className="flex-1">
                  <Input
                    className="bg-zinc-900 border-zinc-800 h-8 text-xs"
                    placeholder="Purchase Unit"
                    value={editItem.purchase_unit || ''}
                    onChange={(e) => setEditItem({ ...editItem, purchase_unit: e.target.value })}
                  />
                </div>
                <span className="text-zinc-500 font-mono text-sm">=</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    className="bg-zinc-900 border-zinc-800 h-8 text-xs text-center"
                    value={editItem.conversion_factor}
                    onChange={(e) =>
                      setEditItem({ ...editItem, conversion_factor: parseFloat(e.target.value) || 1 })
                    }
                  />
                </div>
                <div className="flex-1">
                  <select
                    value={editItem.unit}
                    onChange={(e) => {
                      const newUnit = e.target.value
                      const auto = UOM_AUTO_CONVERSIONS[newUnit]
                      setEditItem({
                        ...editItem,
                        unit: newUnit,
                        ...(auto ? { purchase_unit: auto.purchase_unit, conversion_factor: auto.conversion_factor } : {}),
                      })
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 h-8 text-[10px] text-zinc-100 focus:outline-none"
                  >
                    {STANDARD_UOMS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[9px] text-zinc-500 italic pl-1">
                Sets how many <strong>{editItem.unit}</strong> are in one <strong>{editItem.purchase_unit || 'Purchase Unit'}</strong>.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-800" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editItem.id ? 'Save Changes' : 'Create Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete this item. Items referenced by invoices, BOM, or stock records cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-800 text-zinc-300">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disassembly Dialog */}
      <Dialog open={!!activeItemForDisassembly} onOpenChange={(open) => !open && setActiveItemForDisassembly(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-orange-400" /> Disassembly Settings: {activeItemForDisassembly?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-950/50">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-200">Require Disassembly?</p>
                <p className="text-xs text-zinc-500">Enable this if this item is broken down into smaller parts upon receipt.</p>
              </div>
              <Switch 
                checked={requiresDisassembly} 
                onCheckedChange={setRequiresDisassembly}
              />
            </div>

            {requiresDisassembly && (
              <div className="space-y-3">
                <div className="border border-zinc-800 rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-zinc-950/80">
                      <TableRow className="hover:bg-transparent border-zinc-800">
                        <TableHead className="text-zinc-400">Component Name</TableHead>
                        <TableHead className="text-zinc-400 w-24">Unit</TableHead>
                        <TableHead className="text-zinc-400 w-28 text-right">Yield (%)</TableHead>
                        <TableHead className="text-zinc-400 w-28 text-right">Waste Limit</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {templates.map(t => (
                        <TableRow key={t.id} className="border-zinc-800 bg-zinc-900/50">
                          <TableCell className="p-2">
                            <Input 
                              value={t.child_item_name}
                              onChange={e => handleTemplateChange(t.id, 'child_item_name', e.target.value)}
                              className="h-8 bg-zinc-950 border-zinc-800 text-xs"
                              placeholder="e.g. Daging Sapi"
                            />
                          </TableCell>
                          <TableCell className="p-2">
                            <Input 
                              list="uom-list"
                              value={t.unit}
                              onChange={e => handleTemplateChange(t.id, 'unit', e.target.value)}
                              className="h-8 bg-zinc-950 border-zinc-800 text-xs"
                              placeholder="kg"
                            />
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="flex items-center justify-end gap-1">
                              <Input 
                                type="number"
                                value={t.default_yield_pct}
                                onChange={e => handleTemplateChange(t.id, 'default_yield_pct', e.target.value)}
                                className="h-8 w-16 bg-zinc-950 border-zinc-800 text-xs text-right pr-1"
                              />
                              <span className="text-xs text-zinc-500">%</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="flex items-center justify-end gap-1">
                              <Input 
                                type="number"
                                value={t.waste_threshold_pct}
                                onChange={e => handleTemplateChange(t.id, 'waste_threshold_pct', e.target.value)}
                                className="h-8 w-16 bg-zinc-950 border-zinc-800 text-xs text-right pr-1"
                              />
                              <span className="text-xs text-zinc-500">%</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveTemplate(t.id)} className="h-8 w-8 text-zinc-500 hover:text-red-400">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <datalist id="uom-list">
                    {STANDARD_UOMS.map(u => <option key={u} value={u} />)}
                  </datalist>
                </div>
                <Button onClick={handleAddTemplate} variant="outline" size="sm" className="border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-100">
                  <Plus className="h-4 w-4 mr-2" /> Add Component
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-800" onClick={() => setActiveItemForDisassembly(null)}>
              Cancel
            </Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleSaveDisassembly} disabled={savingDisassembly}>
              {savingDisassembly ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
