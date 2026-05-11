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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Save } from 'lucide-react'
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

  const handleSaveMappings = async () => {
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
      toast.success('System accounts updated')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save mappings')
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
            <CardTitle className="text-zinc-100">System Accounts</CardTitle>
            <CardDescription className="text-zinc-400">Map specific roles to your chart of accounts for automated GL entries.</CardDescription>
          </div>
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200" onClick={handleSaveMappings} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Accounts
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {SYSTEM_ROLES.map(role => {
            const currentVal = mappings.find(m => m.account_role === role.value)?.coa_id || ''
            return (
              <div key={role.value} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center border-b border-zinc-800/50 pb-4 last:border-0 last:pb-0">
                <div>
                  <Label className="text-zinc-200">{role.label}</Label>
                  <p className="text-xs text-zinc-500 mt-1">Used for automatic posting of {role.label.toLowerCase()}.</p>
                </div>
                <Select value={currentVal || undefined} onValueChange={(val) => updateMapping(role.value, val)}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100">
                    <SelectValue placeholder="Select Account...">
                      {currentVal ? (
                        accounts.find(a => a.id === currentVal) 
                          ? `${accounts.find(a => a.id === currentVal)?.code} - ${accounts.find(a => a.id === currentVal)?.name}`
                          : currentVal
                      ) : 'Select Account...'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
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
                      <SelectTrigger className="bg-zinc-950 border-zinc-800">
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
                      <SelectTrigger className="bg-zinc-950 border-zinc-800">
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
