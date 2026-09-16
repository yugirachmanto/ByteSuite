'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CoaCombobox, type CoaType } from '@/components/ui/coa-combobox'
import { Button } from '@/components/ui/button'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { StepProps } from './types'

interface Mapping {
  account_role: string
  coa_id: string
}

const CORE_ROLES: { value: string; label: string; typeFilter: CoaType }[] = [
  { value: 'accounts_payable', label: 'Accounts Payable', typeFilter: 'liability' },
  { value: 'ppn_masukan', label: 'PPN Masukan (Input Tax)', typeFilter: 'asset' },
  { value: 'ppn_keluaran', label: 'PPN Keluaran (Output Tax)', typeFilter: 'liability' },
  { value: 'freight_expense', label: 'Freight/Transport Expense', typeFilter: 'expense' },
]

export function CoaMappingStep({ orgId, accounts, markDone }: StepProps) {
  const supabase = createClient()
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchMappings() {
      const { data } = await supabase.from('default_coa_mappings').select('account_role, coa_id').eq('org_id', orgId)
      setMappings(data || [])
      setLoading(false)
      if ((data || []).length >= CORE_ROLES.length) markDone()
    }
    fetchMappings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  const updateMapping = (role: string, coaId: string) => {
    setMappings(prev => {
      const existing = prev.find(m => m.account_role === role)
      if (existing) return prev.map(m => m.account_role === role ? { ...m, coa_id: coaId } : m)
      return [...prev, { account_role: role, coa_id: coaId }]
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const valid = mappings.filter(m => m.coa_id)
      await supabase.from('default_coa_mappings').delete().eq('org_id', orgId)
      if (valid.length > 0) {
        const { error } = await supabase.from('default_coa_mappings').insert(
          valid.map(m => ({ org_id: orgId, account_role: m.account_role, coa_id: m.coa_id }))
        )
        if (error) throw error
      }
      toast.success('Account mappings saved')
      markDone()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save mappings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-zinc-500"><Loader2 className="h-5 w-5 animate-spin mr-2 opacity-30" /> Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Review your Account Mappings</h2>
          <p className="text-sm text-zinc-400 mt-1">
            These were already set up automatically when you signed up. Review and adjust if
            needed — they control which accounts transactions post to.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
        {CORE_ROLES.map(role => {
          const currentVal = mappings.find(m => m.account_role === role.value)?.coa_id || ''
          return (
            <div key={role.value} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center border-b border-zinc-800/50 pb-4 last:border-0 last:pb-0">
              <label className="text-sm text-zinc-200">{role.label}</label>
              <CoaCombobox coas={accounts} value={currentVal} onChange={(val) => updateMapping(role.value, val)} placeholder="Select account..." typeFilter={role.typeFilter} />
            </div>
          )
        })}
      </div>

      <Button onClick={handleSave} disabled={saving} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Mappings
      </Button>
    </div>
  )
}
