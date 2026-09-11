'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Mail, Link as LinkIcon, Copy, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { StepProps } from './types'

export function InviteTeamStep({ outlets, markDone }: StepProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('cashier')
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [invited, setInvited] = useState<{ name: string; email: string }[]>([])
  const [linkData, setLinkData] = useState<{ name: string; link: string } | null>(null)

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }
    setInviting(true)
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          full_name: name,
          role,
          outlet_ids: (role === 'owner' || role === 'admin') ? [] : selectedOutlets,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to invite user')

      toast.success('Invitation processed')
      setInvited(prev => [...prev, { name: name || email, email }])
      markDone()
      if (data.link) setLinkData({ name: name || email, link: data.link })
      setEmail('')
      setName('')
      setRole('cashier')
      setSelectedOutlets([])
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Invite your team</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Bring in cashiers, kitchen staff, or finance team members now, or skip and invite them
          later from Settings → Users.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" className="bg-zinc-950 border-zinc-800 h-9" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="bg-zinc-950 border-zinc-800 h-9" />
        </div>

        <Select value={role} onValueChange={(val) => val && setRole(val)}>
          <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
            <SelectItem value="admin">Admin (Manager Access)</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
            <SelectItem value="cashier">Cashier</SelectItem>
            <SelectItem value="kitchen">Kitchen</SelectItem>
            <SelectItem value="viewer">Viewer (Read Only)</SelectItem>
          </SelectContent>
        </Select>

        {role !== 'owner' && role !== 'admin' && outlets.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {outlets.map((outlet) => (
              <div key={outlet.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`ob-outlet-${outlet.id}`}
                  checked={selectedOutlets.includes(outlet.id)}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedOutlets([...selectedOutlets, outlet.id])
                    else setSelectedOutlets(selectedOutlets.filter(id => id !== outlet.id))
                  }}
                  className="border-zinc-700 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                />
                <label htmlFor={`ob-outlet-${outlet.id}`} className="text-sm text-zinc-400">{outlet.name}</label>
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleInvite} disabled={inviting || !email.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          Send Invitation
        </Button>
      </div>

      {invited.length > 0 && (
        <div className="space-y-1.5">
          {invited.map((inv, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
              <Send className="h-3.5 w-3.5 text-emerald-500" /> {inv.name} ({inv.email})
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!linkData} onOpenChange={(open) => !open && setLinkData(null)}>
        <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Access Link Generated</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Copy this link and send it to {linkData?.name} directly (e.g. via WhatsApp).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 relative">
            <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input value={linkData?.link || ''} readOnly className="bg-zinc-900 border-zinc-800 pl-10" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkData(null)} className="text-zinc-400 hover:text-zinc-100">Close</Button>
            <Button onClick={() => { navigator.clipboard.writeText(linkData?.link || ''); toast.success('Link copied') }} className="bg-indigo-600 text-white hover:bg-indigo-700">
              <Copy className="h-4 w-4 mr-2" /> Copy Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
