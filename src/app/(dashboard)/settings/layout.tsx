'use client'

import { Fragment } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tag,
  Layers,
  BookOpen,
  Landmark,
  CreditCard,
  Building2,
  Users,
  Upload,
  RotateCcw,
} from 'lucide-react'

const settingsGroups = [
  {
    label: 'Catalog',
    tabs: [
      { value: 'items', label: 'Items', href: '/settings', icon: Tag },
      { value: 'bom', label: 'BOM', href: '/settings/bom', icon: Layers },
    ],
  },
  {
    label: 'Accounting',
    tabs: [
      { value: 'coa', label: 'Chart of Accounts', href: '/settings/coa', icon: BookOpen },
      { value: 'accounting', label: 'Accounting Rules', href: '/settings/accounting', icon: Landmark },
      { value: 'pos-mapping', label: 'POS Mapping', href: '/settings/accounting/pos-mapping', icon: CreditCard },
    ],
  },
  {
    label: 'Organization',
    tabs: [
      { value: 'organization', label: 'Profile', href: '/settings/organization', icon: Building2 },
      { value: 'outlets', label: 'Outlets', href: '/settings/outlets', icon: Building2 },
      { value: 'users', label: 'Users', href: '/settings/users', icon: Users },
    ],
  },
  {
    label: 'Data',
    tabs: [
      { value: 'import', label: 'Data Import', href: '/settings/import', icon: Upload },
      { value: 'system', label: 'System Reset', href: '/settings/system', icon: RotateCcw },
    ],
  },
]

const settingsTabs = settingsGroups.flatMap((g) => g.tabs)

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const currentTab = settingsTabs.find(
    (t) => t.href === pathname
  )?.value || 'items'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Settings</h2>
        <p className="text-zinc-400 text-sm">Manage items, recipes, accounts, and users.</p>
      </div>

      <Tabs value={currentTab} onValueChange={(val) => {
        const tab = settingsTabs.find(t => t.value === val)
        if (tab) router.push(tab.href)
      }}>
        {/* Nine tabs across four groups don't fit one row on most screens —
            scrolls horizontally instead of wrapping or clipping. */}
        <div className="overflow-x-auto">
          <TabsList className="h-11 w-max min-w-full flex-nowrap items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5">
            {settingsGroups.map((group, groupIndex) => (
              <Fragment key={group.label}>
                {groupIndex > 0 && (
                  <div aria-hidden className="mx-1 h-6 w-px shrink-0 self-center bg-zinc-800" />
                )}
                {group.tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </Fragment>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {children}
    </div>
  )
}
