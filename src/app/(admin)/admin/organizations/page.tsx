'use client'

import React, { useState, useEffect } from 'react'
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
import { Building2, Loader2, CreditCard, Ban, CheckCircle2, Settings, ChevronRight, ChevronDown, User, PlusCircle, FileText, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { format } from 'date-fns'

export default function AdminOrganizationsPage() {
  const [groupedOrgs, setGroupedOrgs] = useState<{ ownerName: string, orgs: any[] }[]>([])
  const [expandedOwners, setExpandedOwners] = useState<Record<string, boolean>>({})
  const [expandedOrgs, setExpandedOrgs] = useState<Record<string, boolean>>({}) // For expanding invoices
  const [loading, setLoading] = useState(true)

  // Billing Modal State
  const [isBillingOpen, setIsBillingOpen] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<any>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  
  // Invoice Form State
  const [invoiceDesc, setInvoiceDesc] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDue, setInvoiceDue] = useState('')
  const [invoiceOutletId, setInvoiceOutletId] = useState('')

  // Receipt Modal State
  const [viewingReceipt, setViewingReceipt] = useState<any>(null)

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

  const toggleExpandOrg = (orgId: string) => {
    setExpandedOrgs(prev => ({ ...prev, [orgId]: !prev[orgId] }))
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

  function openCreateInvoice(org: any) {
    setSelectedOrg(org)
    setInvoiceDesc(`${org.subscription_plan || 'Pro'} Plan - Custom Setup`)
    setInvoiceAmount('')
    setInvoiceDue('')
    setInvoiceOutletId(org.outlets?.[0]?.id || '')
    setIsBillingOpen(true)
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault()
    setIsUpdating(true)
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: selectedOrg.id,
          payment_outlet_id: invoiceOutletId,
          description: invoiceDesc,
          amount: parseFloat(invoiceAmount),
          due_date: invoiceDue || null,
        })
      })
      if (res.ok) {
        setIsBillingOpen(false)
        fetchOrgs() // Refresh data to show new invoice
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdating(false)
    }
  }

  async function updateInvoiceStatus(invoiceId: string, status: string) {
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoiceId, status })
      })
      if (res.ok) fetchOrgs()
    } catch (err) {
      console.error(err)
    }
  }

  async function deleteInvoice(invoiceId: string) {
    if (!confirm('Are you sure you want to delete this billing?')) return
    try {
      const res = await fetch(`/api/admin/invoices?id=${invoiceId}`, {
        method: 'DELETE',
      })
      if (res.ok) fetchOrgs()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Organizations</h2>
        <p className="text-zinc-400">Manage tenants grouped by Owner.</p>
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
            ) : groupedOrgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                  <Building2 className="mx-auto h-8 w-8 mb-2 opacity-20" />
                  No organizations found.
                </TableCell>
              </TableRow>
            ) : (
              groupedOrgs.map((group) => (
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
                  {expandedOwners[group.ownerName] && group.orgs.map((org) => (
                    <React.Fragment key={org.id}>
                      <TableRow className="border-zinc-800 hover:bg-zinc-800/30">
                        <TableCell className="pl-12">
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggleExpandOrg(org.id)} className="text-zinc-500 hover:text-zinc-300">
                              {expandedOrgs[org.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                            <div className="flex flex-col cursor-pointer" onClick={() => toggleExpandOrg(org.id)}>
                              <span className="font-medium text-zinc-100">{org.name}</span>
                              <span className="text-xs text-zinc-500">{org.id.substring(0,8)}...</span>
                            </div>
                          </div>
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
                            <Button variant="ghost" size="sm" onClick={() => openCreateInvoice(org)} className="text-zinc-400 hover:text-amber-400">
                              <PlusCircle className="h-4 w-4 mr-2" />
                              New Bill
                            </Button>
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

                      {/* Invoices List (Expanded) */}
                      {expandedOrgs[org.id] && (
                        <TableRow className="bg-zinc-950/50">
                          <TableCell colSpan={5} className="p-0 border-b border-zinc-800">
                            <div className="pl-24 pr-8 py-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-medium text-zinc-400 flex items-center">
                                  <FileText className="h-4 w-4 mr-2" /> 
                                  Billing History
                                </h4>
                              </div>
                              
                              {!org.tenant_invoices || org.tenant_invoices.length === 0 ? (
                                <p className="text-sm text-zinc-600 italic">No invoices created for this organization yet.</p>
                              ) : (
                                <div className="rounded-md border border-zinc-800/50">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="hover:bg-transparent border-zinc-800/50 text-xs">
                                        <TableHead className="text-zinc-500">Date</TableHead>
                                        <TableHead className="text-zinc-500">Description</TableHead>
                                        <TableHead className="text-zinc-500">Amount</TableHead>
                                        <TableHead className="text-zinc-500">Status</TableHead>
                                        <TableHead className="text-right text-zinc-500">Action</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {org.tenant_invoices.sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((inv: any) => (
                                        <TableRow key={inv.id} className="border-zinc-800/50 hover:bg-zinc-800/30 text-sm">
                                          <TableCell className="text-zinc-300">
                                            {format(new Date(inv.created_at), 'dd/MM/yyyy')}
                                          </TableCell>
                                          <TableCell className="text-zinc-100">{inv.description}</TableCell>
                                          <TableCell className="text-zinc-300">
                                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(inv.amount)}
                                          </TableCell>
                                          <TableCell>
                                            <Badge variant="outline" className={
                                              inv.status === 'paid' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' : 
                                              inv.status === 'under_review' ? 'border-amber-500/30 text-amber-400 bg-amber-950/20' : 
                                              inv.status === 'pending' ? 'border-red-500/30 text-red-400 bg-red-950/20' : 
                                              'border-zinc-500/30 text-zinc-400 bg-zinc-950/20'
                                            }>
                                              {inv.status.replace('_', ' ')}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                              {inv.status === 'pending' && (
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
                                                  onClick={() => updateInvoiceStatus(inv.id, 'paid')}
                                                >
                                                  Mark Paid
                                                </Button>
                                              )}
                                              {inv.status === 'under_review' && (
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
                                                  onClick={() => updateInvoiceStatus(inv.id, 'paid')}
                                                >
                                                  Approve
                                                </Button>
                                              )}
                                              {inv.receipt_url && (
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-7 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30"
                                                  onClick={() => setViewingReceipt(inv)}
                                                >
                                                  Receipt
                                                </Button>
                                              )}
                                              {inv.status === 'paid' && (
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-7 text-xs text-zinc-500 hover:text-amber-400 hover:bg-amber-950/30"
                                                  onClick={() => updateInvoiceStatus(inv.id, 'pending')}
                                                >
                                                  Mark Pending
                                                </Button>
                                              )}
                                              {inv.status !== 'paid' && (
                                                <Button 
                                                  variant="ghost" 
                                                  size="icon" 
                                                  className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 ml-2"
                                                  onClick={() => deleteInvoice(inv.id)}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Invoice Modal */}
      <Dialog open={isBillingOpen} onOpenChange={setIsBillingOpen}>
        <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
          <form onSubmit={handleCreateInvoice}>
            <DialogHeader>
              <DialogTitle>Create New Bill</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Generate a custom invoice for {selectedOrg?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-zinc-300">Description</Label>
                <Input 
                  value={invoiceDesc}
                  onChange={e => setInvoiceDesc(e.target.value)}
                  placeholder="e.g. Pro Plan - Custom Setup"
                  required
                  className="bg-zinc-900 border-zinc-800 text-zinc-100" 
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-300">Amount (Rp)</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={invoiceAmount}
                  onChange={e => setInvoiceAmount(e.target.value)}
                  placeholder="e.g. 49.00"
                  required
                  className="bg-zinc-900 border-zinc-800 text-zinc-100" 
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-300">Target Outlet</Label>
                <Select value={invoiceOutletId} onValueChange={(v) => setInvoiceOutletId(v || '')} required>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <SelectValue placeholder="Select an outlet">
                      {invoiceOutletId ? selectedOrg?.outlets?.find((o: any) => o.id === invoiceOutletId)?.name : "Select an outlet"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800">
                    {selectedOrg?.outlets?.map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-300">Due Date</Label>
                <Input 
                  type="date" 
                  value={invoiceDue}
                  onChange={e => setInvoiceDue(e.target.value)}
                  required
                  className="bg-zinc-900 border-zinc-800 [color-scheme:dark]" 
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsBillingOpen(false)} className="text-zinc-400 hover:text-zinc-100">
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating} className="bg-indigo-600 text-white hover:bg-indigo-700">
                {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings className="mr-2 h-4 w-4" />}
                Create Bill
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receipt View Modal */}
      <Dialog open={!!viewingReceipt} onOpenChange={(open) => !open && setViewingReceipt(null)}>
        <DialogContent className="sm:max-w-[600px] bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Review the payment receipt below.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex justify-center bg-zinc-900 rounded-md overflow-hidden relative min-h-[200px]">
            {viewingReceipt?.receipt_url ? (
              viewingReceipt.receipt_url.toLowerCase().endsWith('.pdf') ? (
                <iframe src={viewingReceipt.receipt_url} className="w-full h-[60vh] border-0 bg-white" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewingReceipt.receipt_url} alt="Receipt" className="max-w-full max-h-[60vh] object-contain" />
              )
            ) : (
              <span className="text-zinc-500 my-auto">No receipt found.</span>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingReceipt(null)} className="text-zinc-400 hover:text-zinc-100">
              Close
            </Button>
            {viewingReceipt?.status === 'under_review' && (
              <Button 
                onClick={() => {
                  updateInvoiceStatus(viewingReceipt.id, 'paid')
                  setViewingReceipt(null)
                }} 
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Approve Payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
