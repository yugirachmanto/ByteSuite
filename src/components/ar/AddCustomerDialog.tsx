'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface AddCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  onCreated: (customer: any) => void
}

export function AddCustomerDialog({ open, onOpenChange, orgId, onCreated }: AddCustomerDialogProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [paymentTermsDays, setPaymentTermsDays] = useState(30)
  const [creditLimit, setCreditLimit] = useState('')

  const reset = () => {
    setName('')
    setEmail('')
    setPhone('')
    setAddress('')
    setPaymentTermsDays(30)
    setCreditLimit('')
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Customer name is required.')
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          org_id: orgId,
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          payment_terms_days: paymentTermsDays || 30,
          credit_limit: creditLimit === '' ? null : parseFloat(creditLimit),
        })
        .select()
        .single()

      if (error) throw error

      toast.success(`"${data.name}" added to your customers.`)
      onCreated(data)
      reset()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Add New Customer</DialogTitle>
          <DialogDescription className="text-zinc-400">Not in the list yet? Add it here — it becomes available for invoicing right away.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium uppercase">Customer Name *</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
              placeholder="Customer / Company Name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                placeholder="email@customer.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                placeholder="0812xxxxxx"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-500 font-medium uppercase">Address</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
              placeholder="Customer Address"
            />
          </div>

          <div className="pt-3 border-t border-zinc-800 space-y-3">
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">Credit Terms</span>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Payment Terms (days)</label>
                <Input
                  type="number"
                  min={0}
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 0)}
                  className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Credit Limit</label>
                <Input
                  type="number"
                  min={0}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 h-9 text-zinc-100"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
