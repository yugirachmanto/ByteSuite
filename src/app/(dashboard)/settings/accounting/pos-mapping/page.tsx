'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Save, Store, CreditCard, Layers, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { CoaCombobox } from '@/components/ui/coa-combobox'

interface CoaAccount {
  id: string
  code: string
  name: string
  type: string
  is_header: boolean
}

interface Outlet {
  id: string
  name: string
}

interface PosCoaMapping {
  id?: string
  outlet_id: string | null // null = organization default
  pos_category: string
  revenue_coa_id: string
  cogs_coa_id: string | null
  /** Category found on products but not mapped yet (UI only, not stored). */
  suggested?: boolean
}

interface PosPaymentMapping {
  id?: string
  outlet_id: string | null // null = organization default
  payment_method: string
  coa_id: string
  is_settlement_lag: boolean
  settlement_days: number
  is_pos_visible: boolean
}

export default function PosMappingSettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  
  const [accounts, setAccounts] = useState<CoaAccount[]>([])
  const [outlets, setOutlets] = useState<Outlet[]>([])
  
  const [coaMappings, setCoaMappings] = useState<PosCoaMapping[]>([])
  const [paymentMappings, setPaymentMappings] = useState<PosPaymentMapping[]>([])
  const [pendingGlCount, setPendingGlCount] = useState(0)
  const [reposting, setReposting] = useState(false)

  const outletLabel = (outletId: string | null) =>
    outletId ? outlets.find(o => o.id === outletId)?.name || 'Outlet' : 'Org Default (All)'

  const fetchPendingGlCount = async (currentOrgId: string) => {
    const { count } = await supabase
      .from('pos_orders')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', currentOrgId)
      .eq('gl_status', 'pending_mapping')
    setPendingGlCount(count || 0)
  }

  const handleRepost = async () => {
    if (!orgId) return
    setReposting(true)
    try {
      const { data, error } = await supabase.rpc('repost_pending_pos_gl', { p_org_id: orgId })
      if (error) throw error
      await fetchPendingGlCount(orgId)
      toast.success(`${data} penjualan berhasil diposting ke GL.`)
    } catch (error: any) {
      toast.error(error.message || 'Gagal memposting ulang GL')
    } finally {
      setReposting(false)
    }
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
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
          fetchPendingGlCount(currentOrgId)
          // Fetch COA (Active)
          const { data: coaData } = await supabase
            .from('chart_of_accounts')
            .select('id, code, name, type, is_header')
            .eq('org_id', currentOrgId)
            .eq('is_active', true)
            .order('code')
          setAccounts(coaData || [])

          // Fetch Outlets
          const { data: outletsData } = await supabase
            .from('outlets')
            .select('id, name')
            .eq('org_id', currentOrgId)
            .order('name')
          setOutlets(outletsData || [])

          // Fetch POS COA Mappings
          const { data: coaMapData } = await supabase
            .from('pos_coa_mapping')
            .select('id, outlet_id, pos_category, revenue_coa_id, cogs_coa_id')
            .eq('org_id', currentOrgId)
            .order('pos_category')
          // Categories already used on products become rows automatically, so
          // only the accounts have to be picked.
          const { data: catData } = await supabase
            .from('item_master')
            .select('pos_category')
            .eq('org_id', currentOrgId)
            .eq('category', 'finished')
          const productCategories = Array.from(new Set((catData || []).map((r: any) => (r.pos_category || '').trim() || 'Uncategorized'))).sort()
          const mappedDefaults = new Set((coaMapData || []).filter((m: any) => !m.outlet_id).map((m: any) => m.pos_category.toLowerCase()))
          const suggestions: PosCoaMapping[] = productCategories
            .filter(c => !mappedDefaults.has(c.toLowerCase()))
            .map(c => ({ outlet_id: null, pos_category: c, revenue_coa_id: '', cogs_coa_id: null, suggested: true }))
          setCoaMappings([...(coaMapData || []), ...suggestions])

          // Fetch POS Payment Mappings
          const { data: payMapData } = await supabase
            .from('pos_payment_method_mapping')
            .select('id, outlet_id, payment_method, coa_id, is_settlement_lag, settlement_days, is_pos_visible')
            .eq('org_id', currentOrgId)
            .order('payment_method')
          setPaymentMappings(payMapData || [])
        }
      } catch (err: any) {
        toast.error('Failed to load configuration data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [supabase])

  const handleSaveCoaMappings = async () => {
    if (!orgId) return
    setSaving(true)
    try {
      // Suggested categories the user did not map are simply not saved.
      const toSave = coaMappings.filter(m => !(m.suggested && !m.revenue_coa_id))

      // Basic client-side validation
      const invalid = toSave.some(m => !m.pos_category.trim() || !m.revenue_coa_id)
      if (invalid) {
        toast.error('Please specify both Category and Revenue Account for all mapping rows')
        setSaving(false)
        return
      }

      // Check duplicates for same Category + Outlet combination
      const seen = new Set<string>()
      for (const m of toSave) {
        const key = `${m.pos_category.toLowerCase()}-${m.outlet_id || 'default'}`
        if (seen.has(key)) {
          toast.error(`Duplicate mapping found for category "${m.pos_category}" and specified outlet. Each category-outlet pair must be unique.`)
          setSaving(false)
          return
        }
        seen.add(key)
      }

      // Deleting all existing mappings for this org
      await supabase.from('pos_coa_mapping').delete().eq('org_id', orgId)

      // Inserting new mappings
      if (toSave.length > 0) {
        const { error } = await supabase.from('pos_coa_mapping').insert(
          toSave.map(m => ({
            org_id: orgId,
            outlet_id: m.outlet_id || null,
            pos_category: m.pos_category.trim(),
            revenue_coa_id: m.revenue_coa_id,
            cogs_coa_id: m.cogs_coa_id || null
          }))
        )
        if (error) throw error
      }

      toast.success('POS category mappings updated successfully')
      
      // Refresh data to populate new DB ids
      const { data: coaMapData } = await supabase
        .from('pos_coa_mapping')
        .select('id, outlet_id, pos_category, revenue_coa_id, cogs_coa_id')
        .eq('org_id', orgId)
        .order('pos_category')
      const savedDefaults = new Set((coaMapData || []).filter((m: any) => !m.outlet_id).map((m: any) => m.pos_category.toLowerCase()))
      const stillSuggested = coaMappings.filter(m => m.suggested && !m.revenue_coa_id && !savedDefaults.has(m.pos_category.toLowerCase()))
      setCoaMappings([...(coaMapData || []), ...stillSuggested])
    } catch (error: any) {
      toast.error(error.message || 'Failed to save category mappings')
    } finally {
      setSaving(false)
    }
  }

  const handleSavePaymentMappings = async () => {
    if (!orgId) return
    setSaving(true)
    try {
      // Basic validation — the COA account is optional: a method with no
      // account mapped can still show up as a POS tender, it just won't
      // post to the GL until an account is set (same "pending_mapping"
      // gap-tolerant behavior already used elsewhere in POS).
      const invalid = paymentMappings.some(m => !m.payment_method.trim())
      if (invalid) {
        toast.error('Please specify a Payment Method name for all rows')
        setSaving(false)
        return
      }

      // Check duplicates for same Payment Method + Outlet combination
      const seen = new Set<string>()
      for (const m of paymentMappings) {
        const key = `${m.payment_method.toLowerCase()}-${m.outlet_id || 'default'}`
        if (seen.has(key)) {
          toast.error(`Duplicate mapping found for payment method "${m.payment_method}" and specified outlet.`)
          setSaving(false)
          return
        }
        seen.add(key)
      }

      // Deleting existing
      await supabase.from('pos_payment_method_mapping').delete().eq('org_id', orgId)

      // Inserting
      if (paymentMappings.length > 0) {
        const { error } = await supabase.from('pos_payment_method_mapping').insert(
          paymentMappings.map(m => ({
            org_id: orgId,
            outlet_id: m.outlet_id || null,
            payment_method: m.payment_method.trim(),
            coa_id: m.coa_id,
            is_settlement_lag: m.is_settlement_lag,
            settlement_days: m.is_settlement_lag ? m.settlement_days : 0,
            is_pos_visible: m.is_pos_visible
          }))
        )
        if (error) throw error
      }

      toast.success('POS payment mappings updated successfully')
      
      // Refresh
      const { data: payMapData } = await supabase
        .from('pos_payment_method_mapping')
        .select('id, outlet_id, payment_method, coa_id, is_settlement_lag, settlement_days, is_pos_visible')
        .eq('org_id', orgId)
        .order('payment_method')
      setPaymentMappings(payMapData || [])
    } catch (error: any) {
      toast.error(error.message || 'Failed to save payment mappings')
    } finally {
      setSaving(false)
    }
  }

  // --- Category Handlers ---
  const addCoaMapping = () => {
    setCoaMappings([...coaMappings, { outlet_id: null, pos_category: '', revenue_coa_id: '', cogs_coa_id: null }])
  }

  const removeCoaMapping = (idx: number) => {
    setCoaMappings(coaMappings.filter((_, i) => i !== idx))
  }

  const updateCoaMapping = (idx: number, field: keyof PosCoaMapping, value: any) => {
    const updated = [...coaMappings]
    updated[idx] = { ...updated[idx], [field]: value }
    setCoaMappings(updated)
  }

  // --- Payment Handlers ---
  const addPaymentMapping = () => {
    setPaymentMappings([...paymentMappings, { outlet_id: null, payment_method: '', coa_id: '', is_settlement_lag: false, settlement_days: 1, is_pos_visible: true }])
  }

  const removePaymentMapping = (idx: number) => {
    setPaymentMappings(paymentMappings.filter((_, i) => i !== idx))
  }

  const updatePaymentMapping = (idx: number, field: keyof PosPaymentMapping, value: any) => {
    const updated = [...paymentMappings]
    updated[idx] = { ...updated[idx], [field]: value }
    setPaymentMappings(updated)
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2 opacity-30" />
        Loading mappings...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {pendingGlCount > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-300">
                {pendingGlCount} penjualan POS belum terposting ke jurnal (GL)
              </p>
              <p className="text-xs text-amber-400/70">
                Mapping akun di bawah belum lengkap saat penjualan terjadi — stok &amp; penjualan sudah tercatat, tapi jurnal akuntansinya menunggu. Lengkapi mapping lalu klik tombol ini.
              </p>
            </div>
          </div>
          <Button
            onClick={handleRepost}
            disabled={reposting}
            className="bg-amber-600 hover:bg-amber-500 text-white gap-2 shrink-0"
          >
            {reposting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Post Ulang Sekarang
          </Button>
        </div>
      )}

      <Tabs defaultValue="categories" className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="categories" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 gap-2">
              <Layers className="h-4 w-4" /> Category Mappings
            </TabsTrigger>
            <TabsTrigger value="payments" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 gap-2">
              <CreditCard className="h-4 w-4" /> Payment Mappings
            </TabsTrigger>
          </TabsList>
        </div>

        {/* --- CATEGORIES MAPPING TAB --- */}
        <TabsContent value="categories" className="space-y-4 outline-none">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-zinc-100">POS Category to COA Mappings</CardTitle>
                <CardDescription className="text-zinc-400">
                  Map POS categories (e.g. Makanan, Minuman) to income and optionally COGS accounts. Overrides are prioritized by outlet.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" onClick={addCoaMapping}>
                  <Plus className="mr-2 h-4 w-4" /> Add Row
                </Button>
                <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleSaveCoaMappings} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent border-zinc-800">
                    <TableHead className="text-zinc-400 w-[200px]">Outlet Scope</TableHead>
                    <TableHead className="text-zinc-400 w-[220px]">POS Category</TableHead>
                    <TableHead className="text-zinc-400">Revenue Account (Credit)</TableHead>
                    <TableHead className="text-zinc-400">COGS Account (Debit, Optional)</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coaMappings.map((mapping, idx) => (
                    <TableRow key={idx} className="border-zinc-800 hover:bg-zinc-850/20">
                      {/* Outlet Scope */}
                      <TableCell>
                        <Select 
                          value={mapping.outlet_id || 'default'} 
                          onValueChange={(val) => updateCoaMapping(idx, 'outlet_id', val === 'default' ? null : val)}
                        >
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200">
                            <SelectValue>{outletLabel(mapping.outlet_id)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            <SelectItem value="default">
                              <span className="flex items-center gap-1.5 text-zinc-400">
                                <Store className="h-3.5 w-3.5 opacity-50" /> Org Default (All)
                              </span>
                            </SelectItem>
                            {outlets.map(o => (
                              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Category Name */}
                      <TableCell>
                        <Input 
                          placeholder="e.g. Makanan, Minuman, Merchandise"
                          className="bg-zinc-950 border-zinc-800 text-zinc-100 font-medium" 
                          value={mapping.pos_category}
                          onChange={(e) => updateCoaMapping(idx, 'pos_category', e.target.value)}
                        />
                        {mapping.suggested && <p className="mt-1 text-[10px] text-amber-400">Dari produk - pilih akun untuk memetakan</p>}
                      </TableCell>

                      {/* Revenue Account Selector */}
                      <TableCell>
                        <CoaCombobox
                          coas={accounts}
                          value={mapping.revenue_coa_id}
                          onChange={(val) => updateCoaMapping(idx, 'revenue_coa_id', val)}
                          placeholder="Select Revenue Account..."
                          typeFilter="income"
                          className="bg-zinc-950 border-zinc-800 text-zinc-100"
                        />
                      </TableCell>

                      {/* COGS Account Selector */}
                      <TableCell>
                        <CoaCombobox
                          coas={accounts}
                          value={mapping.cogs_coa_id || ''}
                          onChange={(val) => updateCoaMapping(idx, 'cogs_coa_id', val || null)}
                          placeholder="No COGS tracking"
                          typeFilter="expense"
                          className="bg-zinc-950 border-zinc-800 text-zinc-100"
                        />
                      </TableCell>

                      {/* Remove Row */}
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-zinc-500 hover:text-red-400 hover:bg-zinc-800/50" 
                          onClick={() => removeCoaMapping(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {coaMappings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-zinc-500 py-10">
                        <Layers className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        No category mappings configured. Add a row to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- PAYMENT MAPPINGS TAB --- */}
        <TabsContent value="payments" className="space-y-4 outline-none">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-zinc-100">POS Payment Method to COA Mappings</CardTitle>
                <CardDescription className="text-zinc-400">
                  Map POS payment methods (e.g. Cash, Card, GoPay, OVO) to Kas/Bank or Receivables accounts. Define clearing delay rules if applicable, and toggle which methods actually appear as tender buttons at the POS terminal.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" onClick={addPaymentMapping}>
                  <Plus className="mr-2 h-4 w-4" /> Add Row
                </Button>
                <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleSavePaymentMappings} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader className="border-zinc-800">
                  <TableRow className="hover:bg-transparent border-zinc-800">
                    <TableHead className="text-zinc-400 w-[180px]">Outlet Scope</TableHead>
                    <TableHead className="text-zinc-400 w-[180px]">Payment Method</TableHead>
                    <TableHead className="text-zinc-400">Clearing/Target Account (Debit)</TableHead>
                    <TableHead className="text-zinc-400 w-[130px]">Settlement Delay</TableHead>
                    <TableHead className="text-zinc-400 w-[140px]">Delay (Days)</TableHead>
                    <TableHead className="text-zinc-400 w-[130px]">Tampil di POS</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentMappings.map((mapping, idx) => (
                    <TableRow key={idx} className="border-zinc-800 hover:bg-zinc-850/20">
                      {/* Outlet Scope */}
                      <TableCell>
                        <Select 
                          value={mapping.outlet_id || 'default'} 
                          onValueChange={(val) => updatePaymentMapping(idx, 'outlet_id', val === 'default' ? null : val)}
                        >
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200">
                            <SelectValue>{outletLabel(mapping.outlet_id)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            <SelectItem value="default">
                              <span className="flex items-center gap-1.5 text-zinc-400">
                                <Store className="h-3.5 w-3.5 opacity-50" /> Org Default (All)
                              </span>
                            </SelectItem>
                            {outlets.map(o => (
                              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Payment Method Name */}
                      <TableCell>
                        <Input 
                          placeholder="e.g. Cash, Debit Card, GoPay, OVO, ShopeePay"
                          className="bg-zinc-950 border-zinc-800 text-zinc-100 font-medium" 
                          value={mapping.payment_method}
                          onChange={(e) => updatePaymentMapping(idx, 'payment_method', e.target.value)}
                        />
                      </TableCell>

                      {/* Clearing Account Selector */}
                      <TableCell>
                        <CoaCombobox
                          coas={accounts}
                          value={mapping.coa_id}
                          onChange={(val) => updatePaymentMapping(idx, 'coa_id', val)}
                          placeholder="Select Clearing Account..."
                          typeFilter={['asset', 'liability']}
                          className="bg-zinc-950 border-zinc-800 text-zinc-100"
                        />
                      </TableCell>

                      {/* Settlement Delay Flag */}
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={mapping.is_settlement_lag}
                            onCheckedChange={(val) => updatePaymentMapping(idx, 'is_settlement_lag', val)}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                          <Badge variant="outline" className={mapping.is_settlement_lag ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5 text-[10px]" : "border-zinc-800 text-zinc-500 text-[10px]"}>
                            {mapping.is_settlement_lag ? 'Lag' : 'Instant'}
                          </Badge>
                        </div>
                      </TableCell>

                      {/* Settlement Days */}
                      <TableCell>
                        <Input 
                          type="number" 
                          min={0}
                          disabled={!mapping.is_settlement_lag}
                          className="bg-zinc-950 border-zinc-800 text-zinc-100 w-24 disabled:opacity-40 disabled:cursor-not-allowed" 
                          value={mapping.settlement_days}
                          onChange={(e) => updatePaymentMapping(idx, 'settlement_days', parseInt(e.target.value) || 0)}
                        />
                      </TableCell>

                      {/* POS Visibility Toggle */}
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={mapping.is_pos_visible}
                            onCheckedChange={(val) => updatePaymentMapping(idx, 'is_pos_visible', val)}
                            className="data-[state=checked]:bg-indigo-500"
                          />
                          <Badge variant="outline" className={mapping.is_pos_visible ? "border-indigo-500/30 text-indigo-400 bg-indigo-500/5 text-[10px]" : "border-zinc-800 text-zinc-500 text-[10px]"}>
                            {mapping.is_pos_visible ? 'Tampil' : 'Sembunyi'}
                          </Badge>
                        </div>
                      </TableCell>

                      {/* Remove Row */}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-zinc-500 hover:text-red-400 hover:bg-zinc-800/50"
                          onClick={() => removePaymentMapping(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paymentMappings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-zinc-500 py-10">
                        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        No payment method mappings configured. Add a row to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
