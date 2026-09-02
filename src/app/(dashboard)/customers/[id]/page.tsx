'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { formatRp } from '@/lib/format'

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const id = params?.id as string
  const isNew = id === 'new'

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    payment_terms_days: 30,
    credit_limit: '' as string | number,
  })

  const [invoices, setInvoices] = useState<any[]>([])

  useEffect(() => {
    if (!isNew) {
      fetchCustomer()
    }
  }, [id, isNew])

  const fetchCustomer = async () => {
    setLoading(true)
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !customer) {
      toast.error('Customer not found')
      router.push('/customers')
      return
    }

    setFormData({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      payment_terms_days: customer.payment_terms_days ?? 30,
      credit_limit: customer.credit_limit ?? '',
    })

    const { data: relatedInvoices } = await supabase
      .from('customer_invoices')
      .select('id, invoice_no, invoice_date, grand_total, payment_status')
      .eq('customer_id', id)
      .order('invoice_date', { ascending: false })

    setInvoices(relatedInvoices || [])

    setLoading(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id: fieldId, value } = e.target
    setFormData(prev => ({ ...prev, [fieldId]: value }))
  }

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Customer name is required')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user?.id)
      .single()

    if (!profile?.org_id) {
      toast.error('Organization not found')
      setSaving(false)
      return
    }

    const payload = {
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      payment_terms_days: parseInt(formData.payment_terms_days as any) || 30,
      credit_limit: formData.credit_limit === '' ? null : parseFloat(formData.credit_limit as any),
    }

    try {
      if (isNew) {
        const { error } = await supabase.from('customers').insert({
          ...payload,
          org_id: profile.org_id
        })
        if (error) throw error
        toast.success('Customer created')
        router.push('/customers')
      } else {
        const { error } = await supabase.from('customers').update(payload).eq('id', id)
        if (error) throw error
        toast.success('Customer updated')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save customer')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading customer...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/customers')} className="text-zinc-400">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
            {isNew ? 'New Customer' : formData.name}
          </h2>
          <p className="text-sm text-zinc-400">Manage customer details and credit terms</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="text-zinc-100 text-lg">General Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-zinc-300">Customer Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100"
                  placeholder="PT Contoh Sejahtera"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-zinc-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                    placeholder="contact@customer.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-zinc-300">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                    placeholder="+62 812..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address" className="text-zinc-300">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="text-zinc-100 text-lg">Credit Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment_terms_days" className="text-zinc-300">Payment Terms (days)</Label>
                  <Input
                    id="payment_terms_days"
                    type="number"
                    min={0}
                    value={formData.payment_terms_days}
                    onChange={handleChange}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                    placeholder="30"
                  />
                  <p className="text-xs text-zinc-500">Used to default the due date on new invoices for this customer.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credit_limit" className="text-zinc-300">Credit Limit (Optional)</Label>
                  <Input
                    id="credit_limit"
                    type="number"
                    min={0}
                    value={formData.credit_limit}
                    onChange={handleChange}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                    placeholder="e.g. 5000000"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Customer
            </Button>
          </div>
        </div>

        {!isNew && (
          <div className="md:col-span-1">
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="text-zinc-100 text-lg">Recent Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-sm text-zinc-500 italic">No invoices linked yet.</p>
                ) : (
                  <div className="space-y-4">
                    {invoices.map(inv => (
                      <div key={inv.id} className="flex justify-between items-center border-b border-zinc-800/50 pb-2 last:border-0 last:pb-0">
                        <div>
                          <Link href={`/accounting/ar/${inv.id}`} className="text-sm font-medium text-indigo-400 hover:underline">
                            {inv.invoice_no || 'Unnumbered'}
                          </Link>
                          <p className="text-xs text-zinc-500">{new Date(inv.invoice_date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-sm text-zinc-300 font-medium">
                          {formatRp(inv.grand_total || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
