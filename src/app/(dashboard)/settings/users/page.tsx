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
import { Loader2, Users, Search, Mail } from 'lucide-react'

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

    setOutlets(outletsData || [])
    
    // Auth user emails (in a real app, this would require an edge function / admin role, 
    // but for this MVP we'll just display the profiles. We don't have access to auth.users directly via client)
    setUsers((profiles || []) as UserProfile[])
    setLoading(false)
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
        <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Mail className="mr-2 h-4 w-4" />
          Invite User
        </Button>
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
              users.map((u) => (
                <TableRow key={u.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 uppercase">
                        {(u.full_name || 'U').substring(0, 2)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-zinc-100">{u.full_name || 'Unnamed User'}</span>
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
                    {u.is_active ? (
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
                    <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100 text-xs">
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
