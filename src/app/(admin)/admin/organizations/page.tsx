'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
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
import { Building2, Loader2, Ban, CheckCircle2, ChevronRight, ChevronDown, User, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function AdminOrganizationsPage() {
  const [groupedOrgs, setGroupedOrgs] = useState<{ ownerName: string, orgs: any[] }[]>([])
  const [expandedOwners, setExpandedOwners] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchOrgs()
  }, [])

  async function fetchOrgs() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/organizations')
      const data = await res.json()
      if (data.organizations) {
        const groups: Record<string, any[]> = {}
        data.organizations.forEach((org: any) => {
          const owner = org.user_profiles?.find((u: any) => u.role === 'owner')
          const ownerName = owner ? `${owner.full_name || 'Unnamed Owner'} (${owner.id.substring(0,8)})` : 'Unassigned / No Owner'
          if (!groups[ownerName]) groups[ownerName] = []
          groups[ownerName].push(org)
        })

        const groupedArray = Object.entries(groups).map(([ownerName, orgs]) => ({
          ownerName,
          orgs
        }))

        // Auto-expand all owners initially
        const initialExpanded: Record<string, boolean> = {}
        groupedArray.forEach(g => {
          initialExpanded[g.ownerName] = true
        })

        setGroupedOrgs(groupedArray)
        setExpandedOwners(initialExpanded)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const toggleExpandOwner = (ownerName: string) => {
    setExpandedOwners(prev => ({ ...prev, [ownerName]: !prev[ownerName] }))
  }

  async function toggleSuspend(org: any) {
    if (!confirm(`Are you sure you want to ${org.is_active ? 'suspend' : 'activate'} ${org.name}?`)) return

    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: org.id, is_active: !org.is_active })
      })
      if (res.ok) fetchOrgs()
    } catch (err) {
      console.error(err)
    }
  }

  const filteredGroups = groupedOrgs
    .map((g) => ({
      ...g,
      orgs: g.orgs.filter((org) => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return (
          org.name.toLowerCase().includes(q) ||
          g.ownerName.toLowerCase().includes(q) ||
          (org.subscription_plan || '').toLowerCase().includes(q)
        )
      })
    }))
    .filter((g) => g.orgs.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Organizations</h2>
          <p className="text-zinc-400">Manage tenants grouped by Owner. Click an organization for full details, subscription, and billing history.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            className="w-72 bg-zinc-950 border-zinc-800 pl-10"
            placeholder="Search org, owner, or plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="border-zinc-800 bg-zinc-900">
            <TableRow className="hover:bg-transparent border-zinc-800">
              <TableHead className="text-zinc-400">Organization Name</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400">Plan</TableHead>
              <TableHead className="text-zinc-400">Total Users</TableHead>
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
            ) : filteredGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                  <Building2 className="mx-auto h-8 w-8 mb-2 opacity-20" />
                  {search ? 'No organizations match your search.' : 'No organizations found.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredGroups.map((group) => (
                <React.Fragment key={group.ownerName}>
                  {/* Owner Header Row */}
                  <TableRow
                    className="border-zinc-800 bg-indigo-950/20 hover:bg-indigo-950/30 cursor-pointer"
                    onClick={() => toggleExpandOwner(group.ownerName)}
                  >
                    <TableCell colSpan={5} className="py-2">
                      <div className="flex items-center gap-2 text-indigo-300 font-medium">
                        {expandedOwners[group.ownerName] ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <User className="h-4 w-4" />
                        <span>Owner: {group.ownerName}</span>
                        <Badge variant="outline" className="ml-2 border-indigo-500/30 text-indigo-300 bg-indigo-950/40">
                          {group.orgs.length} Org{group.orgs.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Organization Rows */}
                  {(expandedOwners[group.ownerName] || !!search.trim()) && group.orgs.map((org) => (
                    <TableRow key={org.id} className="border-zinc-800 hover:bg-zinc-800/30">
                      <TableCell className="pl-12">
                        <Link href={`/admin/organizations/${org.id}`} className="flex flex-col hover:text-indigo-300">
                          <span className="font-medium text-zinc-100">{org.name}</span>
                          <span className="text-xs text-zinc-500">{org.id.substring(0,8)}...</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {org.is_active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">Active</Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-400 hover:bg-red-500/20">Suspended</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-indigo-500/30 text-indigo-300">
                          {org.subscription_plan || 'Free'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-300">
                        {org.user_profiles?.length || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/admin/organizations/${org.id}`}>
                            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-indigo-400">
                              <ChevronRight className="h-4 w-4 mr-1" />
                              Details
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSuspend(org)}
                            className={org.is_active ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-400 hover:text-emerald-400'}
                          >
                            {org.is_active ? (
                              <><Ban className="h-4 w-4 mr-2" />Suspend</>
                            ) : (
                              <><CheckCircle2 className="h-4 w-4 mr-2" />Activate</>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
