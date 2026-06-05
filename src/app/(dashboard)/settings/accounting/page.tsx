'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CoaCombobox } from '@/components/ui/coa-combobox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Save, Upload, QrCode, X, Building2 } from 'lucide-react'
import { toast } from 'sonner'

interface CoaAccount {
  id: string
  code: string
  name: string
}

interface CoaMapping {
  id?: string
  account_role: string
  coa_id: string
}

interface PphRule {
  id?: string
  pasal: string
  service_keyword: string[]
  rate_percent: number
  coa_role: string
}

const SYSTEM_ROLES = [
  { value: 'accounts_payable', label: 'Accounts Payable' },
  { value: 'ppn_masukan', label: 'PPN Masukan (Input Tax)' },
  { value: 'ppn_keluaran', label: 'PPN Keluaran (Output Tax)' },
  { value: 'freight_expense', label: 'Freight/Transport Expense' },
  { value: 'pph23_payable', label: 'PPH 23 Payable' },
  { value: 'pph4ayat2_payable', label: 'PPH 4(2) Payable' }
]

export default function AccountingSettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  
  const [accounts, setAccounts] = useState<CoaAccount[]>([])
  const [mappings, setMappings] = useState<CoaMapping[]>([])
  const [pphRules, setPphRules] = useState<PphRule[]>([])
  const [posTaxRate, setPosTaxRate] = useState<number>(0)
  const [qrisImageUrl, setQrisImageUrl] = useState('')
  const [uploadingQris, setUploadingQris] = useState(false)
  const [bankName, setBankName] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [bankAccountHolder, setBankAccountHolder] = useState('')

  useEffect(() => {
    async function fetchData() {
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
        // Fetch org settings (POS tax rate)
        const { data: orgData } = await supabase
          .from('organizations')
          .select('pos_tax_rate, qris_image_url, bank_name, bank_account_number, bank_account_holder')
          .eq('id', currentOrgId)
          .single()
        
        if (orgData) {
          setPosTaxRate(orgData.pos_tax_rate || 0)
          setQrisImageUrl(orgData.qris_image_url || '')
          setBankName(orgData.bank_name || '')
          setBankAccountNumber(orgData.bank_account_number || '')
          setBankAccountHolder(orgData.bank_account_holder || '')
        }

        // Fetch COA
        const { data: coaData } = await supabase
          .from('chart_of_accounts')
          .select('id, code, name')
          .eq('org_id', currentOrgId)
          .order('code')
        setAccounts(coaData || [])

        // Fetch Mappings
        const { data: mappingsData } = await supabase
          .from('default_coa_mappings')
          .select('id, account_role, coa_id')
          .eq('org_id', currentOrgId)
        setMappings(mappingsData || [])

        // Fetch PPH Rules
        const { data: pphData } = await supabase
          .from('pph_rules')
          .select('id, pasal, service_keyword, rate_percent, coa_role')
          .eq('org_id', currentOrgId)
        setPphRules(pphData || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  const handleSaveSettings = async () => {
    if (!orgId) return
    setSaving(true)
    try {
      // Clear existing mappings
      await supabase.from('default_coa_mappings').delete().eq('org_id', orgId)
      
      // Insert new mappings
      const validMappings = mappings.filter(m => m.coa_id && m.account_role)
      if (validMappings.length > 0) {
        const { error } = await supabase.from('default_coa_mappings').insert(
          validMappings.map(m => ({
            org_id: orgId,
            account_role: m.account_role,
            coa_id: m.coa_id
          }))
        )
        if (error) throw error
      }

      // Update POS tax rate
      const { error: orgError } = await supabase
        .from('organizations')
        .update({ 
          pos_tax_rate: posTaxRate, 
          qris_image_url: qrisImageUrl || null,
          bank_name: bankName || null,
          bank_account_number: bankAccountNumber || null,
          bank_account_holder: bankAccountHolder || null
        })
        .eq('id', orgId)
      if (orgError) throw orgError

      toast.success('System settings updated')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSavePphRules = async () => {
    if (!orgId) return
    setSaving(true)
    try {
      // Clear existing rules
      await supabase.from('pph_rules').delete().eq('org_id', orgId)
      
      const validRules = pphRules.filter(r => r.pasal && r.rate_percent && r.coa_role)
      if (validRules.length > 0) {
        const { error } = await supabase.from('pph_rules').insert(
          validRules.map(r => ({
            org_id: orgId,
            pasal: r.pasal,
            service_keyword: typeof r.service_keyword === 'string' ? (r.service_keyword as string).split(',').map(s => s.trim()) : r.service_keyword,
            rate_percent: parseFloat(r.rate_percent.toString()),
            coa_role: r.coa_role
          }))
        )
        if (error) throw error
      }
      toast.success('Tax rules updated')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save tax rules')
    } finally {
      setSaving(false)
    }
  }

  const updateMapping = (role: string, coaId: string) => {
    setMappings(prev => {
      const existing = prev.find(m => m.account_role === role)
      if (existing) {
        return prev.map(m => m.account_role === role ? { ...m, coa_id: coaId } : m)
      }
      return [...prev, { account_role: role, coa_id: coaId }]
    })
  }

  const addPphRule = () => {
    setPphRules([...pphRules, { pasal: '23', service_keyword: [], rate_percent: 2, coa_role: 'pph23_payable' }])
  }

  const removePphRule = (index: number) => {
    setPphRules(pphRules.filter((_, i) => i !== index))
  }

  const updatePphRule = (index: number, field: keyof PphRule, value: any) => {
    const updated = [...pphRules]
    updated[index] = { ...updated[index], [field]: value }
    setPphRules(updated)
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2 opacity-30" />
        Loading settings...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-zinc-100">System Accounts & Preferences</CardTitle>
            <CardDescription className="text-zinc-400">Map specific roles to your chart of accounts and configure global settings like POS tax.</CardDescription>
          </div>
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleSaveSettings} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Settings
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center border-b border-zinc-800/50 pb-4">
            <div>
              <Label className="text-zinc-200">POS Tax Rate (%)</Label>
              <p className="text-xs text-zinc-500 mt-1">Default tax rate applied to Point of Sale transactions.</p>
            </div>
            <Input 
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="bg-zinc-950 border-zinc-800 text-zinc-100"
              value={posTaxRate}
              onChange={(e) => setPosTaxRate(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start border-b border-zinc-800/50 pb-4">
            <div>
              <Label className="text-zinc-200 flex items-center gap-2">
                <QrCode className="h-4 w-4" /> QRIS Image
              </Label>
              <p className="text-xs text-zinc-500 mt-1">Upload your QRIS QR code image. This will be displayed on the Customer Facing Display when QRIS is selected as payment method.</p>
            </div>
            <div className="space-y-3">
              {qrisImageUrl ? (
                <div className="relative group">
                  <div className="bg-white p-3 rounded-lg w-fit">
                    <img src={qrisImageUrl} alt="QRIS Code" className="w-32 h-32 object-contain" />
                  </div>
                  <button
                    onClick={() => setQrisImageUrl('')}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
              <label className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-lg px-4 py-2.5 cursor-pointer transition-colors w-fit">
                {uploadingQris ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <Upload className="h-4 w-4 text-zinc-400" />}
                <span className="text-sm text-zinc-300">{qrisImageUrl ? 'Replace Image' : 'Upload QRIS Image'}</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  disabled={uploadingQris}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setUploadingQris(true)
                    try {
                      const fileExt = file.name.split('.').pop()
                      const fileName = `qris-${orgId}-${Date.now()}.${fileExt}`
                      const { error: uploadError } = await supabase.storage
                        .from('product-images')
                        .upload(fileName, file)
                      if (uploadError) throw uploadError
                      const { data: { publicUrl } } = supabase.storage
                        .from('product-images')
                        .getPublicUrl(fileName)
                      setQrisImageUrl(publicUrl)
                      toast.success('QRIS image uploaded. Click Save Settings to apply.')
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to upload QRIS image')
                    } finally {
                      setUploadingQris(false)
                    }
                  }}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start border-b border-zinc-800/50 pb-4">
            <div>
              <Label className="text-zinc-200 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Bank Transfer Details
              </Label>
              <p className="text-xs text-zinc-500 mt-1">Set your bank account info. This will be displayed on the Customer Facing Display when Bank Transfer is selected as payment method.</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">Bank Name</Label>
                <Input 
                  placeholder="e.g. BCA, Mandiri, BRI"
                  className="bg-zinc-950 border-zinc-800 text-zinc-100"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">Account Number</Label>
                <Input 
                  placeholder="e.g. 1234567890"
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">Account Holder Name</Label>
                <Input 
                  placeholder="e.g. PT Contoh Usaha"
                  className="bg-zinc-950 border-zinc-800 text-zinc-100"
                  value={bankAccountHolder}
                  onChange={(e) => setBankAccountHolder(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-zinc-200">Account Mappings</h3>
            {SYSTEM_ROLES.map(role => {
              const currentVal = mappings.find(m => m.account_role === role.value)?.coa_id || ''
              return (
                <div key={role.value} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center border-b border-zinc-800/50 pb-4 last:border-0 last:pb-0">
                  <div>
                    <Label className="text-zinc-200">{role.label}</Label>
                    <p className="text-xs text-zinc-500 mt-1">Used for automatic posting of {role.label.toLowerCase()}.</p>
                  </div>
                  <CoaCombobox
                    coas={accounts}
                    value={currentVal || ""}
                    onChange={(val) => updateMapping(role.value, val)}
                    placeholder="Select Account..."
                  />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-zinc-100">Withholding Tax Rules (PPH)</CardTitle>
            <CardDescription className="text-zinc-400">Automatically calculate PPH based on invoice line item keywords.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800" onClick={addPphRule}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
            <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleSavePphRules} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Rules
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Table>
            <TableHeader className="border-zinc-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-zinc-400">Tax Type</TableHead>
                <TableHead className="text-zinc-400">Rate (%)</TableHead>
                <TableHead className="text-zinc-400">Keywords (comma separated)</TableHead>
                <TableHead className="text-zinc-400">Target Role</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pphRules.map((rule, idx) => (
                <TableRow key={idx} className="border-zinc-800 hover:bg-zinc-800/20">
                  <TableCell>
                    <Select value={rule.pasal} onValueChange={(val) => updatePphRule(idx, 'pasal', val)}>
                      <SelectTrigger className="w-full bg-zinc-950 border-zinc-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="23">PPH 23</SelectItem>
                        <SelectItem value="4ayat2">PPH 4(2)</SelectItem>
                        <SelectItem value="22">PPH 22</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      className="bg-zinc-950 border-zinc-800 text-zinc-100" 
                      value={rule.rate_percent}
                      onChange={(e) => updatePphRule(idx, 'rate_percent', parseFloat(e.target.value) || 0)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="text" 
                      placeholder="e.g. jasa, servis, sewa"
                      className="bg-zinc-950 border-zinc-800 text-zinc-100" 
                      value={Array.isArray(rule.service_keyword) ? rule.service_keyword.join(', ') : rule.service_keyword}
                      onChange={(e) => updatePphRule(idx, 'service_keyword', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={rule.coa_role} onValueChange={(val) => updatePphRule(idx, 'coa_role', val)}>
                      <SelectTrigger className="w-full bg-zinc-950 border-zinc-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        {SYSTEM_ROLES.map(role => (
                          <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-red-400" onClick={() => removePphRule(idx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {pphRules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-6">
                    No withholding tax rules defined.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
