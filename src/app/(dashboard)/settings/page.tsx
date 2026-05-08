'use client'

import { useState, useEffect } from 'react'
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
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react'
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
}

const emptyItem: Omit<Item, 'id'> = {
  code: '',
  name: '',
  unit: 'KG',
  category: 'raw',
  is_inventory: true,
  reorder_level: 0,
  default_coa_id: null,
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
        <Button
          className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          onClick={() => {
            setEditItem(emptyItem)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Code</TableHead>
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Unit</TableHead>
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
                  <TableCell className="text-zinc-500 font-mono text-xs">{item.code || '-'}</TableCell>
                  <TableCell className="font-medium text-zinc-100">{item.name}</TableCell>
                  <TableCell className="text-zinc-400">{item.unit}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={tierColors[item.category] || ''}>
                      {tierLabels[item.category] || item.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-zinc-400">{item.reorder_level}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
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
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem.id ? 'Edit Item' : 'Add New Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
                <Label>Unit</Label>
                <Select
                  value={editItem.unit}
                  onValueChange={(v) => setEditItem({ ...editItem, unit: v as string })}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {['KG', 'L', 'pcs', 'pack', 'botol', 'karung', 'g', 'ml'].map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                className="bg-zinc-950 border-zinc-800"
                placeholder="e.g. Telur Ayam"
                value={editItem.name}
                onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tier / Category</Label>
                <Select
                  value={editItem.category}
                  onValueChange={(v) => setEditItem({ ...editItem, category: v as string })}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="raw">Bahan Baku (Raw)</SelectItem>
                    <SelectItem value="wip">WIP (Semi-finished)</SelectItem>
                    <SelectItem value="packaging">Packaging</SelectItem>
                    <SelectItem value="finished">Finished Goods</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            </div>
            <div className="space-y-2">
              <Label>Default COA</Label>
              <Select
                value={editItem.default_coa_id || 'none'}
                onValueChange={(v) =>
                  setEditItem({ ...editItem, default_coa_id: v === 'none' ? null : v })
                }
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 max-h-60">
                  <SelectItem value="none">None</SelectItem>
                  {coa.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </>
  )
}
