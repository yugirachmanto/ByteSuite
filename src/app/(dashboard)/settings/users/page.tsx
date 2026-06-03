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
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Users, Search, Mail, Edit, Send, Link as LinkIcon, Copy } from 'lucide-react'
import { updateUserProfile, deleteUser } from '@/app/actions/users'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'

interface UserProfile {
  id: string
  full_name: string | null
  role: string
  is_active: boolean
  outlet_ids: string[]
  email?: string
}

export default function UsersSettingsPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [outlets, setOutlets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('cashier')
  const [inviteOutlets, setInviteOutlets] = useState<string[]>([])
  const [isInviting, setIsInviting] = useState(false)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('cashier')
  const [editOutlets, setEditOutlets] = useState<string[]>([])
  const [editIsActive, setEditIsActive] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  const [isResending, setIsResending] = useState<string | null>(null)
  const [inviteLinkData, setInviteLinkData] = useState<{name: string, link: string} | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)

  const handleResendInvite = async (userId: string, name: string) => {
    setIsResending(userId)
    try {
      const res = await fetch('/api/users/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to resend invite')
      
      toast.success('Invitation email sent again!')
      if (data.link) {
        setInviteLinkData({ name, link: data.link })
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsResending(null)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    // 1. Get user profiles
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .order('full_name')

    // 2. Get outlets for mapping
    const { data: outletsData } = await supabase
      .from('outlets')
      .select('id, name')

    // 3. Get current user's role
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
      if (profile) setCurrentUserRole(profile.role)
    }

    setOutlets(outletsData || [])
    
    // Auth user emails (in a real app, this would require an edge function / admin role, 
    // but for this MVP we'll just display the profiles. We don't have access to auth.users directly via client)
    setUsers((profiles || []) as UserProfile[])
    setLoading(false)
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsInviting(true)
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteName,
          role: inviteRole,
          outlet_ids: inviteRole === 'owner' ? [] : inviteOutlets
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to invite user')
      
      setIsInviteOpen(false)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('cashier')
      setInviteOutlets([])
      fetchData() // refresh list
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsInviting(false)
    }
  }

  const openEdit = (u: UserProfile) => {
    setEditingUser(u)
    const isInvited = u.full_name?.startsWith('[INVITED] ')
    const displayName = isInvited ? u.full_name!.replace('[INVITED] ', '') : (u.full_name || '')
    setEditName(displayName)
    setEditRole(u.role)
    setEditOutlets(u.outlet_ids || [])
    setEditIsActive(u.is_active)
    setIsEditOpen(true)
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setIsUpdating(true)
    try {
      const isInvited = editingUser.full_name?.startsWith('[INVITED] ')
      const finalName = isInvited ? `[INVITED] ${editName}` : editName

      const res = await updateUserProfile(editingUser.id, {
        full_name: finalName,
        role: editRole,
        outlet_ids: editOutlets,
        is_active: editIsActive
      })

      if (!res.success) {
        throw new Error(res.error)
      }

      toast.success('User updated successfully')
      setIsEditOpen(false)
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!editingUser) return
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return
    
    setIsUpdating(true)
    try {
      const res = await deleteUser(editingUser.id)
      if (!res.success) throw new Error(res.error)
      
      toast.success('User deleted successfully')
      setIsEditOpen(false)
      fetchData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsUpdating(false)
    }
  }

  const roleColors: Record<string, string> = {
    owner: 'bg-emerald-950/20 text-emerald-400 border-emerald-900/50',
    finance: 'bg-blue-950/20 text-blue-400 border-blue-900/50',
    cashier: 'bg-amber-950/20 text-amber-400 border-amber-900/50',
    kitchen: 'bg-purple-950/20 text-purple-400 border-purple-900/50',
    viewer: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  }

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            className="w-64 bg-zinc-950 border-zinc-800 pl-10"
            placeholder="Search users..."
          />
        </div>

        <Dialog open={!!inviteLinkData} onOpenChange={(open) => !open && setInviteLinkData(null)}>
          <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
            <DialogHeader>
              <DialogTitle>Access Link Generated</DialogTitle>
              <DialogDescription className="text-zinc-400">
                A direct access link has been generated for {inviteLinkData?.name}. Please copy the link below and send it to them directly (e.g. via WhatsApp).
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input 
                  value={inviteLinkData?.link || ''}
                  readOnly
                  className="bg-zinc-900 border-zinc-800 pl-10 pr-4"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setInviteLinkData(null)} className="text-zinc-400 hover:text-zinc-100">
                Close
              </Button>
              <Button type="button" onClick={() => {
                navigator.clipboard.writeText(inviteLinkData?.link || '')
                toast.success('Link copied to clipboard')
              }} className="bg-indigo-600 text-white hover:bg-indigo-700">
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogTrigger render={<Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" />}>
            <Mail className="mr-2 h-4 w-4" />
            Invite User
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
            <form onSubmit={handleInvite}>
              <DialogHeader>
                <DialogTitle>Invite New User</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Send an email invitation for them to join your organization.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-zinc-300">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="user@example.com"
                    value={inviteEmail} 
                    onChange={e => setInviteEmail(e.target.value)} 
                    required 
                    className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-zinc-300">Full Name</Label>
                  <Input 
                    id="name" 
                    placeholder="John Doe"
                    value={inviteName} 
                    onChange={e => setInviteName(e.target.value)} 
                    className="bg-zinc-900 border-zinc-800"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Role</Label>
                  <Select value={inviteRole} onValueChange={(val) => val && setInviteRole(val)}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                      <SelectItem value="owner">Owner (Full Access)</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="cashier">Cashier</SelectItem>
                      <SelectItem value="kitchen">Kitchen</SelectItem>
                      <SelectItem value="viewer">Viewer (Read Only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {inviteRole !== 'owner' && (
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Assigned Outlets</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {outlets.map((outlet) => (
                        <div key={outlet.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`outlet-${outlet.id}`} 
                            checked={inviteOutlets.includes(outlet.id)}
                            onCheckedChange={(checked) => {
                              if (checked) setInviteOutlets([...inviteOutlets, outlet.id])
                              else setInviteOutlets(inviteOutlets.filter(id => id !== outlet.id))
                            }}
                            className="border-zinc-700 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                          />
                          <label 
                            htmlFor={`outlet-${outlet.id}`} 
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-400"
                          >
                            {outlet.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsInviteOpen(false)} className="text-zinc-400 hover:text-zinc-100">
                  Cancel
                </Button>
                <Button type="submit" disabled={isInviting || !inviteEmail} className="bg-indigo-600 text-white hover:bg-indigo-700">
                  {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Invitation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
            <form onSubmit={handleUpdateUser}>
              <DialogHeader>
                <DialogTitle>Edit User Profile</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Update the user's role, name, assigned outlets, or active status.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="editName" className="text-zinc-300">Full Name</Label>
                  <Input 
                    id="editName" 
                    placeholder="John Doe"
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="bg-zinc-900 border-zinc-800"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-zinc-300">Role</Label>
                  <Select value={editRole} onValueChange={(val) => val && setEditRole(val)}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                      <SelectItem value="owner">Owner (Full Access)</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="cashier">Cashier</SelectItem>
                      <SelectItem value="kitchen">Kitchen</SelectItem>
                      <SelectItem value="viewer">Viewer (Read Only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {editRole !== 'owner' && (
                  <div className="grid gap-2">
                    <Label className="text-zinc-300">Assigned Outlets</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {outlets.map((outlet) => (
                        <div key={outlet.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`edit-outlet-${outlet.id}`} 
                            checked={editOutlets.includes(outlet.id)}
                            onCheckedChange={(checked) => {
                              if (checked) setEditOutlets([...editOutlets, outlet.id])
                              else setEditOutlets(editOutlets.filter(id => id !== outlet.id))
                            }}
                            className="border-zinc-700 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                          />
                          <label 
                            htmlFor={`edit-outlet-${outlet.id}`} 
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-zinc-400"
                          >
                            {outlet.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-zinc-800">
                  <Switch 
                    id="edit-is-active"
                    checked={editIsActive}
                    onCheckedChange={(checked) => setEditIsActive(checked)}
                    className="data-[state=checked]:bg-emerald-600"
                  />
                  <label htmlFor="edit-is-active" className="text-sm font-medium leading-none text-zinc-300">
                    Account is Active
                  </label>
                </div>
              </div>
              <DialogFooter className="sm:justify-between w-full flex-row">
                <Button type="button" variant="destructive" onClick={handleDeleteUser} disabled={isUpdating} className="h-9 w-auto">
                  Delete
                </Button>
                <div className="flex items-center space-x-2">
                  <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)} className="text-zinc-400 hover:text-zinc-100 h-9">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isUpdating} className="bg-indigo-600 text-white hover:bg-indigo-700 h-9">
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Name / Email</TableHead>
              <TableHead className="text-zinc-400">Role</TableHead>
              <TableHead className="text-zinc-400">Assigned Outlets</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-1 opacity-30" />
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                  <Users className="mx-auto h-8 w-8 mb-2 opacity-20" />
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isInvited = u.full_name?.startsWith('[INVITED] ')
                const displayName = isInvited ? u.full_name!.replace('[INVITED] ', '') : (u.full_name || 'Unnamed User')

                return (
                  <TableRow key={u.id} className="border-zinc-800 hover:bg-zinc-800/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 uppercase">
                          {displayName.substring(0, 2)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-100">{displayName}</span>
                          <span className="text-xs text-zinc-500">{u.id.substring(0,8)}...</span>
                        </div>
                      </div>
                    </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleColors[u.role] || ''}>
                      {u.role.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-xs">
                    {u.role === 'owner' ? (
                      <span className="text-emerald-500">All Outlets</span>
                    ) : u.outlet_ids?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {u.outlet_ids.map((oid) => {
                          const oName = outlets.find(o => o.id === oid)?.name
                          return oName ? (
                            <span key={oid} className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">
                              {oName}
                            </span>
                          ) : null
                        })}
                      </div>
                    ) : (
                      <span className="text-zinc-600">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isInvited ? (
                      <div className="flex items-center gap-1.5 text-amber-500 text-xs font-medium">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Invited
                      </div>
                    ) : u.is_active ? (
                      <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                        <div className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                        Inactive
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        disabled={isResending === u.id}
                        onClick={() => handleResendInvite(u.id, displayName)} 
                        className="text-amber-500 hover:text-amber-400 hover:bg-amber-950/30 text-xs px-2"
                        title="Resend Invitation"
                      >
                        {isResending === u.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                        Resend
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="text-zinc-400 hover:text-zinc-100 text-xs px-2">
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
