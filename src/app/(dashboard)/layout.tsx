'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Package,
  Hammer,
  ClipboardList,
  BarChart3,
  Settings,
  Share2,
  ChevronRight,
  LogOut,
  Building2,
  Check,
  User,
  Wallet,
  BookOpen,
  CreditCard,
  Tag
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useOutlet, OutletProvider } from '@/lib/contexts/outlet-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const sidebarGroups = [
  {
    name: 'Main',
    roles: ['owner', 'finance', 'cashier', 'kitchen'],
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    ]
  },
  {
    name: 'Finance & Procurement',
    roles: ['owner', 'finance'],
    items: [
      { name: 'Invoices', href: '/invoices', icon: FileText },
      { name: 'Accounting', href: '/accounting', icon: BookOpen },
      { name: 'Accounts Payable', href: '/accounting/ap', icon: CreditCard },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
    ]
  },
  {
    name: 'Operations',
    roles: ['owner', 'kitchen', 'finance'],
    items: [
      { name: 'Inventory', href: '/inventory', icon: Package },
      { name: 'Products', href: '/products', icon: Tag },
      { name: 'Production', href: '/production', icon: Hammer },
      { name: 'Opname', href: '/opname', icon: ClipboardList },
    ]
  },
  {
    name: 'Administration',
    roles: ['owner'],
    items: [
      { name: 'Integrations', href: '/integrations', icon: Share2 },
      { name: 'Settings', href: '/settings', icon: Settings },
    ]
  }
]

// ── Inner shell (consumes OutletProvider context) ────────────────────────────
function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { selectedOutletId, setSelectedOutletId, userRole, outlets, loading: outletLoading } = useOutlet()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [mounted, setMounted] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen bg-zinc-950">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-zinc-800 bg-zinc-900 transition-all duration-300',
          isSidebarOpen ? 'w-64' : 'w-20'
        )}
      >
        <div className="flex h-16 items-center px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900">
              <span className="text-xl font-bold italic">B</span>
            </div>
            {isSidebarOpen && (
              <span className="text-xl font-bold tracking-tight text-zinc-100">ByteSuite</span>
            )}
          </div>
        </div>

        <div className="px-4 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'w-full justify-start gap-3 border-zinc-800 bg-zinc-950 px-3 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-100',
                !isSidebarOpen && 'px-0 justify-center'
              )}
            >
              <Building2 className="h-4 w-4" />
              {isSidebarOpen && (
                <>
                  <span className="flex-1 truncate text-left">
                    {outletLoading ? 'Loading...' : selectedOutlet?.name || 'Select Outlet'}
                  </span>
                  <ChevronRight className="h-3 w-3 rotate-90 text-zinc-500" />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 border-zinc-800 bg-zinc-900 text-zinc-100"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>Switch Outlet</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
                {outlets.map((outlet) => (
                  <DropdownMenuItem
                    key={outlet.id}
                    onClick={() => setSelectedOutletId(outlet.id)}
                    className="flex items-center justify-between focus:bg-zinc-800 focus:text-zinc-100"
                  >
                    {outlet.name}
                    {selectedOutletId === outlet.id && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ScrollArea className="flex-1 px-4 py-4">
          <nav className="space-y-6">
            {sidebarGroups
              .filter(group => !userRole || group.roles.includes(userRole))
              .map((group) => (
                <div key={group.name} className="space-y-2">
                  {isSidebarOpen && (
                    <h3 className="px-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      {group.name}
                    </h3>
                  )}
                  <div className="space-y-1">
                    {mounted && group.items.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== '/' && pathname?.startsWith(item.href))
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-zinc-800 text-zinc-100'
                              : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100',
                            !isSidebarOpen && 'justify-center'
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                          {isSidebarOpen && <span>{item.name}</span>}
                        </Link>
                      )
                    })}
                    {!mounted && <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/50" />}
                  </div>
                </div>
              ))}
          </nav>
        </ScrollArea>

        <div className="p-4 space-y-2">
          <Separator className="mb-4 bg-zinc-800" />
          <Link href="/profile">
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-3 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100',
                !isSidebarOpen && 'justify-center'
              )}
            >
              <User className="h-5 w-5" />
              {isSidebarOpen && <span>Profile</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className={cn(
              'w-full justify-start gap-3 text-zinc-400 hover:bg-red-950/20 hover:text-red-400',
              !isSidebarOpen && 'justify-center'
            )}
          >
            <LogOut className="h-5 w-5" />
            {isSidebarOpen && <span>Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex h-16 items-center border-b border-zinc-800 bg-zinc-900/50 px-8 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-zinc-400 hover:text-zinc-100"
          >
            <ChevronRight
              className={cn('h-5 w-5 transition-transform', isSidebarOpen ? 'rotate-180' : 'rotate-0')}
            />
          </Button>
          <div className="ml-4 h-4 w-[1px] bg-zinc-800" />
          <h1 className="ml-6 text-sm font-medium text-zinc-400">
            {sidebarGroups
              .flatMap(g => g.items)
              .find((i) => pathname === i.href || (i.href !== '/' && pathname?.startsWith(i.href)))
              ?.name || 'Dashboard'}
          </h1>
        </header>
        <div className="flex-1 overflow-auto bg-zinc-950 p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </div>
      </main>
    </div>
  )
}

// ── Outer layout: provides the context, then renders the shell ───────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <OutletProvider>
      <DashboardShell>{children}</DashboardShell>
    </OutletProvider>
  )
}
