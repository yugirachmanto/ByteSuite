'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { 
  Loader2, 
  Search, 
  CreditCard, 
  History, 
  Calendar,
  AlertCircle,
  ChevronRight,
  Filter
} from 'lucide-react'
import { toast } from 'sonner'
import { formatRp } from '@/lib/format'

export default function APDashboardPage() {
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<any[]>([])
  const [coa, setCoa] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [glApTotal, setGlApTotal] = useState(0)
  const [activeTab, setActiveTab] = useState<'outstanding' | 'paid'>('outstanding')

  // Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [selectedCoa, setSelectedCoa] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [referenceNo, setReferenceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!selectedOutletId) return
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()
      
      const currentOrgId = profile?.org_id
      setOrgId(currentOrgId)

      if (currentOrgId) {
        // Fetch All Posted Invoices for the SELECTED outlet
        const { data: invData } = await supabase
          .from('invoices')
          .select('*')
          .eq('outlet_id', selectedOutletId)
          .eq('status', 'posted')
          .order('invoice_date', { ascending: false })
        
        setInvoices(invData || [])

        // Fetch GL-based AP total (same logic as /accounting dashboard)
        const { data: glEntries } = await supabase
          .from('gl_entries')
          .select('debit, credit, chart_of_accounts (code)')
          .eq('outlet_id', selectedOutletId)
        
        let apSum = 0
        glEntries?.forEach((entry: any) => {
          const code = entry.chart_of_accounts?.code || ''
          if (code.startsWith('2-1-001')) {
            apSum += (entry.credit || 0) - (entry.debit || 0)
          }
        })
        setGlApTotal(apSum)

        // Fetch Cash/Bank accounts
        const { data: coaData } = await supabase
          .from('chart_of_accounts')
          .select('id, code, name')
          .eq('org_id', currentOrgId)
          .eq('is_active', true)
          .in('type', ['asset']) // Usually cash/bank are assets
          .order('code')
        
        setCoa(coaData || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [supabase, selectedOutletId])

  const openPaymentModal = (invoice: any) => {
    setSelectedInvoice(invoice)
    setPaymentAmount(invoice.grand_total - (invoice.paid_amount || 0))
    setPaymentModalOpen(true)
  }

  const openHistoryModal = async (invoice: any) => {
    setSelectedInvoice(invoice)
    setHistoryModalOpen(true)
    setLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from('ap_payments')
        .select('*, chart_of_accounts(name, code)')
        .eq('invoice_id', invoice.id)
        .order('payment_date', { ascending: false })
      
      if (error) throw error
      setPaymentHistory(data || [])
    } catch (err: any) {
      toast.error('Failed to load payment history')
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!paymentAmount || paymentAmount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (!selectedCoa) {
      toast.error('Please select a payment account')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('record_ap_payment', {
        p_invoice_id: selectedInvoice.id,
        p_org_id: orgId,
        p_outlet_id: selectedOutletId,
        p_payment_date: paymentDate,
        p_amount: paymentAmount,
        p_coa_id: selectedCoa,
        p_reference_no: referenceNo,
        p_notes: notes
      })

      if (error) throw error

      toast.success('Payment recorded successfully')
      setPaymentModalOpen(false)
      
      // Refresh invoices for the current outlet
      const { data: invData } = await supabase
        .from('invoices')
        .select('*')
        .eq('outlet_id', selectedOutletId)
        .eq('status', 'posted')
        .order('invoice_date', { ascending: false })
      setInvoices(invData || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = (inv.vendor || '').toLowerCase().includes(search.toLowerCase()) ||
                         (inv.invoice_no || '').toLowerCase().includes(search.toLowerCase())
    
    if (activeTab === 'outstanding') {
      return matchesSearch && (inv.payment_status !== 'paid')
    } else {
      return matchesSearch && (inv.payment_status === 'paid')
    }
  })

  const totalOutstanding = glApTotal

  if (loading) return <div className="flex h-48 items-center justify-center text-zinc-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading AP Dashboard...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Accounts Payable</h2>
          <p className="text-zinc-400 text-sm">Manage vendor debts and record payments.</p>
        </div>
        <div className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl backdrop-blur-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Total Outstanding</p>
            <p className="text-xl font-bold text-zinc-100 font-mono">{formatRp(totalOutstanding)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 w-fit">
          <button 
            onClick={() => setActiveTab('outstanding')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'outstanding' 
                ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Outstanding ({invoices.filter(i => i.payment_status !== 'paid').length})
          </button>
          <button 
            onClick={() => setActiveTab('paid')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'paid' 
                ? 'bg-zinc-800 text-zinc-100 shadow-sm' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Paid History ({invoices.filter(i => i.payment_status === 'paid').length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input 
              placeholder="Search vendor or invoice..." 
              className="pl-10 bg-zinc-950 border-zinc-800 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-zinc-900/50 border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Invoice</TableHead>
              <TableHead className="text-zinc-400">Vendor</TableHead>
              <TableHead className="text-zinc-400 text-right">Grand Total</TableHead>
              <TableHead className="text-zinc-400 text-right">Paid</TableHead>
              <TableHead className="text-zinc-400 text-right">Balance</TableHead>
              <TableHead className="text-zinc-400 text-center">Status</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-zinc-500 italic">
                  {activeTab === 'outstanding' ? 'No outstanding invoices found.' : 'No paid invoices found.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((inv) => {
                const balance = inv.grand_total - (inv.paid_amount || 0)
                return (
                  <TableRow key={inv.id} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors group">
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-zinc-100">{inv.invoice_no || 'No Number'}</p>
                        <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {inv.invoice_date}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-300 font-medium">{inv.vendor}</TableCell>
                    <TableCell className="text-right font-mono text-zinc-400">{formatRp(inv.grand_total)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400/80">{formatRp(inv.paid_amount || 0)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-zinc-100">{formatRp(balance)}</TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className={
                          inv.payment_status === 'paid'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : inv.payment_status === 'partial' 
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-800'
                        }
                      >
                        {inv.payment_status === 'paid' ? 'Paid' : inv.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-zinc-400 hover:text-blue-400"
                          onClick={() => openHistoryModal(inv)}
                          title="Payment History"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {inv.payment_status !== 'paid' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-400 hover:text-emerald-400"
                            onClick={() => openPaymentModal(inv)}
                            title="Record Payment"
                          >
                            <CreditCard className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Payment Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Record Payment</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Record a payment for {selectedInvoice?.vendor} - {selectedInvoice?.invoice_no}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg flex justify-between items-center">
              <span className="text-zinc-500 text-sm uppercase font-bold tracking-wider">Remaining Balance</span>
              <span className="text-xl font-bold text-zinc-100 font-mono">
                {formatRp(selectedInvoice ? selectedInvoice.grand_total - (selectedInvoice.paid_amount || 0) : 0)}
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Payment Amount</label>
              <Input 
                type="number" 
                value={paymentAmount} 
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="bg-zinc-900 border-zinc-800 h-10 font-mono text-lg text-emerald-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Payment Date</label>
                <Input 
                  type="date" 
                  value={paymentDate} 
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 h-10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-medium uppercase">Pay From (Cash/Bank)</label>
                <select 
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 h-10 text-sm text-zinc-100 focus:outline-none"
                  value={selectedCoa}
                  onChange={(e) => setSelectedCoa(e.target.value)}
                >
                  <option value="">Select Account...</option>
                  {coa.map(acc => <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-500 font-medium uppercase">Reference / Notes</label>
              <Input 
                placeholder="Check #, Transfer ID, etc."
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="bg-zinc-900 border-zinc-800 h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[120px]">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Payment History</DialogTitle>
            <DialogDescription className="text-zinc-400">
              History for {selectedInvoice?.vendor} - {selectedInvoice?.invoice_no}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingHistory ? (
              <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-600" /></div>
            ) : paymentHistory.length === 0 ? (
              <div className="text-center text-zinc-600 py-8 italic">No payments recorded for this invoice.</div>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                <Table>
                  <TableHeader className="bg-zinc-900/50 border-zinc-800">
                    <TableRow>
                      <TableHead className="text-zinc-500 text-[10px] uppercase font-bold">Date</TableHead>
                      <TableHead className="text-zinc-500 text-[10px] uppercase font-bold">Account</TableHead>
                      <TableHead className="text-zinc-500 text-[10px] uppercase font-bold">Ref</TableHead>
                      <TableHead className="text-zinc-500 text-[10px] uppercase font-bold text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentHistory.map((p) => (
                      <TableRow key={p.id} className="border-zinc-800">
                        <TableCell className="text-zinc-300">{p.payment_date}</TableCell>
                        <TableCell className="text-zinc-400 text-xs">
                          {p.chart_of_accounts?.code} - {p.chart_of_accounts?.name}
                        </TableCell>
                        <TableCell className="text-zinc-500 text-xs">{p.reference_no || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-400">{formatRp(p.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryModalOpen(false)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CheckCircle2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
