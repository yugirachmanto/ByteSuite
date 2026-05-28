'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Search, Building2, ChevronRight, Loader2 } from 'lucide-react'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchVendors()
  }, [])

  const fetchVendors = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (profile?.org_id) {
      let query = supabase
        .from('vendors')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('name', { ascending: true })
      
      const { data } = await query
      setVendors(data || [])
    }
    setLoading(false)
  }

  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(search.toLowerCase()) || 
    (v.email && v.email.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Vendors</h2>
          <p className="text-sm text-zinc-400">Manage your suppliers and their bank details.</p>
        </div>
        <Button onClick={() => router.push('/vendors/new')} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Plus className="mr-2 h-4 w-4" />
          Add Vendor
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input 
            placeholder="Search vendors..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900/50 border-zinc-800 text-zinc-100"
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <Table>
          <TableHeader className="bg-zinc-900/80 border-b border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Contact</TableHead>
              <TableHead className="text-zinc-400">Bank Details</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 opacity-50" />
                  Loading vendors...
                </TableCell>
              </TableRow>
            ) : filteredVendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-zinc-500">
                  <Building2 className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  No vendors found.
                </TableCell>
              </TableRow>
            ) : (
              filteredVendors.map((vendor) => (
                <TableRow 
                  key={vendor.id} 
                  className="border-zinc-800 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/vendors/${vendor.id}`)}
                >
                  <TableCell className="font-medium text-zinc-200">
                    {vendor.name}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-zinc-300">{vendor.email || '-'}</div>
                    <div className="text-xs text-zinc-500">{vendor.phone || ''}</div>
                  </TableCell>
                  <TableCell>
                    {vendor.bank_name ? (
                      <div>
                        <div className="text-sm text-zinc-300">{vendor.bank_name}</div>
                        <div className="text-xs text-zinc-500">{vendor.bank_account_no} {vendor.bank_account_name ? `(${vendor.bank_account_name})` : ''}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600 italic">Not provided</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-zinc-600" />
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
