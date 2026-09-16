'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Check, Circle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

import { ItemsStep } from '@/components/onboarding/ItemsStep'
import { OutletsStep } from '@/components/onboarding/OutletsStep'
import { WipStep } from '@/components/onboarding/WipStep'
import { ProductsStep } from '@/components/onboarding/ProductsStep'
import { BeginningInventoryStep } from '@/components/onboarding/BeginningInventoryStep'
import { VendorsStep } from '@/components/onboarding/VendorsStep'
import { InviteTeamStep } from '@/components/onboarding/InviteTeamStep'
import { CoaMappingStep } from '@/components/onboarding/CoaMappingStep'
import type { CoaOption, ItemOption, OutletOption, VendorOption } from '@/components/onboarding/types'

const STEPS = [
  { key: 'items', title: 'Items', subtitle: 'Bahan baku & packaging', Component: ItemsStep },
  { key: 'outlets', title: 'Outlets', subtitle: 'Additional locations', Component: OutletsStep },
  { key: 'wip', title: 'WIP', subtitle: 'Bahan setengah jadi', Component: WipStep },
  { key: 'products', title: 'Products', subtitle: 'Menu & recipes', Component: ProductsStep },
  { key: 'beginning_inventory', title: 'Beginning Inventory', subtitle: 'Opening stock balance', Component: BeginningInventoryStep },
  { key: 'vendors', title: 'Vendors', subtitle: 'Suppliers', Component: VendorsStep },
  { key: 'invite_team', title: 'Invite Team', subtitle: 'Add users', Component: InviteTeamStep },
  { key: 'coa_mapping', title: 'COA Mapping', subtitle: 'Review account roles', Component: CoaMappingStep },
] as const

type StepKey = typeof STEPS[number]['key']

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingWizard />
    </Suspense>
  )
}

function OnboardingWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(() => {
    const raw = parseInt(searchParams.get('step') || '1', 10)
    return Number.isFinite(raw) ? Math.min(Math.max(raw - 1, 0), STEPS.length - 1) : 0
  })
  const [doneMap, setDoneMap] = useState<Record<StepKey, boolean>>({} as any)

  const [accounts, setAccounts] = useState<CoaOption[]>([])
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [items, setItems] = useState<ItemOption[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
      const currentOrgId = profile?.org_id
      if (!currentOrgId) { setLoading(false); return }
      setOrgId(currentOrgId)

      const [accountsRes, outletsRes, itemsRes, vendorsRes] = await Promise.all([
        supabase.from('chart_of_accounts').select('id, code, name, is_header, type').eq('org_id', currentOrgId).eq('is_active', true).order('code'),
        supabase.from('outlets').select('id, name, address, timezone').eq('org_id', currentOrgId).order('name'),
        supabase.from('item_master').select('id, name, unit, purchase_unit, conversion_factor, category, is_inventory, default_coa_id').eq('org_id', currentOrgId).order('name'),
        supabase.from('vendors').select('id, name, email, phone').eq('org_id', currentOrgId).order('name'),
      ])

      setAccounts(accountsRes.data || [])
      setOutlets(outletsRes.data || [])
      setItems(itemsRes.data || [])
      setVendors(vendorsRes.data || [])

      await refreshStatus(currentOrgId)
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshStatus(currentOrgId: string) {
    const [itemsRes, outletsRes, wipRes, productsRes, invRes, vendorsRes, usersRes, mapRes] = await Promise.all([
      supabase.from('item_master').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId).in('category', ['raw', 'packaging']),
      supabase.from('outlets').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId),
      supabase.from('item_master').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId).eq('category', 'wip'),
      supabase.from('item_master').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId).eq('category', 'finished'),
      supabase.from('inventory_balance').select('outlet_id, outlets!inner(org_id)', { count: 'exact', head: true }).eq('outlets.org_id', currentOrgId).gt('qty_on_hand', 0),
      supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId),
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId),
      supabase.from('default_coa_mappings').select('id', { count: 'exact', head: true }).eq('org_id', currentOrgId),
    ])

    setDoneMap({
      items: (itemsRes.count || 0) > 0,
      outlets: (outletsRes.count || 0) > 1,
      wip: (wipRes.count || 0) > 0,
      products: (productsRes.count || 0) > 0,
      beginning_inventory: (invRes.count || 0) > 0,
      vendors: (vendorsRes.count || 0) > 0,
      invite_team: (usersRes.count || 0) > 1,
      coa_mapping: (mapRes.count || 0) >= 4,
    })
  }

  const markDone = (key: StepKey) => {
    setDoneMap(prev => ({ ...prev, [key]: true }))
    if (orgId) refreshStatus(orgId)
  }

  const goTo = (index: number) => {
    setCurrentStep(index)
    router.replace(`/onboarding?step=${index + 1}`)
  }

  const handleFinish = () => router.push('/dashboard')

  if (loading || !orgId) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...
      </div>
    )
  }

  const step = STEPS[currentStep]
  const StepComponent = step.Component
  const isLast = currentStep === STEPS.length - 1
  const doneCount = Object.values(doneMap).filter(Boolean).length

  return (
    <div className="flex h-screen">
      <aside className="hidden md:flex flex-col w-72 border-r border-zinc-800 bg-zinc-900/50 p-6 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900">
            <span className="text-base font-bold italic">B</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-zinc-100">ByteSuite</span>
        </div>
        <p className="text-xs text-zinc-500 mb-6">{doneCount} of {STEPS.length} steps done</p>

        <nav className="space-y-1 flex-1">
          {STEPS.map((s, idx) => {
            const done = doneMap[s.key]
            const canJump = idx <= currentStep || done
            const active = idx === currentStep
            return (
              <button
                key={s.key}
                disabled={!canJump}
                onClick={() => canJump && goTo(idx)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  active ? 'bg-zinc-800 text-zinc-100' : canJump ? 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200' : 'text-zinc-700 cursor-not-allowed'
                )}
              >
                {done ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className={cn('h-4 w-4 shrink-0', active ? 'text-indigo-400' : 'text-zinc-700')} />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{s.subtitle}</p>
                </div>
              </button>
            )
          })}
        </nav>

        <Button variant="ghost" onClick={handleFinish} className="text-zinc-500 hover:text-zinc-300 justify-start">
          <X className="mr-2 h-4 w-4" /> Skip setup for now
        </Button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex md:hidden items-center justify-between border-b border-zinc-800 px-4 py-3">
          <span className="text-sm font-medium text-zinc-300">{step.title} ({currentStep + 1}/{STEPS.length})</span>
          <Button variant="ghost" size="sm" onClick={handleFinish} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-auto p-6 md:p-10">
          <div className="mx-auto max-w-3xl">
            <StepComponent
              orgId={orgId}
              accounts={accounts}
              outlets={outlets}
              items={items}
              vendors={vendors}
              onItemCreated={(item) => setItems(prev => [...prev, item])}
              onOutletCreated={(outlet) => setOutlets(prev => [...prev, outlet])}
              onVendorCreated={(vendor) => setVendors(prev => [...prev, vendor])}
              markDone={() => markDone(step.key)}
            />
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-800 px-6 md:px-10 py-4">
          <Button variant="outline" disabled={currentStep === 0} onClick={() => goTo(currentStep - 1)} className="border-zinc-800 bg-zinc-900 text-zinc-300">
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => isLast ? handleFinish() : goTo(currentStep + 1)} className="text-zinc-500 hover:text-zinc-300">
              Skip this step
            </Button>
            {isLast ? (
              <Button onClick={handleFinish} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
                Finish Setup
              </Button>
            ) : (
              <Button onClick={() => goTo(currentStep + 1)} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
                Continue <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </footer>
      </main>
    </div>
  )
}
