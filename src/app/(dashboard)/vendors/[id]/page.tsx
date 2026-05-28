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

export default function VendorDetailPage() {
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
    bank_name: '',
    bank_account_no: '',
    bank_account_name: ''
  })
  
  const [invoices, setInvoices] = useState<any[]>([])

  useEffect(() => {
    if (!isNew) {
      fetchVendor()
    }
  }, [id, isNew])

  const fetchVendor = async () => {
    setLoading(true)
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !vendor) {
      toast.error('Vendor not found')
      router.push('/vendors')
      return
    }

    setFormData({
      name: vendor.name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      bank_name: vendor.bank_name || '',
      bank_account_no: vendor.bank_account_no || '',
      bank_account_name: vendor.bank_account_name || ''
    })

    // Fetch related invoices
    const { data: relatedInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_no, invoice_date, grand_total, status')
      .eq('vendor_id', id)
      .order('invoice_date', { ascending: false })
      
    setInvoices(relatedInvoices || [])
    
    setLoading(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }))
  }

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Vendor name is required')
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

    try {
      if (isNew) {
        const { error } = await supabase.from('vendors').insert({
          ...formData,
          org_id: profile.org_id
        })
        if (error) throw error
        toast.success('Vendor created')
        router.push('/vendors')
      } else {
        const { error } = await supabase.from('vendors').update(formData).eq('id', id)
        if (error) throw error
        toast.success('Vendor updated')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save vendor')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading vendor...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/vendors')} className="text-zinc-400">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
            {isNew ? 'New Vendor' : formData.name}
          </h2>
          <p className="text-sm text-zinc-400">Manage vendor details and bank information</p>
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
                <Label htmlFor="name" className="text-zinc-300">Vendor Name *</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={handleChange} 
                  className="bg-zinc-950 border-zinc-800 text-zinc-100" 
                  placeholder="Acme Corp" 
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
                    placeholder="contact@acme.com" 
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
              <CardTitle className="text-zinc-100 text-lg">Bank Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bank_name" className="text-zinc-300">Bank Name</Label>
                <Input 
                  id="bank_name" 
                  value={formData.bank_name} 
                  onChange={handleChange} 
                  className="bg-zinc-950 border-zinc-800 text-zinc-100" 
                  placeholder="BCA, Mandiri, etc." 
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bank_account_no" className="text-zinc-300">Account Number</Label>
                  <Input 
                    id="bank_account_no" 
                    value={formData.bank_account_no} 
                    onChange={handleChange} 
                    className="bg-zinc-950 border-zinc-800 text-zinc-100" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank_account_name" className="text-zinc-300">Account Name</Label>
                  <Input 
                    id="bank_account_name" 
                    value={formData.bank_account_name} 
                    onChange={handleChange} 
                    className="bg-zinc-950 border-zinc-800 text-zinc-100" 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Vendor
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
                          <Link href={`/invoices/${inv.id}/review`} className="text-sm font-medium text-indigo-400 hover:underline">
                            {inv.invoice_no || 'Unnumbered'}
                          </Link>
                          <p className="text-xs text-zinc-500">{new Date(inv.invoice_date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-sm text-zinc-300 font-medium">
                          {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(inv.grand_total || 0)}
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
