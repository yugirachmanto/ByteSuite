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
import { Users, Loader2, Ban, CheckCircle2 } from 'lucide-react'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (data.users) {
        setUsers(data.users)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function toggleSuspend(user: any) {
    if (!confirm(`Are you sure you want to ${user.is_active ? 'suspend' : 'activate'} ${user.full_name || 'this user'}?`)) return
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, is_active: !user.is_active })
      })
      if (res.ok) fetchUsers()
    } catch (err) {
      console.error(err)
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Global Users</h2>
        <p className="text-zinc-400">Manage all users across all organizations.</p>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800 bg-zinc-900">
            <TableRow className="hover:bg-transparent border-zinc-800">
              <TableHead className="text-zinc-400">User / Email</TableHead>
              <TableHead className="text-zinc-400">Organization</TableHead>
              <TableHead className="text-zinc-400">Role</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-right text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-30" />
                  Loading...
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
              users.map((u) => (
                <TableRow key={u.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">
                        {u.full_name || 'Unnamed User'}
                        {u.is_superadmin && <Badge className="ml-2 bg-indigo-600">Admin</Badge>}
                      </span>
                      <span className="text-xs text-zinc-500">{u.id.substring(0,8)}...</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    {u.organizations?.name || <span className="text-zinc-600 italic">None</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleColors[u.role] || ''}>
                      {u.role ? u.role.toUpperCase() : 'NONE'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_active ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">Active</Badge>
                    ) : (
                      <Badge className="bg-red-500/10 text-red-400 hover:bg-red-500/20">Suspended</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => toggleSuspend(u)}
                      className={u.is_active ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-400 hover:text-emerald-400'}
                    >
                      {u.is_active ? (
                        <><Ban className="h-4 w-4 mr-2" />Suspend</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 mr-2" />Activate</>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
