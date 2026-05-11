'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const settingsTabs = [
  { value: 'items', label: 'Items', href: '/settings' },
  { value: 'bom', label: 'BOM', href: '/settings/bom' },
  { value: 'coa', label: 'Chart of Accounts', href: '/settings/coa' },
  { value: 'accounting', label: 'Accounting Rules', href: '/settings/accounting' },
  { value: 'outlets', label: 'Outlets', href: '/settings/outlets' },
  { value: 'users', label: 'Users', href: '/settings/users' },
]

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
        <TabsList className="bg-zinc-900 border border-zinc-800">
          {settingsTabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {children}
    </div>
  )
}
