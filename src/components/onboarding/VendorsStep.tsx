'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Building2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { StepProps } from './types'

export function VendorsStep({ orgId, vendors, onVendorCreated, markDone }: StepProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error('Vendor name is required')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({ org_id: orgId, name: name.trim(), phone: phone.trim() || null, email: email.trim() || null })
        .select()
        .single()
      if (error) throw error

      toast.success(`Vendor "${data.name}" added`)
      onVendorCreated(data)
      markDone()
      setName('')
      setPhone('')
      setEmail('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to add vendor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Add your vendors</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Suppliers you buy raw materials and packaging from. Needed for purchase orders and
          invoice capture.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name" className="bg-zinc-950 border-zinc-800 h-9" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="bg-zinc-950 border-zinc-800 h-9" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="bg-zinc-950 border-zinc-800 h-9" />
        </div>
        <Button onClick={handleAdd} disabled={saving || !name.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add Vendor
        </Button>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Phone</TableHead>
              <TableHead className="text-zinc-400">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="h-20 text-center text-zinc-500"><Building2 className="mx-auto h-6 w-6 mb-1 opacity-20" />No vendors added yet.</TableCell></TableRow>
            ) : (
              vendors.map(v => (
                <TableRow key={v.id} className="border-zinc-800">
                  <TableCell className="text-zinc-200 font-medium">{v.name}</TableCell>
                  <TableCell className="text-zinc-400">{v.phone || '-'}</TableCell>
                  <TableCell className="text-zinc-400">{v.email || '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
