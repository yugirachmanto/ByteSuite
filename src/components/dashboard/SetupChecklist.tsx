'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Circle, X, Landmark, Bot, Package, FileCheck } from 'lucide-react'

interface ChecklistItem {
  key: string
  label: string
  href: string
  icon: typeof Landmark
  done: boolean
}

// Four genuinely load-bearing setup steps — deliberately leaves out situational
// ones (team invites, extra outlets, payment/QRIS details) that aren't
// universal blockers. See the "Setup Ledger" onboarding plan for the full list.
export function SetupChecklist() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [items, setItems] = useState<ChecklistItem[] | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    async function check() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

      const currentOrgId = profile?.org_id
      if (!currentOrgId) { setLoading(false); return }
      setOrgId(currentOrgId)

      try {
        const dismissedOrgId = localStorage.getItem('setup_checklist_dismissed_org_id')
        if (dismissedOrgId === currentOrgId) setDismissed(true)
      } catch { /* localStorage unavailable, e.g. private browsing */ }

      const [mappingRes, integrationRes, itemRes, invoiceRes] = await Promise.all([
        supabase.from('default_coa_mappings').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId).eq('account_role', 'accounts_payable'),
        supabase.from('user_integrations').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('provider', 'openai').eq('is_active', true),
        supabase.from('item_master').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId),
        supabase.from('invoices').select('id, outlet_id, outlets!inner(org_id)', { count: 'exact', head: true }).eq('outlets.org_id', currentOrgId).eq('status', 'posted'),
      ])

      setItems([
        { key: 'mappings', label: 'Set up Account Mappings', href: '/settings/accounting', icon: Landmark, done: (mappingRes.count || 0) > 0 },
        { key: 'ai', label: 'Connect AI extraction', href: '/integrations', icon: Bot, done: (integrationRes.count || 0) > 0 },
        { key: 'items', label: 'Add your first item', href: '/products/new', icon: Package, done: (itemRes.count || 0) > 0 },
        { key: 'invoice', label: 'Post your first invoice', href: '/invoices/upload', icon: FileCheck, done: (invoiceRes.count || 0) > 0 },
      ])
      setLoading(false)
    }
    check()
  }, [supabase])

  const handleDismiss = () => {
    setDismissed(true)
    try {
      if (orgId) localStorage.setItem('setup_checklist_dismissed_org_id', orgId)
    } catch { /* localStorage unavailable */ }
  }

  if (loading || !items || dismissed) return null

  const doneCount = items.filter(i => i.done).length
  if (doneCount === items.length) return null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5">
      <button
        onClick={handleDismiss}
        className="absolute right-4 top-4 text-zinc-600 hover:text-zinc-300 transition-colors"
        aria-label="Dismiss setup checklist"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center justify-between pr-8 mb-4">
        <h3 className="text-sm font-semibold text-zinc-200">Finish setting up ByteSuite</h3>
        <span className="text-xs font-medium text-zinc-500">{doneCount} of {items.length} done</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {items.map(item => {
          const Icon = item.icon
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`group flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
                item.done
                  ? 'border-zinc-800/60 bg-zinc-900/30 text-zinc-500'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-indigo-500/40 hover:bg-zinc-900'
              }`}
            >
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-indigo-400" />
              )}
              <Icon className={`h-3.5 w-3.5 shrink-0 ${item.done ? 'text-zinc-600' : 'text-zinc-500'}`} />
              <span className={`text-xs font-medium ${item.done ? 'line-through' : ''}`}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
