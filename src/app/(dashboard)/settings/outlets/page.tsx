'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Building2, Plus, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface Outlet {
  id: string
  name: string
  address: string | null
  timezone: string
  created_at: string
}

const emptyOutlet: Omit<Outlet, 'id' | 'created_at'> = {
  name: '',
  address: '',
  timezone: 'Asia/Jakarta',
}

export default function OutletsSettingsPage() {
  const supabase = createClient()
  const { reloadOutlets } = useOutlet()
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editOutlet, setEditOutlet] = useState<Omit<Outlet, 'id' | 'created_at'> & { id?: string }>(emptyOutlet)

  useEffect(() => {
    fetchOutlets()
  }, [])

  async function fetchOutlets() {
    setLoading(true)
    const { data } = await supabase
      .from('outlets')
      .select('*')
      .order('name')
    setOutlets(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!editOutlet.name.trim()) {
      toast.error('Outlet name is required')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id, outlet_ids')
        .eq('id', user?.id)
        .single()

      if (editOutlet.id) {
        // ── Edit existing outlet ────────────────────────────────────────────
        const { error } = await supabase
          .from('outlets')
          .update({
            name: editOutlet.name,
            address: editOutlet.address,
            timezone: editOutlet.timezone,
          })
          .eq('id', editOutlet.id)
        if (error) throw error
        toast.success('Outlet updated')
      } else {
        // ── Create new outlet ───────────────────────────────────────────────
        const { data: newOutlet, error: insertError } = await supabase
          .from('outlets')
          .insert({
            org_id: profile?.org_id,
            name: editOutlet.name,
            address: editOutlet.address,
            timezone: editOutlet.timezone,
          })
          .select('id')
          .single()
        if (insertError) throw insertError

        // Also add the new outlet to this user's outlet_ids so it
        // immediately appears in the sidebar outlet switcher
        const updatedIds = [...(profile?.outlet_ids ?? []), newOutlet.id]
        const { error: profileError } = await supabase
          .from('user_profiles')
          .update({ outlet_ids: updatedIds })
          .eq('id', user?.id)
        if (profileError) {
          console.error('Failed to update outlet_ids:', profileError.message)
          // Non-fatal — outlet was created, just won't appear in switcher until refresh
        }

        toast.success('Outlet created')
      }
      setDialogOpen(false)
      fetchOutlets()
      reloadOutlets() // refresh sidebar outlet switcher immediately
    } catch (error: any) {
      toast.error(error.message || 'Failed to save outlet')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex justify-between items-center">
        <p className="text-zinc-400 text-sm">Manage physical locations and branches.</p>
        <Button
          className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          onClick={() => {
            setEditOutlet(emptyOutlet)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Outlet
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Outlet Name</TableHead>
              <TableHead className="text-zinc-400">Address</TableHead>
              <TableHead className="text-zinc-400">Timezone</TableHead>
              <TableHead className="text-zinc-400">Created</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-1 opacity-30" />
                  Loading outlets...
                </TableCell>
              </TableRow>
            ) : outlets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                  <Building2 className="mx-auto h-8 w-8 mb-2 opacity-20" />
                  No outlets configured.
                </TableCell>
              </TableRow>
            ) : (
              outlets.map((outlet) => (
                <TableRow key={outlet.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell className="font-medium text-zinc-100">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-400">
                        <Building2 className="h-4 w-4" />
                      </div>
                      {outlet.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-400 max-w-[250px] truncate">
                    {outlet.address || '-'}
                  </TableCell>
                  <TableCell className="text-zinc-500">{outlet.timezone}</TableCell>
                  <TableCell className="text-zinc-500 text-sm">
                    {format(new Date(outlet.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-zinc-500 hover:text-zinc-100"
                      onClick={() => {
                        setEditOutlet(outlet)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editOutlet.id ? 'Edit Outlet' : 'Add New Outlet'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Outlet Name</Label>
              <Input
                className="bg-zinc-950 border-zinc-800"
                placeholder="e.g. Sudirman Branch"
                value={editOutlet.name}
                onChange={(e) => setEditOutlet({ ...editOutlet, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                className="bg-zinc-950 border-zinc-800"
                value={editOutlet.timezone}
                onChange={(e) => setEditOutlet({ ...editOutlet, timezone: e.target.value })}
                readOnly
              />
              <p className="text-[10px] text-zinc-500">Currently locked to Asia/Jakarta (WIB)</p>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                className="bg-zinc-950 border-zinc-800 min-h-[80px]"
                placeholder="Full street address..."
                value={editOutlet.address || ''}
                onChange={(e) => setEditOutlet({ ...editOutlet, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-800" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editOutlet.id ? 'Save Changes' : 'Create Outlet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
