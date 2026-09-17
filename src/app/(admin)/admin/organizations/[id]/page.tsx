'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Loader2, Ban, CheckCircle2, Building2, Users, FileText,
  PlusCircle, Trash2, Save, CreditCard,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getSignedFileUrl } from '@/lib/storage'

export default function AdminOrganizationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.id as string
  const supabase = createClient()

  const [org, setOrg] = useState<any>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Subscription form
  const [planId, setPlanId] = useState<string>('')
  const [status, setStatus] = useState<string>('active')
  const [nextBillingDate, setNextBillingDate] = useState<string>('')

  // New bill modal
  const [isBillingOpen, setIsBillingOpen] = useState(false)
  const [invoiceDesc, setInvoiceDesc] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDue, setInvoiceDue] = useState('')
  const [invoiceOutletId, setInvoiceOutletId] = useState('')
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false)

  // Receipt modal
  const [viewingReceipt, setViewingReceipt] = useState<any>(null)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function fetchData() {
    setLoading(true)
    try {
      const [orgsRes, plansRes] = await Promise.all([
        fetch('/api/admin/organizations'),
        fetch('/api/admin/plans'),
      ])
      const orgsData = await orgsRes.json()
      const plansData = await plansRes.json()

      const found = (orgsData.organizations || []).find((o: any) => o.id === orgId)
      setOrg(found || null)
      setPlans(plansData.plans || [])

      if (found) {
        setPlanId(found.subscription_plan_id || '')
        setStatus(found.subscription_status || 'active')
        setNextBillingDate(found.next_billing_date || '')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function toggleSuspend() {
    if (!org) return
    if (!confirm(`Are you sure you want to ${org.is_active ? 'suspend' : 'activate'} ${org.name}?`)) return
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: org.id, is_active: !org.is_active }),
      })
      if (res.ok) fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSaveSubscription() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orgId,
          subscription_plan_id: planId || null,
          subscription_status: status,
          next_billing_date: nextBillingDate || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Subscription updated')
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save subscription')
    } finally {
      setSaving(false)
    }
  }

  async function toggleUserSuspend(user: any) {
    if (!confirm(`${user.is_active ? 'Suspend' : 'Activate'} ${user.full_name || 'this user'}?`)) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
      })
      if (res.ok) fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  function openCreateInvoice() {
    setInvoiceDesc(`${org?.subscription_plans?.name || 'Pro'} Plan - Custom Setup`)
    setInvoiceAmount('')
    setInvoiceDue('')
    setInvoiceOutletId(org?.outlets?.[0]?.id || '')
    setIsBillingOpen(true)
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault()
    setIsCreatingInvoice(true)
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          payment_outlet_id: invoiceOutletId,
          description: invoiceDesc,
          amount: parseFloat(invoiceAmount),
          due_date: invoiceDue || null,
        }),
      })
      if (res.ok) {
        setIsBillingOpen(false)
        fetchData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsCreatingInvoice(false)
    }
  }

  async function updateInvoiceStatus(invoiceId: string, newStatus: string) {
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoiceId, status: newStatus }),
      })
      if (res.ok) fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  async function deleteInvoice(invoiceId: string) {
    if (!confirm('Are you sure you want to delete this billing?')) return
    try {
      const res = await fetch(`/api/admin/invoices?id=${invoiceId}`, { method: 'DELETE' })
      if (res.ok) fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleViewReceipt = async (inv: any) => {
    setViewingReceipt(inv)
    if (!inv.receipt_url) return
    const signed = await getSignedFileUrl(supabase, 'receipts', inv.receipt_url)
    setViewingReceipt((prev: any) => (prev?.id === inv.id ? { ...prev, signedReceiptUrl: signed } : prev))
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="space-y-4">
        <Link href="/admin/organizations" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" /> Back to Organizations
        </Link>
        <p className="text-zinc-500">Organization not found.</p>
      </div>
    )
  }

  const invoices = (org.tenant_invoices || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/organizations">
            <Button variant="ghost" size="icon" className="text-zinc-400">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-100">{org.name}</h2>
              {org.is_active ? (
                <Badge className="bg-emerald-500/10 text-emerald-400">Active</Badge>
              ) : (
                <Badge className="bg-red-500/10 text-red-400">Suspended</Badge>
              )}
            </div>
            <p className="text-zinc-500 text-xs font-mono">{org.id}</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={toggleSuspend}
          className={org.is_active ? 'border-red-900/50 text-red-400 hover:bg-red-950/20' : 'border-emerald-900/50 text-emerald-400 hover:bg-emerald-950/20'}
        >
          {org.is_active ? (<><Ban className="h-4 w-4 mr-2" />Suspend Organization</>) : (<><CheckCircle2 className="h-4 w-4 mr-2" />Activate Organization</>)}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Subscription */}
        <Card className="lg:col-span-1 border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-zinc-100 flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-indigo-400" /> Subscription
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Plan, status, and next billing date.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300 text-xs">Plan</Label>
              <Select value={planId} onValueChange={(v) => setPlanId(v || '')}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue placeholder="Select a plan">
                    {(() => {
                      const selected = plans.find((p) => p.id === planId)
                      return selected ? `${selected.name} ${selected.price === null ? '(Custom)' : `— Rp ${Number(selected.price).toLocaleString('id-ID')}`}` : 'Select a plan'
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.price === null ? '(Custom)' : `— Rp ${Number(p.price).toLocaleString('id-ID')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300 text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v || 'active')}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue>
                    {status === 'active' ? 'Active' : status === 'past_due' ? 'Past Due' : status === 'cancelled' ? 'Cancelled' : status}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300 text-xs">Next Billing Date</Label>
              <Input
                type="date"
                value={nextBillingDate || ''}
                onChange={(e) => setNextBillingDate(e.target.value)}
                className="bg-zinc-950 border-zinc-800 [color-scheme:dark]"
              />
            </div>
            <Button onClick={handleSaveSubscription} disabled={saving} className="w-full bg-indigo-600 text-white hover:bg-indigo-700">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Subscription
            </Button>
          </CardContent>
        </Card>

        {/* Outlets & Users */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-zinc-100 flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-indigo-400" /> Outlets ({org.outlets?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!org.outlets || org.outlets.length === 0 ? (
                <p className="text-sm text-zinc-600 italic">No outlets yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {org.outlets.map((o: any) => (
                    <Badge key={o.id} variant="outline" className="border-zinc-700 text-zinc-300">{o.name}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-zinc-100 flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-indigo-400" /> Users ({org.user_profiles?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  {(!org.user_profiles || org.user_profiles.length === 0) ? (
                    <TableRow>
                      <TableCell className="text-center text-zinc-600 italic py-6">No users in this organization.</TableCell>
                    </TableRow>
                  ) : (
                    org.user_profiles.map((u: any) => (
                      <TableRow key={u.id} className="border-zinc-800/50 hover:bg-zinc-800/20">
                        <TableCell>
                          <span className="font-medium text-zinc-100">{u.full_name || 'Unnamed User'}</span>
                          {u.is_superadmin && <Badge className="ml-2 bg-indigo-600">Admin</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">{(u.role || 'none').toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>
                          {u.is_active ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 text-xs">Active</Badge>
                          ) : (
                            <Badge className="bg-red-500/10 text-red-400 text-xs">Suspended</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleUserSuspend(u)}
                            className={u.is_active ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-400 hover:text-emerald-400'}
                          >
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Billing History */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-zinc-100 flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-indigo-400" /> Billing History
          </CardTitle>
          <Button variant="outline" size="sm" onClick={openCreateInvoice} className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">
            <PlusCircle className="h-4 w-4 mr-2" /> New Bill
          </Button>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-zinc-600 italic">No invoices created for this organization yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-zinc-800 text-xs">
                  <TableHead className="text-zinc-500">Date</TableHead>
                  <TableHead className="text-zinc-500">Description</TableHead>
                  <TableHead className="text-zinc-500">Amount</TableHead>
                  <TableHead className="text-zinc-500">Status</TableHead>
                  <TableHead className="text-right text-zinc-500">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv.id} className="border-zinc-800/50 hover:bg-zinc-800/30 text-sm">
                    <TableCell className="text-zinc-300">{format(new Date(inv.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-zinc-100">{inv.description}</TableCell>
                    <TableCell className="text-zinc-300">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(inv.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        inv.status === 'paid' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' :
                        inv.status === 'overdue' ? 'border-orange-500/40 text-orange-400 bg-orange-950/30 font-semibold' :
                        inv.status === 'under_review' ? 'border-amber-500/30 text-amber-400 bg-amber-950/20' :
                        inv.status === 'pending' ? 'border-red-500/30 text-red-400 bg-red-950/20' :
                        'border-zinc-500/30 text-zinc-400 bg-zinc-950/20'
                      }>
                        {inv.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(inv.status === 'pending' || inv.status === 'overdue') && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30" onClick={() => updateInvoiceStatus(inv.id, 'paid')}>
                            Mark Paid
                          </Button>
                        )}
                        {inv.status === 'under_review' && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30" onClick={() => updateInvoiceStatus(inv.id, 'paid')}>
                            Approve
                          </Button>
                        )}
                        {inv.receipt_url && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30" onClick={() => handleViewReceipt(inv)}>
                            Receipt
                          </Button>
                        )}
                        {inv.status === 'paid' && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-500 hover:text-amber-400 hover:bg-amber-950/30" onClick={() => updateInvoiceStatus(inv.id, 'pending')}>
                            Mark Pending
                          </Button>
                        )}
                        {inv.status !== 'paid' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 ml-2" onClick={() => deleteInvoice(inv.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Invoice Modal */}
      <Dialog open={isBillingOpen} onOpenChange={setIsBillingOpen}>
        <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
          <form onSubmit={handleCreateInvoice}>
            <DialogHeader>
              <DialogTitle>Create New Bill</DialogTitle>
              <DialogDescription className="text-zinc-400">Generate a custom invoice for {org.name}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-zinc-300">Description</Label>
                <Input value={invoiceDesc} onChange={(e) => setInvoiceDesc(e.target.value)} required className="bg-zinc-900 border-zinc-800 text-zinc-100" />
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-300">Amount (Rp)</Label>
                <Input type="number" step="0.01" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} required className="bg-zinc-900 border-zinc-800 text-zinc-100" />
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-300">Target Outlet</Label>
                <Select value={invoiceOutletId} onValueChange={(v) => setInvoiceOutletId(v || '')} required>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <SelectValue placeholder="Select an outlet">
                      {invoiceOutletId ? org.outlets?.find((o: any) => o.id === invoiceOutletId)?.name : 'Select an outlet'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800">
                    {org.outlets?.map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-300">Due Date</Label>
                <Input type="date" value={invoiceDue} onChange={(e) => setInvoiceDue(e.target.value)} required className="bg-zinc-900 border-zinc-800 [color-scheme:dark]" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsBillingOpen(false)} className="text-zinc-400 hover:text-zinc-100">Cancel</Button>
              <Button type="submit" disabled={isCreatingInvoice} className="bg-indigo-600 text-white hover:bg-indigo-700">
                {isCreatingInvoice && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
            <DialogDescription className="text-zinc-400">Review the payment receipt below.</DialogDescription>
          </DialogHeader>
          <div className="py-4 flex justify-center bg-zinc-900 rounded-md overflow-hidden relative min-h-[200px]">
            {!viewingReceipt?.receipt_url ? (
              <span className="text-zinc-500 my-auto">No receipt found.</span>
            ) : !viewingReceipt.signedReceiptUrl ? (
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500 my-auto" />
            ) : viewingReceipt.receipt_url.toLowerCase().endsWith('.pdf') ? (
              <iframe src={viewingReceipt.signedReceiptUrl} className="w-full h-[60vh] border-0 bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewingReceipt.signedReceiptUrl} alt="Receipt" className="max-w-full max-h-[60vh] object-contain" />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingReceipt(null)} className="text-zinc-400 hover:text-zinc-100">Close</Button>
            {viewingReceipt?.status === 'under_review' && (
              <Button onClick={() => { updateInvoiceStatus(viewingReceipt.id, 'paid'); setViewingReceipt(null) }} className="bg-emerald-600 text-white hover:bg-emerald-700">
                Approve Payment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
