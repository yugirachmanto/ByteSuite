'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { StepProps } from './types'

export function OutletsStep({ orgId, outlets, onOutletCreated, markDone }: StepProps) {
  const supabase = createClient()
  const { reloadOutlets } = useOutlet()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error('Outlet name is required')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('outlets')
        .insert({ org_id: orgId, name: name.trim(), address: address.trim() || null, timezone: 'Asia/Jakarta' })
        .select()
        .single()
      if (error) throw error

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('outlet_ids')
        .eq('id', user?.id)
        .single()
      const updatedIds = [...(profile?.outlet_ids ?? []), data.id]
      await supabase.from('user_profiles').update({ outlet_ids: updatedIds }).eq('id', user?.id)

      toast.success(`Outlet "${data.name}" created`)
      onOutletCreated(data)
      markDone()
      reloadOutlets()
      setName('')
      setAddress('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to add outlet')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Add additional locations</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Your first outlet was already created at sign-up. Add more branches here if you operate
          in more than one location — you can always add more later from Settings.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium uppercase">Outlet Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sudirman Branch" className="bg-zinc-950 border-zinc-800 h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium uppercase">Address (optional)</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full street address" className="bg-zinc-950 border-zinc-800 h-9" />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={saving || !name.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add Outlet
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Outlet</TableHead>
              <TableHead className="text-zinc-400">Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outlets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="h-20 text-center text-zinc-500">
                  <Building2 className="mx-auto h-6 w-6 mb-1 opacity-20" />
                  No outlets found.
                </TableCell>
              </TableRow>
            ) : (
              outlets.map(o => (
                <TableRow key={o.id} className="border-zinc-800">
                  <TableCell className="text-zinc-200 font-medium">{o.name}</TableCell>
                  <TableCell className="text-zinc-400">{o.address || '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
