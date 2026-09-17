'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Layers, Loader2, Plus, Pencil, Ban, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface Plan {
  id: string
  name: string
  price: number | null
  max_outlets: number | null
  max_users: number | null
  features: string[]
  description: string | null
  is_active: boolean
  sort_order: number
}

const emptyForm = {
  name: '',
  price: '',
  max_outlets: '',
  max_users: '',
  features: '',
  description: '',
  sort_order: '0',
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchPlans()
  }, [])

  async function fetchPlans() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/plans')
      const data = await res.json()
      if (data.plans) setPlans(data.plans)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditingId(plan.id)
    setForm({
      name: plan.name,
      price: plan.price === null ? '' : String(plan.price),
      max_outlets: plan.max_outlets === null ? '' : String(plan.max_outlets),
      max_users: plan.max_users === null ? '' : String(plan.max_users),
      features: (plan.features || []).join('\n'),
      description: plan.description || '',
      sort_order: String(plan.sort_order ?? 0),
    })
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Plan name is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        price: form.price.trim() === '' ? null : parseFloat(form.price),
        max_outlets: form.max_outlets.trim() === '' ? null : parseInt(form.max_outlets, 10),
        max_users: form.max_users.trim() === '' ? null : parseInt(form.max_users, 10),
        features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
        description: form.description.trim() || null,
        sort_order: parseInt(form.sort_order, 10) || 0,
      }

      const res = await fetch('/api/admin/plans', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save plan')

      toast.success(editingId ? 'Plan updated' : 'Plan created')
      setDialogOpen(false)
      fetchPlans()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(plan: Plan) {
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, is_active: !plan.is_active }),
      })
      if (res.ok) fetchPlans()
    } catch (err) {
      console.error(err)
    }
  }

  const formatPrice = (price: number | null) =>
    price === null ? 'Custom' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Subscription Plans</h2>
          <p className="text-zinc-400">The plan catalog shown on every organization's Billing page.</p>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 text-white hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" />
          New Plan
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800 bg-zinc-900">
            <TableRow className="hover:bg-transparent border-zinc-800">
              <TableHead className="text-zinc-400">Plan</TableHead>
              <TableHead className="text-zinc-400">Price</TableHead>
              <TableHead className="text-zinc-400">Limits</TableHead>
              <TableHead className="text-zinc-400">Features</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-right text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-30" />
                  Loading...
                </TableCell>
              </TableRow>
            ) : plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                  <Layers className="mx-auto h-8 w-8 mb-2 opacity-20" />
                  No plans yet.
                </TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => (
                <TableRow key={plan.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">{plan.name}</span>
                      {plan.description && <span className="text-xs text-zinc-500 max-w-xs">{plan.description}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-300 font-mono text-sm">{formatPrice(plan.price)}</TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    {plan.max_outlets === null ? 'Unlimited outlets' : `${plan.max_outlets} outlet${plan.max_outlets === 1 ? '' : 's'}`}
                    {' · '}
                    {plan.max_users === null ? 'Unlimited users' : `${plan.max_users} user${plan.max_users === 1 ? '' : 's'}`}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {(plan.features || []).slice(0, 3).map((f, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">{f}</Badge>
                      ))}
                      {(plan.features || []).length > 3 && (
                        <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">+{plan.features.length - 3} more</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {plan.is_active ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">Active</Badge>
                    ) : (
                      <Badge className="bg-zinc-800 text-zinc-500">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(plan)} className="text-zinc-400 hover:text-zinc-100">
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(plan)}
                        className={plan.is_active ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-400 hover:text-emerald-400'}
                      >
                        {plan.is_active ? (
                          <><Ban className="h-4 w-4 mr-2" />Deactivate</>
                        ) : (
                          <><CheckCircle2 className="h-4 w-4 mr-2" />Reactivate</>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-100">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Plan' : 'New Plan'}</DialogTitle>
              <DialogDescription className="text-zinc-400">
                This plan becomes selectable on any organization's Subscription tab.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-zinc-300">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Pro"
                  required
                  className="bg-zinc-900 border-zinc-800 text-zinc-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Price (Rp/month)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="Leave blank for Custom"
                    className="bg-zinc-900 border-zinc-800 text-zinc-100"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Sort Order</Label>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                    className="bg-zinc-900 border-zinc-800 text-zinc-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Max Outlets</Label>
                  <Input
                    type="number"
                    value={form.max_outlets}
                    onChange={(e) => setForm({ ...form, max_outlets: e.target.value })}
                    placeholder="Leave blank for unlimited"
                    className="bg-zinc-900 border-zinc-800 text-zinc-100"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Max Users</Label>
                  <Input
                    type="number"
                    value={form.max_users}
                    onChange={(e) => setForm({ ...form, max_users: e.target.value })}
                    placeholder="Leave blank for unlimited"
                    className="bg-zinc-900 border-zinc-800 text-zinc-100"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-300">Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="One-line summary shown on the billing page"
                  className="bg-zinc-900 border-zinc-800 text-zinc-100"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-300">Features (one per line)</Label>
                <Textarea
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  placeholder={'Up to 5 Outlets\nUnlimited Users\nPriority Support'}
                  rows={4}
                  className="bg-zinc-900 border-zinc-800 text-zinc-100"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="text-zinc-400 hover:text-zinc-100">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-indigo-600 text-white hover:bg-indigo-700">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? 'Save Changes' : 'Create Plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
