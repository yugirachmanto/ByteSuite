'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, CreditCard, Loader2, FileText, Download, UploadCloud, ArrowUpCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { format } from 'date-fns'
import { CoaCombobox } from '@/components/ui/coa-combobox'
import { Input } from '@/components/ui/input'

export default function BillingPage() {
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [allPlans, setAllPlans] = useState<any[]>([])
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [requestingPlanId, setRequestingPlanId] = useState<string | null>(null)

  // Payment Modal State
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Form Data
  const [outlets, setOutlets] = useState<any[]>([])
  const [coas, setCoas] = useState<any[]>([])
  const [paymentOutletId, setPaymentOutletId] = useState('')
  const [paymentAssetCoaId, setPaymentAssetCoaId] = useState('')
  const [paymentExpenseCoaId, setPaymentExpenseCoaId] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  const supabase = createClient()

  useEffect(() => {
    fetchOrgAndData()
  }, [])

  async function fetchOrgAndData() {
    try {
      // Fetch Org & Invoices
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*, tenant_invoices(*), subscription_plans(name, price, max_outlets, max_users, features, description)')
        .single()
      
      if (orgError) throw orgError
      setOrg(orgData)

      // Fetch Outlets
      const { data: outletData } = await supabase.from('outlets').select('*').eq('org_id', orgData.id)
      if (outletData) {
        setOutlets(outletData)
        if (outletData.length > 0) setPaymentOutletId(outletData[0].id)
      }

      // Fetch COAs
      const { data: coaData } = await supabase.from('chart_of_accounts').select('*').eq('org_id', orgData.id)
      if (coaData) setCoas(coaData)

      // Fetch the full plan catalog (for the "Available Plans" section) and
      // this org's own upgrade requests (to show "Requested" instead of a
      // dead button for a plan already asked for).
      const { data: plansData } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order')
      if (plansData) setAllPlans(plansData)

      const { data: requestsData } = await supabase.from('plan_upgrade_requests').select('*').eq('org_id', orgData.id).order('created_at', { ascending: false })
      if (requestsData) setMyRequests(requestsData)

    } catch (error) {
      console.error('Error fetching billing data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleRequestUpgrade(planId: string) {
    setRequestingPlanId(planId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('plan_upgrade_requests').insert({
        org_id: org.id,
        requested_plan_id: planId,
        requested_by: user?.id || null,
      })
      if (error) throw error
      toast.success('Upgrade requested! Our team will follow up shortly.')
      fetchOrgAndData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit upgrade request')
    } finally {
      setRequestingPlanId(null)
    }
  }

  function openPayModal(invoice: any) {
    setSelectedInvoice(invoice)
    setReceiptFile(null)
    setPaymentOutletId(invoice.payment_outlet_id || '')
    setPaymentAssetCoaId('')
    setPaymentExpenseCoaId('')
    setIsPayModalOpen(true)
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!receiptFile || !paymentOutletId || !paymentAssetCoaId || !paymentExpenseCoaId) {
      toast.error('Please fill in all fields and upload a receipt.')
      return
    }

    setIsSubmitting(true)
    try {
      // 1. Upload receipt to Supabase Storage
      const fileExt = receiptFile.name.split('.').pop()
      const fileName = `${selectedInvoice.id}-${Date.now()}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, receiptFile)

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(fileName)
      const receiptUrl = publicUrlData.publicUrl

      // 2. Update Invoice with under_review and GL configs
      const { error: updateError } = await supabase
        .from('tenant_invoices')
        .update({
          status: 'under_review',
          receipt_url: receiptUrl,
          payment_outlet_id: paymentOutletId,
          payment_asset_coa_id: paymentAssetCoaId,
          payment_expense_coa_id: paymentExpenseCoaId
        })
        .eq('id', selectedInvoice.id)

      if (updateError) throw updateError

      toast.success('Payment submitted successfully! Waiting for admin approval.')
      setIsPayModalOpen(false)
      fetchOrgAndData()

    } catch (err: any) {
      console.error('Payment error:', err)
      toast.error('Failed to submit payment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!org) {
    return <div className="text-zinc-500">Could not load billing information.</div>
  }

  const currentPlan = org.subscription_plan || 'Free'
  const isPastDue = org.subscription_status === 'past_due'

  const assetCoas = coas.filter(c => c.type === 'asset' && c.is_active)
  const expenseCoas = coas.filter(c => c.type === 'expense' && c.is_active)

  let nextBillingDateStr = 'N/A'
  if (org.next_billing_date) {
    nextBillingDateStr = new Date(org.next_billing_date).toLocaleDateString(undefined, { 
      year: 'numeric', month: 'long', day: 'numeric' 
    })
  } else if (org.tenant_invoices && org.tenant_invoices.length > 0) {
    const sorted = [...org.tenant_invoices].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const latestDate = new Date(sorted[0].created_at)
    latestDate.setMonth(latestDate.getMonth() + 1)
    nextBillingDateStr = latestDate.toLocaleDateString(undefined, { 
      year: 'numeric', month: 'long', day: 'numeric' 
    })
  }

  const outstandingInvoices = (org.tenant_invoices || []).filter((inv: any) => ['pending', 'under_review', 'past_due', 'overdue'].includes(inv.status))
  const historyInvoices = (org.tenant_invoices || []).filter((inv: any) => !['pending', 'under_review', 'past_due', 'overdue'].includes(inv.status))

  return (
    <div className="space-y-8 pb-8">
      {/* Current Plan Overview */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-indigo-400" />
                Current Subscription
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Manage your billing and subscription plan.
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge 
                variant="outline" 
                className={`px-3 py-1 text-sm ${
                  isPastDue 
                    ? 'border-red-500/30 text-red-400 bg-red-950/20'
                    : 'border-indigo-500/30 text-indigo-300 bg-indigo-950/20'
                }`}
              >
                {currentPlan} Plan
              </Badge>
              {org.subscription_status !== 'active' && (
                <span className="text-xs font-medium text-red-400 uppercase tracking-wider">
                  Status: {org.subscription_status?.replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-500">Organization</p>
              <p className="font-medium text-zinc-200">{org.name}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-500">Next Billing Date</p>
              <p className="font-medium text-zinc-200">{nextBillingDateStr}</p>
            </div>
          </div>
          {org.subscription_plans && (
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-zinc-500">Plan Price</p>
                <p className="font-mono text-lg font-bold text-zinc-100">
                  {org.subscription_plans.price === null
                    ? 'Custom'
                    : `${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(org.subscription_plans.price)}/mo`}
                </p>
              </div>
              {org.subscription_plans.description && (
                <p className="text-sm text-zinc-400">{org.subscription_plans.description}</p>
              )}
              {(org.subscription_plans.features || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {org.subscription_plans.features.map((f: string, i: number) => (
                    <Badge key={i} variant="outline" className="border-zinc-700 text-zinc-300 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" />
                      {f}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      {allPlans.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-indigo-400" />
            Available Plans
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            {allPlans.map((plan) => {
              const isCurrent = plan.id === org.subscription_plan_id
              const pendingRequest = myRequests.find((r) => r.requested_plan_id === plan.id && r.status === 'pending')
              return (
                <Card key={plan.id} className={`bg-zinc-900 flex flex-col ${isCurrent ? 'border-indigo-500/50' : 'border-zinc-800'}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-zinc-100 text-base">{plan.name}</CardTitle>
                      {isCurrent && <Badge className="bg-indigo-500/10 text-indigo-300">Current</Badge>}
                    </div>
                    <p className="text-xl font-bold font-mono text-zinc-100">
                      {plan.price === null ? 'Custom' : `${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(plan.price)}/mo`}
                    </p>
                    <CardDescription className="text-zinc-500 text-xs">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between gap-4">
                    <ul className="space-y-1.5">
                      {(plan.features || []).map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      <Button disabled variant="outline" className="w-full border-zinc-800 text-zinc-500">
                        Current Plan
                      </Button>
                    ) : pendingRequest ? (
                      <Button disabled variant="outline" className="w-full border-amber-900/50 text-amber-400">
                        <Clock className="h-4 w-4 mr-2" />
                        Requested
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleRequestUpgrade(plan.id)}
                        disabled={requestingPlanId === plan.id}
                        className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        {requestingPlanId === plan.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowUpCircle className="h-4 w-4 mr-2" />}
                        Request This Plan
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Outstanding Billings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
          <FileText className="h-5 w-5 text-amber-400" />
          Outstanding Billings
        </h3>
        
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-900">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Date</TableHead>
                <TableHead className="text-zinc-400">Description</TableHead>
                <TableHead className="text-zinc-400">Amount</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-right text-zinc-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outstandingInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                    No outstanding billings.
                  </TableCell>
                </TableRow>
              ) : (
                outstandingInvoices.sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((inv: any) => (
                  <TableRow key={inv.id} className="border-zinc-800 hover:bg-zinc-800/30">
                    <TableCell className="text-zinc-300">
                      {format(new Date(inv.created_at), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="text-zinc-100 font-medium">{inv.description}</TableCell>
                    <TableCell className="text-zinc-300">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(inv.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        inv.status === 'overdue' ? 'border-orange-500/40 text-orange-400 bg-orange-950/30 font-semibold' :
                        inv.status === 'pending' ? 'border-red-500/30 text-red-400 bg-red-950/20' :
                        inv.status === 'under_review' ? 'border-amber-500/30 text-amber-400 bg-amber-950/20' :
                        'border-zinc-500/30 text-zinc-400 bg-zinc-950/20'
                      }>
                        {inv.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(inv.status === 'pending' || inv.status === 'overdue') && (
                          <Button size="sm" onClick={() => openPayModal(inv)} className="bg-indigo-600 text-white hover:bg-indigo-700 h-8">
                            Pay Now
                          </Button>
                        )}
                        <Link href={`/billing/invoice/${inv.id}`}>
                          <Button variant="ghost" size="sm" className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30 h-8">
                            <Download className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Invoice History */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          Billing History
        </h3>
        
        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-900">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Date</TableHead>
                <TableHead className="text-zinc-400">Description</TableHead>
                <TableHead className="text-zinc-400">Amount</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-right text-zinc-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-zinc-500">
                    No billing history found.
                  </TableCell>
                </TableRow>
              ) : (
                historyInvoices.sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((inv: any) => (
                  <TableRow key={inv.id} className="border-zinc-800 hover:bg-zinc-800/30">
                    <TableCell className="text-zinc-300">
                      {format(new Date(inv.created_at), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="text-zinc-100 font-medium">{inv.description}</TableCell>
                    <TableCell className="text-zinc-300">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(inv.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        inv.status === 'paid' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' : 
                        'border-zinc-500/30 text-zinc-400 bg-zinc-950/20'
                      }>
                        {inv.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/billing/invoice/${inv.id}`}>
                          <Button variant="ghost" size="sm" className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30 h-8">
                            <Download className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>


      {/* Pay Invoice Modal */}
      <Dialog open={isPayModalOpen} onOpenChange={setIsPayModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
          <form onSubmit={handlePaymentSubmit}>
            <DialogHeader>
              <DialogTitle>Pay Invoice</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Upload your transfer receipt to settle this invoice. Once approved by admin, the payment will be automatically journaled to your General Ledger.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label className="text-zinc-300">Total Due</Label>
                <div className="text-xl font-bold text-indigo-400">
                  {selectedInvoice && new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(selectedInvoice.amount)}
                </div>
              </div>

              <div className="grid gap-2 mb-4">
                <Label className="text-zinc-300">Billed Outlet</Label>
                <div className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-zinc-400 cursor-not-allowed">
                  {outlets.find(o => o.id === selectedInvoice?.payment_outlet_id)?.name || "Unknown Outlet"}
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-zinc-300">Payment Account (Credit)</Label>
                <CoaCombobox
                  coas={assetCoas}
                  value={paymentAssetCoaId}
                  onChange={setPaymentAssetCoaId}
                  placeholder="e.g. BCA Bank"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-zinc-300">Expense Account (Debit)</Label>
                <CoaCombobox
                  coas={expenseCoas}
                  value={paymentExpenseCoaId}
                  onChange={setPaymentExpenseCoaId}
                  placeholder="e.g. Software Subscriptions"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-zinc-300">Bukti Transfer (Receipt)</Label>
                <Input 
                  type="file" 
                  accept="image/*,.pdf"
                  required
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setReceiptFile(e.target.files[0])
                    }
                  }}
                  className="bg-zinc-900 border-zinc-800 text-zinc-100 file:bg-zinc-800 file:text-zinc-100 file:border-0 file:mr-4 file:px-3 file:py-1 file:rounded-sm hover:file:bg-zinc-700" 
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsPayModalOpen(false)} className="text-zinc-400 hover:text-zinc-100">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white hover:bg-indigo-700">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                Submit Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
